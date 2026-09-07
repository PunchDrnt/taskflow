import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * One schema per module, all of them up front — a schema costs nothing, and a
 * module's first migration never has to remember to create its own home.
 *
 * `public` is absent on purpose: it holds citext and TypeORM's `migrations`
 * table, and no module table belongs there.
 *
 * See docs/02-database/README.md#schema-map
 */
const SCHEMAS = [
  'iam', // users, sessions, password resets, system-level RBAC
  'organization', // organizations, members, teams
  'project', // projects, members, statuses, sprints
  'task', // tasks, assignees
  'audit', // logs — the activity log feature
  'discussion', // comments, attachments        (Phase 3)
  'field', // custom field definitions     (Phase 4)
  'view', // views, view columns          (Phase 4)
  'chat', // chat identities and channels (Phase 4)
  'automation', // rules and runs           (Phase 5)
  'notify', // outbox, notifications
  'billing', // plans, subscriptions         (reserved)
] as const

export class CreateSchemas1787185775421 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of SCHEMAS) {
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`)
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of SCHEMAS) {
      // No CASCADE: the migration that created a table owns dropping it.
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}"`)
    }
  }
}
