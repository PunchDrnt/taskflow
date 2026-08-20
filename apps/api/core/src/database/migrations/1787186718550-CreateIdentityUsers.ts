import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `identity.users` plus the system user, in one migration because neither is
 * usable without the other: every table's `created_by` is NOT NULL and points
 * here, so the row that rows created by the system point at has to exist
 * before any other table can be created.
 *
 * The first row references itself. Postgres allows that in a single INSERT as
 * long as the id is a literal rather than a default — the foreign key is
 * checked after the row lands, so there is nothing to defer.
 *
 * See .claude/docs/02-database.md#schema-identity
 */

/** Fixed so it is recognisable in logs and reproducible across environments. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

export class CreateIdentityUsers1787186718550 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // No org_id: a user belongs to many orgs through organization.members, so
    // the whole identity schema is outside org scoping.
    await queryRunner.query(`
      CREATE TABLE identity.users (
        id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        email                     citext      NOT NULL,
        password_hash             text,
        name                      text        NOT NULL,
        nickname                  text        NOT NULL,
        avatar_url                text,
        status                    text        NOT NULL DEFAULT 'active',
        is_system                 boolean     NOT NULL DEFAULT false,
        has_claimed_free_credits  boolean     NOT NULL DEFAULT false,
        free_org_count            integer     NOT NULL DEFAULT 0,

        created_at                timestamptz NOT NULL DEFAULT now(),
        created_by                uuid        NOT NULL,
        updated_at                timestamptz NOT NULL DEFAULT now(),
        updated_by                uuid        NOT NULL,
        deleted_at                timestamptz,
        deleted_by                uuid,

        CONSTRAINT users_status_check
          CHECK (status IN ('active', 'deactivated', 'pending_deletion', 'deleted')),

        -- The system user must not be able to authenticate. Enforced here
        -- rather than left to the login code, which is one bug away from
        -- letting someone in as the account that owns every automated write.
        CONSTRAINT users_system_has_no_password_check
          CHECK (NOT is_system OR password_hash IS NULL),

        -- Two delete markers exist on this table: deleted_at from the base
        -- entity, and status, which drives the real user lifecycle. Tie them
        -- together so they cannot disagree — a row with deleted_at set but
        -- status still 'active' would hold its email reserved forever, since
        -- the unique index below keys off status.
        CONSTRAINT users_deleted_at_matches_status_check
          CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),

        -- A soft delete must record who performed it. Half-set pairs are the
        -- kind of thing nobody notices until someone asks who deleted this.
        CONSTRAINT users_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)

    // Self-referencing, so they can only be added once the table exists.
    await queryRunner.query(`
      ALTER TABLE identity.users
        ADD CONSTRAINT users_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES identity.users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT users_updated_by_fkey
          FOREIGN KEY (updated_by) REFERENCES identity.users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT users_deleted_by_fkey
          FOREIGN KEY (deleted_by) REFERENCES identity.users(id) ON DELETE RESTRICT
    `)

    // Partial, not a plain UNIQUE: a deleted account must release its address
    // so the same person can sign up again. citext is already
    // case-insensitive, so no lower() wrapper.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_email_unique
        ON identity.users (email) WHERE status <> 'deleted'
    `)

    // Exactly one system user, enforced by the database rather than by the
    // seed being written only once.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_single_system_unique
        ON identity.users (is_system) WHERE is_system
    `)

    // ON DELETE RESTRICT does not protect this row. The system user's only
    // referrer is itself, and deleting it removes that reference in the same
    // statement, so Postgres allows it — verified, the DELETE succeeds and
    // takes every future created_by target with it. Other tables' foreign
    // keys will cover this once they exist, but not before, and not if the
    // system has yet to create anything.
    await queryRunner.query(`
      CREATE FUNCTION identity.forbid_system_user_delete() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION 'identity.users: the system user cannot be deleted (id=%)', OLD.id
          USING ERRCODE = 'restrict_violation';
      END;
      $fn$
    `)

    await queryRunner.query(`
      CREATE TRIGGER users_forbid_system_delete
        BEFORE DELETE ON identity.users
        FOR EACH ROW WHEN (OLD.is_system)
        EXECUTE FUNCTION identity.forbid_system_user_delete()
    `)

    await queryRunner.query(
      `
      INSERT INTO identity.users
        (id, email, password_hash, name, nickname, status, is_system, created_by, updated_by)
      VALUES
        ($1, 'system@taskflow.internal', NULL, 'System', 'System', 'active', true, $1, $1)
      `,
      [SYSTEM_USER_ID],
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE takes the trigger with it, but not the function it calls.
    await queryRunner.query(`DROP TABLE IF EXISTS identity.users`)
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS identity.forbid_system_user_delete()`,
    )
  }
}
