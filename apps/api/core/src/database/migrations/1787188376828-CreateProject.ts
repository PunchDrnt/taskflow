import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `project` schema. A project is where tasks live, with its own members
 * independent of teams and its own set of statuses — closer to a Slack channel
 * than to a department.
 *
 * See .claude/docs/02-database.md#schema-project
 */
export class CreateProject1787188376828 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE project.projects (
        id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id                uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        name                  text        NOT NULL,
        description           text,
        icon                  text,
        -- Who may mark a task done: anyone in the project, or only the
        -- assignee and project admins.
        completion_policy     text        NOT NULL DEFAULT 'anyone',
        auto_complete_parent  boolean     NOT NULL DEFAULT false,
        sprint_enabled        boolean     NOT NULL DEFAULT false,
        estimate_unit         text        NOT NULL DEFAULT 'none',

        created_at            timestamptz NOT NULL DEFAULT now(),
        created_by            uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at            timestamptz NOT NULL DEFAULT now(),
        updated_by            uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at            timestamptz,
        deleted_by            uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT projects_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX projects_org_name_unique
        ON project.projects (org_id, name) WHERE deleted_at IS NULL
    `)

    await queryRunner.query(`
      CREATE TABLE project.members (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        project_id  uuid        NOT NULL REFERENCES project.projects(id) ON DELETE CASCADE,
        user_id     uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        role        text        NOT NULL,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT project_members_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX project_members_project_user_unique
        ON project.members (project_id, user_id) WHERE deleted_at IS NULL
    `)
    // "Which projects can this user see" — org_id leads, per the scoping rule.
    await queryRunner.query(`
      CREATE INDEX project_members_org_user_idx
        ON project.members (org_id, user_id)
    `)

    await queryRunner.query(`
      CREATE TABLE project.statuses (
        id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id             uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        project_id         uuid        NOT NULL REFERENCES project.projects(id) ON DELETE CASCADE,
        name               text        NOT NULL,
        -- A palette token, not a hex value, so themes can restyle without a
        -- data migration.
        color              text        NOT NULL,
        -- Fractional indexing: reordering rewrites one row, not all of them.
        -- COLLATE "C" so the ordering is byte-wise and identical on every
        -- machine regardless of locale.
        sort_order         text        COLLATE "C" NOT NULL,
        is_default         boolean     NOT NULL DEFAULT false,
        is_done_type       boolean     NOT NULL DEFAULT false,
        -- Cancelled work leaves the denominator of a progress bar; done work
        -- stays in it. A status cannot be both.
        is_cancelled_type  boolean     NOT NULL DEFAULT false,

        created_at         timestamptz NOT NULL DEFAULT now(),
        created_by         uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at         timestamptz NOT NULL DEFAULT now(),
        updated_by         uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at         timestamptz,
        deleted_by         uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT statuses_done_xor_cancelled_check
          CHECK (NOT (is_done_type AND is_cancelled_type)),
        CONSTRAINT statuses_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX statuses_project_name_unique
        ON project.statuses (project_id, name) WHERE deleted_at IS NULL
    `)
    // At most one default per project, enforced here rather than by an
    // application check two concurrent requests can both pass.
    await queryRunner.query(`
      CREATE UNIQUE INDEX statuses_single_default_unique
        ON project.statuses (project_id) WHERE is_default AND deleted_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX statuses_project_order_idx
        ON project.statuses (org_id, project_id, sort_order)
    `)

    await queryRunner.query(`
      CREATE TABLE project.sprints (
        id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id      uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        project_id  uuid        NOT NULL REFERENCES project.projects(id) ON DELETE CASCADE,
        name        text        NOT NULL,
        goal        text,
        -- Plain dates: a sprint runs for whole days, and giving it a time
        -- would make its boundaries depend on the reader's timezone.
        start_date  date        NOT NULL,
        end_date    date        NOT NULL,
        status      text        NOT NULL DEFAULT 'planned',
        sort_order  text        COLLATE "C" NOT NULL,

        created_at  timestamptz NOT NULL DEFAULT now(),
        created_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at  timestamptz NOT NULL DEFAULT now(),
        updated_by  uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at  timestamptz,
        deleted_by  uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        -- The partial unique index below keys off this literal value, so a
        -- typo would drop the row out of it silently.
        CONSTRAINT sprints_status_check
          CHECK (status IN ('planned', 'active', 'completed')),
        CONSTRAINT sprints_dates_ordered_check
          CHECK (end_date >= start_date),
        CONSTRAINT sprints_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `)
    await queryRunner.query(`
      CREATE UNIQUE INDEX sprints_single_active_unique
        ON project.sprints (project_id) WHERE status = 'active' AND deleted_at IS NULL
    `)
    await queryRunner.query(`
      CREATE INDEX sprints_project_order_idx
        ON project.sprints (org_id, project_id, sort_order)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS project.sprints`)
    await queryRunner.query(`DROP TABLE IF EXISTS project.statuses`)
    await queryRunner.query(`DROP TABLE IF EXISTS project.members`)
    await queryRunner.query(`DROP TABLE IF EXISTS project.projects`)
  }
}
