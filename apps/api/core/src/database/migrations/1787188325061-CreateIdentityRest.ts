import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The rest of `identity`: sessions, password resets, system-level RBAC.
 * Nothing here has `org_id` — a user belongs to many orgs and a system role
 * crosses them by definition. The RBAC tables wait for Phase 7 to be read.
 *
 * sessions and password_reset_tokens have no deleted_at/deleted_by: both
 * already carry a column meaning "no longer usable" and both are hard-deleted
 * by retention, so a second marker is one more thing to keep in sync.
 *
 * Base columns are written out in full rather than shared from a constant — a
 * migration is a record, and an edited snippet would rewrite the past.
 *
 * See docs/02-database/schema.md#schema-identity
 */
export class CreateIdentityRest1787188325061 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // One row per login per device, living the full 15 days; rotation only
    // changes its token hashes.
    await queryRunner.query(`
      CREATE TABLE identity.sessions (
        id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        user_id              uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        current_token_hash   text        NOT NULL,
        previous_token_hash  text,
        rotated_at           timestamptz,
        user_agent           text        NOT NULL,
        ip_address           inet        NOT NULL,
        last_used_at         timestamptz NOT NULL DEFAULT now(),
        expires_at           timestamptz NOT NULL,
        revoked_at           timestamptz,
        revoked_reason       text,

        -- created_by is not the same as user_id: an admin holding
        -- user.impersonate creates a session for someone else.
        created_at           timestamptz NOT NULL DEFAULT now(),
        created_by           uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at           timestamptz NOT NULL DEFAULT now(),
        updated_by           uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    // The hot path: look up a live session by the token just presented.
    await queryRunner.query(`
      CREATE INDEX sessions_current_token_idx
        ON identity.sessions (current_token_hash) WHERE revoked_at IS NULL
    `)
    // "Log out everywhere" and the active-devices list.
    await queryRunner.query(`
      CREATE INDEX sessions_user_idx ON identity.sessions (user_id, revoked_at)
    `)
    // Catches a stolen refresh token being replayed after rotation.
    await queryRunner.query(`
      CREATE INDEX sessions_previous_token_idx
        ON identity.sessions (previous_token_hash) WHERE previous_token_hash IS NOT NULL
    `)

    await queryRunner.query(`
      CREATE TABLE identity.password_reset_tokens (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        token_hash  text        NOT NULL,
        expires_at  timestamptz NOT NULL,
        used_at     timestamptz,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`
      CREATE INDEX password_reset_tokens_hash_idx
        ON identity.password_reset_tokens (token_hash) WHERE used_at IS NULL
    `)

    // Migrated in Phase 1, read by nobody until Google login is switched on —
    // the same pattern as the four RBAC tables below, which have been here
    // since Phase 0. See docs/02-database/schema.md#schema-identity.
    await queryRunner.query(`
      CREATE TABLE identity.oauth_accounts (
        id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        -- CASCADE, and it will never fire. identity.users is NEVER_PURGED and
        -- anonymising is an UPDATE, so the rows outlive the person unless the
        -- anonymise path deletes them itself. Kept as a net for a real org
        -- teardown; must not be relied on. See the warning in schema.md.
        user_id           uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        provider          text        NOT NULL,
        -- The provider's own subject id, not the email: an email can change
        -- hands, and matching on it would hand the account over with it.
        provider_user_id  text        NOT NULL,
        -- What the provider said the address was when this was linked. For
        -- tracing back, never for matching.
        provider_email    text,

        created_at        timestamptz NOT NULL DEFAULT now(),
        created_by        uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT oauth_accounts_provider_check
          CHECK (provider IN ('google'))
      )
    `)

    // Plain UNIQUE rather than partial, because this table is hard-deleted:
    // unlink and the row is gone, so there is no `deleted_at IS NULL` for a
    // login query to forget — and forgetting it would let somebody who
    // unlinked sign back in. Same reasoning as CreatedEntity in rules.md.
    await queryRunner.query(`
      CREATE UNIQUE INDEX oauth_accounts_provider_user_unique
        ON identity.oauth_accounts (provider, provider_user_id)
    `)
    // One linked account per provider per person. Relaxing it later is a drop.
    await queryRunner.query(`
      CREATE UNIQUE INDEX oauth_accounts_user_provider_unique
        ON identity.oauth_accounts (user_id, provider)
    `)

    // No system_ prefix: the schema supplies that context, and the org-level
    // role is a column on organization.members, not a table.
    await queryRunner.query(`
      CREATE TABLE identity.roles (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        name         text        NOT NULL,
        description  text,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT roles_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    // Partial, not UNIQUE: a plain unique constraint would reserve the name of
    // a soft-deleted role forever.
    await queryRunner.query(`
      CREATE UNIQUE INDEX roles_name_unique
        ON identity.roles (name) WHERE deleted_at IS NULL
    `)

    // Keys are defined in code (SYSTEM_PERMISSIONS) for type safety and
    // inserted by database/seed/required.ts, which runs on every deploy; the
    // role → permission mapping lives here so it can change without one.
    await queryRunner.query(`
      CREATE TABLE identity.permissions (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        key          text        NOT NULL,
        description  text,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT permissions_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX permissions_key_unique
        ON identity.permissions (key) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE identity.role_permissions (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        role_id        uuid        NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
        permission_id  uuid        NOT NULL REFERENCES identity.permissions(id) ON DELETE CASCADE,

        created_at     timestamptz NOT NULL DEFAULT now(),
        created_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX role_permissions_unique
        ON identity.role_permissions (role_id, permission_id)
    `)

    await queryRunner.query(`
      CREATE TABLE identity.user_roles (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        role_id     uuid        NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
        -- Duplicates created_by except on delete: that one is RESTRICT, this
        -- is SET NULL, so the grant outlives the admin who issued it.
        granted_by  uuid        REFERENCES identity.users(id) ON DELETE SET NULL,
        -- Temporary elevation for debugging, expiring on its own.
        expires_at  timestamptz,

        -- granted_at is created_at under another name, so it is not repeated.
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX user_roles_unique
        ON identity.user_roles (user_id, role_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_roles`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity.role_permissions`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity.permissions`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity.roles`)
    await queryRunner.query(
      `DROP TABLE IF EXISTS identity.password_reset_tokens`,
    )
    await queryRunner.query(`DROP TABLE IF EXISTS identity.oauth_accounts`)
    await queryRunner.query(`DROP TABLE IF EXISTS identity.sessions`)
  }
}
