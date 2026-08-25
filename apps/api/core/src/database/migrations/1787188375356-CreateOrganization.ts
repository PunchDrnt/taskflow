import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The customer's top level. Everything below carries `org_id` and every
 * composite index leads with it. `organizations` itself does not — its would
 * always equal `id`, so OrgScopedRepository scopes this one table on `id`.
 *
 * Every FK into another org-scoped table is composite `(fk_id, org_id)`. A
 * denormalised `org_id` that can disagree with its parent's is worse than no
 * column at all: scoping filters on `org_id` alone, so a team_members row
 * labelled org A but pointing at a team in org B is returned to org A.
 * Verified — accepted without the composite key, rejected with it.
 *
 * No `owner_id`: it would have meant "who created it, not authority", which is
 * `created_by`, and permission lives in `members.role`.
 *
 * See docs/02-database/schema.md#schema-organization
 */
export class CreateOrganization1787188375356 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE organization.organizations (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        name        text        NOT NULL,
        slug        text        NOT NULL,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT organizations_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX organizations_slug_unique
        ON organization.organizations (slug) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE organization.members (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        -- Text, not an enum, so a new role is not a type migration. "At least
        -- one owner per org" is app-enforced: no single-row constraint says it.
        role        text        NOT NULL,

        -- joined_at is created_at under another name, so it is not repeated.
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX members_org_user_unique
        ON organization.members (org_id, user_id)
    `)
    // "Which orgs does this user belong to" — the reverse of the index above,
    // which cannot serve it because org_id leads.
    await queryRunner.query(`
      CREATE INDEX members_user_idx ON organization.members (user_id)
    `)

    await queryRunner.query(`
      CREATE TABLE organization.teams (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        name         text        NOT NULL,
        description  text,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT teams_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    // No new restriction — id is already unique. It gives child tables
    // something composite to point at.
    await queryRunner.query(`
      ALTER TABLE organization.teams
        ADD CONSTRAINT teams_id_org_unique UNIQUE (id, org_id)
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX teams_org_name_unique
        ON organization.teams (org_id, name) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE organization.team_members (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL,

        team_id     uuid        NOT NULL,
        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        role        text        NOT NULL,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

        -- Composite, so this row's org_id is provably the team's. Covers
        -- org_id → organizations transitively; hence no separate FK.
        CONSTRAINT team_members_team_fkey
          FOREIGN KEY (team_id, org_id)
          REFERENCES organization.teams (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX team_members_team_user_unique
        ON organization.team_members (team_id, user_id)
    `)
    // Group assignment resolves a team to its people.
    await queryRunner.query(`
      CREATE INDEX team_members_org_team_idx
        ON organization.team_members (org_id, team_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS organization.team_members`)
    await queryRunner.query(`DROP TABLE IF EXISTS organization.teams`)
    await queryRunner.query(`DROP TABLE IF EXISTS organization.members`)
    await queryRunner.query(`DROP TABLE IF EXISTS organization.organizations`)
  }
}
