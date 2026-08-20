import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * `audit.logs` — the activity log. The fastest-growing table here, so it is
 * partitioned by month from the first migration: converting a populated table
 * later means moving every row.
 *
 * The one table on no base entity. Postgres wants the partition key in every
 * unique constraint, so the pk is `(id, occurred_at)` — plain `PRIMARY KEY
 * (id)` will not create. `occurred_at`/`actor_id` cover created_at/created_by,
 * and rows are never updated or deleted, so the rest would be dead columns.
 *
 * No foreign keys at all, `actor_id` included: the log outlives what it
 * describes, and indexes carry the lookup weight instead.
 *
 * See docs/02-database.md#schema-audit
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

    // On the parent, so it propagates to partitions made later. No CHECK on
    // entity_type or action: both grow per feature, and validating one on a
    // table that is never deleted only gets more expensive.
    await queryRunner.query(`
      CREATE INDEX logs_entity_idx
        ON audit.logs (org_id, entity_type, entity_id, occurred_at DESC)
    `)
    // Drives the assignee picker — who this actor touched most recently.
    await queryRunner.query(`
      CREATE INDEX logs_actor_idx
        ON audit.logs (org_id, actor_id, action, occurred_at DESC)
    `)

    // In the database, so the job that calls it monthly does not have to
    // reproduce the naming and boundary arithmetic.
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

    // Last resort. Audit rows are written in the business transaction, so a
    // row with nowhere to land fails the user's operation rather than merely
    // losing a log entry.
    //
    // The cost: while a row for some month sits here, that month's partition
    // cannot be created — Postgres has to prove no default row belongs in the
    // new range. AuditPartitionService treats rows here as an alert.
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
