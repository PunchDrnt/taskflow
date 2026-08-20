import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `organization` schema — the customer's top level. Everything below this
 * point carries `org_id`, and every composite index leads with it.
 *
 * `organizations` itself does not: its `org_id` would always equal its `id`.
 * OrgScopedRepository therefore scopes this one table on `id` instead, which
 * is a single deliberate case rather than a column every row carries twice.
 *
 * Every FK into another org-scoped table is composite — `(fk_id, org_id)`
 * rather than `(fk_id)`. A denormalised `org_id` that can disagree with its
 * parent's is worse than no column at all: OrgScopedRepository filters on
 * `org_id` alone, so a team_members row labelled org A pointing at a team in
 * org B is returned to org A. Verified that this is accepted without the
 * composite key and rejected with it.
 *
 * There is no `owner_id` either. The spec described it as "who created it, not
 * authority" — permission lives in `members.role` — which is exactly what
 * `created_by` already records, with the same ON DELETE RESTRICT.
 *
 * See .claude/docs/02-database.md#schema-organization
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
        -- Plain text, not an enum: adding a role later should not need a type
        -- migration. At least one 'owner' row must exist per org, which no
        -- single-row constraint can express — the application enforces it and
        -- a test covers it.
        role        text        NOT NULL,

        -- joined_at is created_at under another name, so it is not repeated.
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT members_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX members_org_user_unique
        ON organization.members (org_id, user_id) WHERE deleted_at IS NULL
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
    // id alone is already unique, so this adds no restriction. It exists to
    // give child tables something composite to point at.
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
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT team_members_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),

        -- Composite, so the row's org_id is provably the team's org_id.
        -- This also covers org_id → organizations transitively, which is why
        -- there is no separate FK on it.
        CONSTRAINT team_members_team_fkey
          FOREIGN KEY (team_id, org_id)
          REFERENCES organization.teams (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX team_members_team_user_unique
        ON organization.team_members (team_id, user_id) WHERE deleted_at IS NULL
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
