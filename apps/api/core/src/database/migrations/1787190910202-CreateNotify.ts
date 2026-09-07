import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `notify` schema — two tables answering two different questions.
 * `outbox` is "has it been sent", read by a worker and deleted once it has;
 * `notifications` is "have they read it", read by the person it is for and
 * kept until retention takes it. Both are written inside the business
 * transaction, so a failed send never rolls back the thing it announced.
 *
 * Neither carries `deleted_at`/`deleted_by`: `status` and `read_at` already
 * say where a row is in its life, and retention hard-deletes both. Two delete
 * markers on one table can disagree.
 *
 * See .claude/docs/02-database/schema.md#schema-notify
 */
export class CreateNotify1787190910202 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notify.outbox (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        -- Nullable, and the only org_id in the codebase that is. Almost every
        -- row here belongs to one org — a task was assigned, somebody was
        -- mentioned — but a password-reset mail belongs to the *account*: the
        -- recipient may be in several organisations or in none, and picking
        -- one would file the message under a company with nothing to do with
        -- it. That is the exemption docs/00-overview.md#binding-decisions
        -- already states, applied per row rather than per table.
        --
        -- Nothing reads this column scoped today: OutboxWorker crosses orgs on
        -- purpose and selects on status. A future per-org view would filter on
        -- org_id, which correctly leaves the account-level rows out.
        org_id        uuid        REFERENCES organization.organizations(id) ON DELETE CASCADE,

        recipient_id  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        channel       text        NOT NULL,
        template      text        NOT NULL,
        payload_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
        status        text        NOT NULL DEFAULT 'pending',
        attempts      integer     NOT NULL DEFAULT 0,
        sent_at       timestamptz,
        last_error    text,

        created_at    timestamptz NOT NULL DEFAULT now(),
        created_by    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        updated_by    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

        -- The partial index below reads this literal. A typo drops the row
        -- out of the worker's queue silently, and it is never sent.
        CONSTRAINT outbox_status_check
          CHECK (status IN ('pending', 'sent', 'failed'))
      )
    `)
    // The worker's queue. Partial, so it stays small no matter how many sent
    // rows are waiting on the retention job.
    await queryRunner.query(`
      CREATE INDEX outbox_pending_idx
        ON notify.outbox (status, created_at) WHERE status = 'pending'
    `)

    // The in-app inbox (Phase 3). entity_type/entity_id are polymorphic and
    // carry no FK, the same shape audit.logs uses — a notification can point
    // at a task, a comment, or whatever Phase 3 adds next.
    await queryRunner.query(`
      CREATE TABLE notify.notifications (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id        uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        recipient_id  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        type          text        NOT NULL,
        -- NULL means the system did it: the cron that warns about a due date
        -- has no actor to name.
        actor_id      uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,
        entity_type   text        NOT NULL,
        entity_id     uuid        NOT NULL,
        -- Enough to render the line without joining anything.
        payload_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
        read_at       timestamptz,

        created_at    timestamptz NOT NULL DEFAULT now(),
        created_by    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at    timestamptz NOT NULL DEFAULT now(),
        updated_by    uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT
      )
    `)
    // The inbox itself, newest first.
    await queryRunner.query(`
      CREATE INDEX notifications_recipient_idx
        ON notify.notifications (org_id, recipient_id, created_at DESC)
    `)
    // The unread count on the bell, which every page asks for.
    await queryRunner.query(`
      CREATE INDEX notifications_unread_idx
        ON notify.notifications (org_id, recipient_id) WHERE read_at IS NULL
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notify.notifications`)
    await queryRunner.query(`DROP TABLE IF EXISTS notify.outbox`)
  }
}
