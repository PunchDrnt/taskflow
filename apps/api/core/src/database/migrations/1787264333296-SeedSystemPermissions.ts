import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The system-level permission keys. Nothing reads them until Phase 7 brings
 * the back-office — they exist now so the roles a support engineer will be
 * given already have something to point at.
 *
 * Roles and the role → permission mapping are deliberately not seeded: the
 * spec puts that mapping in the database precisely so it can change without a
 * deploy, and inventing one here would be a decision nobody asked for.
 *
 * Spelled out rather than imported from SYSTEM_PERMISSIONS, so editing that
 * object cannot change what this migration already did on a live database —
 * the same reason migration 003 writes the system user's uuid as a literal.
 * `test/schema-invariants.spec.ts` fails if the two drift apart.
 *
 * See docs/02-database/schema.md#rbac-ระดับระบบ--สิทธิ์ทั้งเว็บ-ไม่ใช่ระดับ-org
 */
const PERMISSIONS: [key: string, description: string][] = [
  ['org.read', 'Read any organisation, across org scope'],
  ['org.suspend', 'Suspend an organisation'],
  ['user.impersonate', 'Act as a user inside their organisation'],
  ['billing.refund', 'Issue a refund'],
  ['log.read', 'Read the activity log across organisations'],
  ['role.manage', 'Grant and revoke system roles'],
]

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'

export class SeedSystemPermissions1787264333296 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [key, description] of PERMISSIONS) {
      // ON CONFLICT needs a unique index to name, and permissions_key_unique
      // is partial, so it is matched by repeating its predicate here.
      await queryRunner.query(
        `
        INSERT INTO identity.permissions (key, description, created_by, updated_by)
        VALUES ($1, $2, $3, $3)
        ON CONFLICT (key) WHERE deleted_at IS NULL DO NOTHING
        `,
        [key, description, SYSTEM_USER_ID],
      )
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM identity.permissions WHERE key = ANY($1)`,
      [PERMISSIONS.map(([key]) => key)],
    )
  }
}
