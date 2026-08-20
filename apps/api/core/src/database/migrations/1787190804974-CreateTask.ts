import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `task` schema. A task always lives in a project and may nest one level
 * (two in Phase 5) via `parent_task_id` — a sub-task is a full task with its
 * own status and assignees, not a checklist item.
 *
 * Four of the five foreign keys here are composite `(fk_id, org_id)`, so no
 * task can reference a project, status, sprint or parent from another org.
 * `sprint_id` uses `ON DELETE SET NULL (sprint_id)`: without the column list
 * Postgres would null `org_id` too, and `org_id` is NOT NULL.
 *
 * See .claude/docs/02-database.md#schema-task
 */
export class CreateTask1787190804974 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE task.tasks (
        id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id          uuid        NOT NULL,

        project_id      uuid        NOT NULL,
        title           text        NOT NULL,
        description     text,
        status_id       uuid        NOT NULL,
        priority        text,
        -- UTC, rendered in the reader's timezone by the frontend.
        due_date        timestamptz,
        sort_order      text        COLLATE "C" NOT NULL,

        parent_task_id  uuid,
        -- Derived from the parent on insert. Kept as a column so depth limits
        -- and "root tasks only" queries do not need a recursive CTE.
        depth           integer     NOT NULL DEFAULT 0,

        completed_by    uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,
        completed_at    timestamptz,

        -- NULL means Backlog.
        sprint_id       uuid,
        estimate        numeric,
        -- Keyed by field UUID rather than field name, so renaming a custom
        -- field does not orphan every value. (Phase 4)
        custom_fields   jsonb       NOT NULL DEFAULT '{}'::jsonb,

        created_at      timestamptz NOT NULL DEFAULT now(),
        created_by      uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at      timestamptz NOT NULL DEFAULT now(),
        updated_by      uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at      timestamptz,
        deleted_by      uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT tasks_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
        -- The spec says these reset together when a task leaves a done status.
        CONSTRAINT tasks_completed_pair_check
          CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
        -- depth is 0 exactly when there is no parent.
        CONSTRAINT tasks_depth_matches_parent_check
          CHECK ((parent_task_id IS NULL) = (depth = 0)),
        CONSTRAINT tasks_depth_non_negative_check
          CHECK (depth >= 0),
        -- Matches MAX_TASK_DEPTH in @repo/shared: 1 means two levels, a task
        -- and a sub-task. Raising it is a migration, not a constant edit —
        -- spelled out here rather than imported, because a migration that
        -- changes meaning when someone edits a shared file is not a record of
        -- what was done. A test asserts the two still agree.
        CONSTRAINT tasks_depth_within_limit_check
          CHECK (depth <= 1),
        -- A sub-task rides its parent's sprint rather than holding its own.
        CONSTRAINT tasks_subtask_has_no_sprint_check
          CHECK (depth = 0 OR sprint_id IS NULL),
        -- A task cannot be its own parent.
        CONSTRAINT tasks_not_own_parent_check
          CHECK (parent_task_id IS DISTINCT FROM id),

        -- RESTRICT: a project or status still holding tasks must be emptied
        -- deliberately, not silently taken down with them.
        CONSTRAINT tasks_project_fkey
          FOREIGN KEY (project_id, org_id)
          REFERENCES project.projects (id, org_id) ON DELETE RESTRICT,
        CONSTRAINT tasks_status_fkey
          FOREIGN KEY (status_id, org_id)
          REFERENCES project.statuses (id, org_id) ON DELETE RESTRICT,
        -- Deleting a sprint drops its tasks back to Backlog. The column list
        -- is required: a bare SET NULL would also null org_id.
        CONSTRAINT tasks_sprint_fkey
          FOREIGN KEY (sprint_id, org_id)
          REFERENCES project.sprints (id, org_id) ON DELETE SET NULL (sprint_id)
      )
    `)

    // Self-referencing, so it can only be added once the table exists. Also
    // the target of task.assignees.
    await queryRunner.query(`
      ALTER TABLE task.tasks ADD CONSTRAINT tasks_id_org_unique UNIQUE (id, org_id)
    `)
    await queryRunner.query(`
      ALTER TABLE task.tasks
        ADD CONSTRAINT tasks_parent_fkey
        FOREIGN KEY (parent_task_id, org_id)
        REFERENCES task.tasks (id, org_id) ON DELETE CASCADE
    `)

    // The board and list views: tasks of a project grouped by status.
    await queryRunner.query(`
      CREATE INDEX tasks_project_status_idx
        ON task.tasks (org_id, project_id, status_id)
    `)
    await queryRunner.query(`
      CREATE INDEX tasks_parent_idx ON task.tasks (org_id, parent_task_id)
    `)
    await queryRunner.query(`
      CREATE INDEX tasks_sprint_idx ON task.tasks (org_id, sprint_id)
    `)
    // A GIN index on custom_fields belongs with Phase 4, when something
    // actually queries it — until then it would only slow every write down.

    await queryRunner.query(`
      CREATE TABLE task.assignees (
        id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id         uuid        NOT NULL,

        task_id        uuid        NOT NULL,
        assignee_type  text        NOT NULL,
        -- Points at identity.users or organization.teams depending on
        -- assignee_type, so it carries no foreign key. The index below
        -- replaces what the FK would have given us.
        assignee_id    uuid        NOT NULL,

        -- assigned_at is created_at under another name, so it is not repeated.
        created_at     timestamptz NOT NULL DEFAULT now(),
        created_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at     timestamptz,
        deleted_by     uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT assignees_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),

        CONSTRAINT assignees_task_fkey
          FOREIGN KEY (task_id, org_id)
          REFERENCES task.tasks (id, org_id) ON DELETE CASCADE
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX assignees_task_assignee_unique
        ON task.assignees (task_id, assignee_type, assignee_id)
        WHERE deleted_at IS NULL
    `)
    // "What is assigned to me", and the reverse lookup the missing FK cannot
    // give us.
    await queryRunner.query(`
      CREATE INDEX assignees_assignee_idx
        ON task.assignees (org_id, assignee_type, assignee_id)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS task.assignees`)
    await queryRunner.query(`DROP TABLE IF EXISTS task.tasks`)
  }
}
