import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `identity.users` and the system user together, because neither is usable
 * without the other: `created_by` is NOT NULL everywhere and points here.
 *
 * The first row references itself, which Postgres allows in one INSERT as long
 * as the id is a literal — the FK is checked after the row lands.
 *
 * See docs/02-database.md#schema-identity
 */

/** Fixed, so it is recognisable in logs and identical in every environment. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

export class CreateIdentityUsers1787186718550 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // No org_id: a user belongs to many orgs, so identity is outside scoping.
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

        -- When this person asked to be deleted, which starts the thirty-day
        -- window they can still change their mind in. deleted_at cannot serve
        -- here: it marks the far end of that window, and it is a
        -- @DeleteDateColumn, so setting it would hide the row from every
        -- query during exactly the month it has to stay findable.
        deletion_requested_at     timestamptz,

        created_at                timestamptz NOT NULL DEFAULT now(),
        created_by                uuid        NOT NULL,
        updated_at                timestamptz NOT NULL DEFAULT now(),
        updated_by                uuid        NOT NULL,
        deleted_at                timestamptz,
        deleted_by                uuid,

        CONSTRAINT users_status_check
          CHECK (status IN ('active', 'deactivated', 'pending_deletion', 'deleted')),

        -- Enforced here, not in the login code, which is one bug away from
        -- letting someone in as the account that owns every automated write.
        CONSTRAINT users_system_has_no_password_check
          CHECK (NOT is_system OR password_hash IS NULL),

        -- Two delete markers on one table: deleted_at, and status, which
        -- drives the real lifecycle. Untied, a row could hold its email
        -- reserved forever — the unique index below keys off status.
        CONSTRAINT users_deleted_at_matches_status_check
          CHECK ((status = 'deleted') = (deleted_at IS NOT NULL)),

        -- Nobody notices a half-set pair until they ask who deleted this.
        CONSTRAINT users_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),

        -- The other end of the same lifecycle. Retention counts thirty days
        -- from here: missing, and the row is never anonymised; left behind on
        -- a recovered account, and it anonymises someone who came back.
        CONSTRAINT users_deletion_requested_matches_status_check
          CHECK ((status = 'pending_deletion') = (deletion_requested_at IS NOT NULL))
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

    // Partial, so a deleted account releases its address. citext already
    // folds case — no lower() wrapper.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_email_unique
        ON identity.users (email) WHERE status <> 'deleted'
    `)

    // One system user, enforced by the database, not by the seed running once.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_single_system_unique
        ON identity.users (is_system) WHERE is_system
    `)

    // RESTRICT does not protect this row: its only referrer is itself, and the
    // DELETE removes that reference in the same statement — verified, it
    // succeeds. Other tables' FKs only cover it once they have system rows.
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
