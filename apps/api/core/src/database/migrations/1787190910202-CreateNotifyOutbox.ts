import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `notify.outbox` — notifications are written here inside the business
 * transaction and delivered by a worker afterwards, so a failed send never
 * rolls back the thing it was announcing.
 *
 * No `deleted_at`/`deleted_by`: `status` already says where a row is in its
 * life, and the retention policy hard-deletes sent rows after 30 days. Two
 * delete markers on one table can disagree.
 *
 * See .claude/docs/02-database.md#schema-notify
 */
export class CreateNotifyOutbox1787190910202 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notify.outbox (
        id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id        uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

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

        -- The worker's queue is the partial index below, which reads this
        -- literal value. A typo would drop the row out of it silently and the
        -- notification would simply never be sent.
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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS notify.outbox`)
  }
}
