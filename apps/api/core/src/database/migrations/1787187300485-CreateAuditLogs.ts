import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `audit.logs` — the activity log feature. The fastest-growing table in the
 * system, so it is partitioned by month from the very first migration:
 * converting a populated table later means moving every row.
 *
 * The one table that does not use the base entity. Postgres requires the
 * partition key in every unique constraint, so the primary key is
 * `(id, occurred_at)` rather than `(id)` — a plain `PRIMARY KEY (id)` does not
 * create at all. `occurred_at` and `actor_id` already say when and by whom, so
 * created_at/created_by would be duplicates, and audit rows are never updated
 * or deleted, which leaves updated_* and deleted_* meaningless.
 *
 * No foreign keys, including `actor_id`: the log has to survive the rows it
 * describes. Indexes carry the lookup weight instead.
 *
 * See .claude/docs/02-database.md#schema-audit
 */

/** Partitions created ahead of time, so a stalled job has a year of slack. */
const MONTHS_AHEAD = 12

export class CreateAuditLogs1787187300485 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit.logs (
        id            uuid        NOT NULL DEFAULT gen_random_uuid(),
        org_id        uuid        NOT NULL,

        entity_type   text        NOT NULL,
        entity_id     uuid        NOT NULL,
        actor_id      uuid        NOT NULL,
        action        text        NOT NULL,
        changes_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
        occurred_at   timestamptz NOT NULL DEFAULT now(),

        -- Not PRIMARY KEY (id). Postgres requires the partition key in every
        -- unique constraint on a partitioned table.
        PRIMARY KEY (id, occurred_at)
      ) PARTITION BY RANGE (occurred_at)
    `)

    // Declared on the parent, which propagates to every partition including
    // ones created later. No CHECK on entity_type or action: both grow with
    // every feature, and this table is never deleted, so validating a new
    // constraint only gets more expensive.
    await queryRunner.query(`
      CREATE INDEX logs_entity_idx
        ON audit.logs (org_id, entity_type, entity_id, occurred_at DESC)
    `)
    // Drives the assignee picker — who this actor touched most recently.
    await queryRunner.query(`
      CREATE INDEX logs_actor_idx
        ON audit.logs (org_id, actor_id, action, occurred_at DESC)
    `)

    // Creating a partition is a schedulable job's whole task, so it lives in
    // the database rather than in application code that has to reproduce the
    // naming and boundary arithmetic correctly.
    await queryRunner.query(`
      CREATE FUNCTION audit.ensure_month_partition(target date)
        RETURNS text
        LANGUAGE plpgsql AS $fn$
      DECLARE
        start_at date := date_trunc('month', target)::date;
        end_at   date := (date_trunc('month', target) + interval '1 month')::date;
        part     text := format('logs_%s', to_char(start_at, 'YYYY_MM'));
      BEGIN
        IF to_regclass('audit.' || quote_ident(part)) IS NOT NULL THEN
          RETURN part;
        END IF;

        EXECUTE format(
          'CREATE TABLE audit.%I PARTITION OF audit.logs FOR VALUES FROM (%L) TO (%L)',
          part, start_at, end_at
        );
        RETURN part;
      END;
      $fn$
    `)

    for (let offset = 0; offset < MONTHS_AHEAD; offset += 1) {
      await queryRunner.query(
        `SELECT audit.ensure_month_partition((date_trunc('month', now()) + make_interval(months => $1))::date)`,
        [offset],
      )
    }

    // Last-resort catch-all. Audit rows are written in the same transaction as
    // the business logic they describe, so a row with no partition to land in
    // does not just lose a log entry — it fails the user's operation. This
    // makes a missed partition survivable.
    //
    // The cost: while any row sits here for a given month, the partition for
    // that month cannot be created, because Postgres has to prove no default
    // row belongs in the new range. Treat rows in this table as an alert, and
    // move them out before creating the partition they belong to.
    await queryRunner.query(`
      CREATE TABLE audit.logs_default PARTITION OF audit.logs DEFAULT
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drops every partition with it.
    await queryRunner.query(`DROP TABLE IF EXISTS audit.logs`)
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS audit.ensure_month_partition(date)`,
    )
  }
}
