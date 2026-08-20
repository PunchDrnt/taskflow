import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * One schema per module, created up front — including the ones whose tables
 * arrive in a later phase. A schema costs nothing, and having them all present
 * from the start means a module's first migration never has to remember to
 * create its own home.
 *
 * `public` is deliberately absent: it already exists, and it holds only the
 * citext extension and TypeORM's own `migrations` bookkeeping table. No module
 * table belongs there.
 *
 * See .claude/docs/02-database.md#1-schema-map
 */
const SCHEMAS = [
  'identity', // users, sessions, password resets, system-level RBAC
  'organization', // organizations, members, teams
  'project', // projects, members, statuses, sprints
  'task', // tasks, assignees
  'audit', // logs — the activity log feature
  'discussion', // comments, attachments        (Phase 3)
  'field', // custom field definitions     (Phase 4)
  'view', // views, view columns          (Phase 4)
  'chat', // chat identities and channels (Phase 2)
  'notify', // outbox
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
      // No CASCADE. If a schema still holds tables, the migration that created
      // them owns dropping them — a revert that silently deletes tables it did
      // not create is how a bad rollback turns into data loss.
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}"`)
    }
  }
}
