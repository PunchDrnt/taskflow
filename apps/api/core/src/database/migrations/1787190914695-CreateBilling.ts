import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `billing` schema. Created in Phase 0 and untouched by any code until
 * Phase 7 — the tables are cheap now and awkward to retrofit once the rest of
 * the schema has data. Details live in .claude/docs/05-saas-notes.md, which is
 * explicitly not committed to.
 *
 * `plans` is the documented second exception to the org_id rule: it is a
 * system-wide price list, not something an org owns. Everything else here is
 * org-scoped as usual.
 *
 * Money and quota columns are `numeric`, never `float` — see
 * .claude/docs/01-architecture.md#data-types
 */
export class CreateBilling1787190914695 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE billing.plans (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

        name           text        NOT NULL,
        max_users      integer,
        price_monthly  numeric     NOT NULL DEFAULT 0,
        price_yearly   numeric     NOT NULL DEFAULT 0,
        ai_multiplier  numeric     NOT NULL DEFAULT 1,
        ai_daily_limit integer,
        features_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,

        created_at     timestamptz NOT NULL DEFAULT now(),
        created_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at     timestamptz,
        deleted_by     uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT plans_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX plans_name_unique
        ON billing.plans (name) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE billing.subscriptions (
        id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id              uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        -- Single-column: plans has no org_id, so there is no pair to match.
        plan_id             uuid        NOT NULL REFERENCES billing.plans(id) ON DELETE RESTRICT,
        status              text        NOT NULL,
        current_period_end  timestamptz,
        seats_used          integer     NOT NULL DEFAULT 0,

        created_at          timestamptz NOT NULL DEFAULT now(),
        created_by          uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at          timestamptz NOT NULL DEFAULT now(),
        updated_by          uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at          timestamptz,
        deleted_by          uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT subscriptions_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX subscriptions_org_unique
        ON billing.subscriptions (org_id) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE billing.ai_wallet (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id         uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        source         text        NOT NULL,
        units_granted  numeric     NOT NULL DEFAULT 0,
        units_used     numeric     NOT NULL DEFAULT 0,
        period_key     text,
        expires_at     timestamptz,

        created_at     timestamptz NOT NULL DEFAULT now(),
        created_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at     timestamptz,
        deleted_by     uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT ai_wallet_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
        -- Spending more than was granted is a bug, not a state to record.
        CONSTRAINT ai_wallet_units_check
          CHECK (units_used >= 0 AND units_granted >= 0 AND units_used <= units_granted)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX ai_wallet_org_period_idx
        ON billing.ai_wallet (org_id, period_key)
    `)

    await queryRunner.query(`
      CREATE TABLE billing.ai_usage (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        user_id      uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        -- Plain dates: usage is bucketed by calendar day and week, and giving
        -- them a time would make the boundaries depend on the reader.
        period_day   date        NOT NULL,
        period_week  date        NOT NULL,
        tokens_in    bigint      NOT NULL DEFAULT 0,
        tokens_out   bigint      NOT NULL DEFAULT 0,
        feature      text        NOT NULL,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT ai_usage_tokens_check
          CHECK (tokens_in >= 0 AND tokens_out >= 0)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX ai_usage_org_day_idx
        ON billing.ai_usage (org_id, period_day, user_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS billing.ai_usage`)
    await queryRunner.query(`DROP TABLE IF EXISTS billing.ai_wallet`)
    await queryRunner.query(`DROP TABLE IF EXISTS billing.subscriptions`)
    await queryRunner.query(`DROP TABLE IF EXISTS billing.plans`)
  }
}
