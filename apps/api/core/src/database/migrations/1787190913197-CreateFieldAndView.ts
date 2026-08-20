import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `field` and `view` schemas (Phase 4).
 *
 * Custom field *values* live in `task.tasks.custom_fields`, a jsonb column
 * keyed by field UUID — there is no per-value table, and no FK from that jsonb
 * back to here, so deleting a definition leaves orphaned keys for the
 * application to sweep.
 *
 * See .claude/docs/02-database.md#schema-field-phase-4
 */
export class CreateFieldAndView1787190913197 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE field.definitions (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL,

        project_id   uuid        NOT NULL,
        name         text        NOT NULL,
        type         text        NOT NULL,
        -- Options for a select, min/max for a number, and so on.
        config_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
        sort_order   text        COLLATE "C" NOT NULL,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT definitions_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),

        CONSTRAINT definitions_project_fkey
          FOREIGN KEY (project_id, org_id)
          REFERENCES project.projects (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX definitions_project_name_unique
        ON field.definitions (project_id, name) WHERE deleted_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX definitions_project_order_idx
        ON field.definitions (org_id, project_id, sort_order)
    `)

    await queryRunner.query(`
      CREATE TABLE view.views (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL,

        project_id   uuid        NOT NULL,
        name         text        NOT NULL,
        type         text        NOT NULL,
        -- NULL means a shared view belonging to the project; a value makes it
        -- that person's private view.
        owner_id     uuid        REFERENCES identity.users(id) ON DELETE CASCADE,
        filter_json  jsonb       NOT NULL DEFAULT '{}'::jsonb,
        sort_json    jsonb       NOT NULL DEFAULT '{}'::jsonb,
        group_by     text,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT views_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),

        CONSTRAINT views_project_fkey
          FOREIGN KEY (project_id, org_id)
          REFERENCES project.projects (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      ALTER TABLE view.views ADD CONSTRAINT views_id_org_unique UNIQUE (id, org_id)
    `)
    await queryRunner.query(`
      CREATE INDEX views_project_idx ON view.views (org_id, project_id)
    `)

    await queryRunner.query(`
      CREATE TABLE view.columns (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL,

        view_id      uuid        NOT NULL,
        -- Discriminates what column_key means: a built-in field name, or the
        -- UUID of a field.definitions row.
        column_type  text        NOT NULL,
        column_key   text        NOT NULL,
        sort_order   text        COLLATE "C" NOT NULL,
        width        integer,
        is_visible   boolean     NOT NULL DEFAULT true,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT columns_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
        CONSTRAINT columns_width_check CHECK (width IS NULL OR width > 0),

        CONSTRAINT columns_view_fkey
          FOREIGN KEY (view_id, org_id)
          REFERENCES view.views (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX columns_view_key_unique
        ON view.columns (view_id, column_key) WHERE deleted_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX columns_view_order_idx
        ON view.columns (org_id, view_id, sort_order)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS view.columns`)
    await queryRunner.query(`DROP TABLE IF EXISTS view.views`)
    await queryRunner.query(`DROP TABLE IF EXISTS field.definitions`)
  }
}
