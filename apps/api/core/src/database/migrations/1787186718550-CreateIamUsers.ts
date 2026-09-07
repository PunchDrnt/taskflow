import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `iam.users` and the system user together, because neither is usable
 * without the other: `created_by` is NOT NULL everywhere and points here.
 *
 * The first row references itself, which Postgres allows in one INSERT as long
 * as the id is a literal — the FK is checked after the row lands.
 *
 * See docs/02-database/schema.md#schema-iam
 */

/** Fixed, so it is recognisable in logs and identical in every environment. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

export class CreateIamUsers1787186718550 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // No org_id: a user belongs to many orgs, so iam is outside scoping.
    await queryRunner.query(`
      CREATE TABLE iam.users (
        id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        email                     citext      NOT NULL,
        -- The other way to sign in. citext like email, so Anong and anong are
        -- the same account rather than two — a login identifier that is
        -- case-sensitive is a support ticket waiting to happen.
        username                  citext      NOT NULL,
        password_hash             text,
        name                      text        NOT NULL,
        -- Not the same thing as username and not a substitute for it: this is
        -- what colleagues call the person, it may repeat across the org, and
        -- the assignee picker searches and displays it so nobody is assigned
        -- to the wrong Somchai. docs/04-features/phase-1.md#auth--users.
        nickname                  text        NOT NULL,
        -- Profile data, not a credential. 2FA is TOTP, so nothing authenticates
        -- against this and it needs neither uniqueness nor verification.
        phone                     text,
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

        -- Login lockout. In the database rather than in memory: a counter a
        -- crash resets is a counter an attacker can reset, and it has to hold
        -- across instances. No CHECK on either — nothing else reads them.
        failed_login_attempts     integer     NOT NULL DEFAULT 0,
        locked_until              timestamptz,

        created_at                timestamptz NOT NULL DEFAULT now(),
        created_by                uuid        NOT NULL,
        updated_at                timestamptz NOT NULL DEFAULT now(),
        updated_by                uuid        NOT NULL,
        deleted_at                timestamptz,
        deleted_by                uuid,

        CONSTRAINT users_status_check
          CHECK (status IN ('active', 'deactivated', 'pending_deletion', 'deleted')),

        -- Narrow on purpose. A username appears in URLs and in @-mentions, so
        -- spaces, dots or unicode would make every consumer decide how to
        -- escape it, and confusable characters are how one person gets
        -- mistaken for another. 3-30 of [a-z0-9_], starting with a letter.
        --
        -- The ::text cast is load-bearing. citext makes the regex operator
        -- case-insensitive as well as equality — measured, not assumed — so
        -- without it Anong passes this check and is stored with its capital,
        -- giving one account two spellings across URLs and mentions. Cast
        -- first and the pattern means what it reads like: stored lower case,
        -- matched case-insensitively by the column type.
        CONSTRAINT users_username_format_check
          CHECK (username::text ~ '^[a-z][a-z0-9_]{2,29}$'),

        -- E.164 without the punctuation: a leading + and 8-15 digits. Stored
        -- one way so that two people who typed 08x-xxx and +66 8x xxx are
        -- comparable at all. Nullable — most rows will not have one.
        CONSTRAINT users_phone_format_check
          CHECK (phone IS NULL OR phone ~ '^\\+[1-9][0-9]{7,14}$'),

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
      ALTER TABLE iam.users
        ADD CONSTRAINT users_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES iam.users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT users_updated_by_fkey
          FOREIGN KEY (updated_by) REFERENCES iam.users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT users_deleted_by_fkey
          FOREIGN KEY (deleted_by) REFERENCES iam.users(id) ON DELETE RESTRICT
    `)

    // Partial, so a deleted account releases its address. citext already
    // folds case — no lower() wrapper.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_email_unique
        ON iam.users (email) WHERE status <> 'deleted'
    `)

    // Same partial shape as email, and for the same reason: a deleted account
    // releases the name for somebody else, but only after the thirty-day
    // window in which its owner can still come back.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_username_unique
        ON iam.users (username) WHERE status <> 'deleted'
    `)

    // Unique like email, and partial for the same reason: nobody may hold two
    // live accounts on one number. Postgres allows any number of NULLs in a
    // unique index, so the many rows with no phone do not collide.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_phone_unique
        ON iam.users (phone) WHERE status <> 'deleted'
    `)

    // One system user, enforced by the database, not by the seed running once.
    await queryRunner.query(`
      CREATE UNIQUE INDEX users_single_system_unique
        ON iam.users (is_system) WHERE is_system
    `)

    // RESTRICT does not protect this row: its only referrer is itself, and the
    // DELETE removes that reference in the same statement — verified, it
    // succeeds. Other tables' FKs only cover it once they have system rows.
    await queryRunner.query(`
      CREATE FUNCTION iam.forbid_system_user_delete() RETURNS trigger
      LANGUAGE plpgsql AS $fn$
      BEGIN
        RAISE EXCEPTION 'iam.users: the system user cannot be deleted (id=%)', OLD.id
          USING ERRCODE = 'restrict_violation';
      END;
      $fn$
    `)

    await queryRunner.query(`
      CREATE TRIGGER users_forbid_system_delete
        BEFORE DELETE ON iam.users
        FOR EACH ROW WHEN (OLD.is_system)
        EXECUTE FUNCTION iam.forbid_system_user_delete()
    `)

    await queryRunner.query(
      `
      INSERT INTO iam.users
        (id, email, username, password_hash, name, nickname, status, is_system, created_by, updated_by)
      VALUES
        ($1, 'system@taskflow.internal', 'system', NULL, 'System', 'System', 'active', true, $1, $1)
      `,
      [SYSTEM_USER_ID],
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // DROP TABLE takes the trigger with it, but not the function it calls.
    await queryRunner.query(`DROP TABLE IF EXISTS iam.users`)
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS iam.forbid_system_user_delete()`,
    )
  }
}
