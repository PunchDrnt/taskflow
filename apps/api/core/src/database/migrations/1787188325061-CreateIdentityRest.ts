import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The rest of the `identity` schema: sessions, password resets, and the
 * system-level RBAC tables.
 *
 * Nothing here has `org_id` — the whole schema is outside org scoping, since a
 * user belongs to many orgs through `organization.members` and a system role
 * crosses orgs by definition.
 *
 * The RBAC tables are created now but nothing reads them until Phase 7. They
 * are cheap to create and awkward to retrofit once `identity` has data.
 *
 * sessions and password_reset_tokens carry no deleted_at/deleted_by. Both
 * already have a column meaning "no longer usable" (revoked_at, used_at) and
 * both are hard-deleted by the retention policy, so a second delete marker
 * would only be one more thing to keep in sync.
 *
 * Base columns are written out in full rather than shared from a constant:
 * a migration is a historical record, and a shared snippet would silently
 * rewrite what past migrations did the next time someone edited it.
 *
 * See .claude/docs/02-database.md#schema-identity
 */
export class CreateIdentityRest1787188325061 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // One row per login from one device. Rotation does not insert a new row —
    // the row lives for the full 15 days and only its token hashes change.
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

    // System-level RBAC. Named without a system_ prefix — the identity schema
    // already supplies that context, and there is no clash with the org-level
    // role, which is a column on organization.members rather than a table.
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

    // Keys are defined in code (SYSTEM_PERMISSIONS) for type safety and seeded
    // from a migration; the role → permission mapping lives here so it can
    // change without a deploy.
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
        created_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at     timestamptz,
        deleted_by     uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT role_permissions_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX role_permissions_unique
        ON identity.role_permissions (role_id, permission_id) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE identity.user_roles (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
        role_id     uuid        NOT NULL REFERENCES identity.roles(id) ON DELETE CASCADE,
        -- Kept alongside created_by, which it would otherwise duplicate,
        -- because the two differ on delete: created_by is RESTRICT, so an
        -- account that had granted a role could never be removed. granted_by
        -- is SET NULL, so the grant outlives the admin who issued it.
        granted_by  uuid        REFERENCES identity.users(id) ON DELETE SET NULL,
        -- Temporary elevation for debugging, expiring on its own.
        expires_at  timestamptz,

        -- granted_at is created_at under another name, so it is not repeated.
        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT user_roles_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX user_roles_unique
        ON identity.user_roles (user_id, role_id) WHERE deleted_at IS NULL
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
    await queryRunner.query(`DROP TABLE IF EXISTS identity.sessions`)
  }
}
