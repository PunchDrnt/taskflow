import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `organization` schema — the customer's top level. Everything below this
 * point carries `org_id`, and every composite index leads with it.
 *
 * `organizations.org_id` is the org's own id, not a parent's. It looks
 * redundant, but the base entity is on every table without exception, and the
 * repository layer filters on `org_id` blindly — a table missing the column
 * would need a special case in exactly the code path that must not have one.
 *
 * See .claude/docs/02-database.md#schema-organization
 */
export class CreateOrganization1787188375356 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE organization.organizations (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL,

        name        text        NOT NULL,
        slug        text        NOT NULL,
        -- Who created it. Not authority — permission lives in members.role,
        -- and an org can have several owners.
        owner_id    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        -- An org is its own scope.
        CONSTRAINT organizations_org_id_is_self_check CHECK (org_id = id)
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
        joined_at   timestamptz NOT NULL DEFAULT now(),

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT
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
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX teams_org_name_unique
        ON organization.teams (org_id, name) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE organization.team_members (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        team_id     uuid        NOT NULL REFERENCES organization.teams(id) ON DELETE CASCADE,
        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        role        text        NOT NULL,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT
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
