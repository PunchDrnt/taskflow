import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * First, because a later migration cannot declare a `citext` column before the
 * type exists.
 *
 * `citext` only: `gen_random_uuid()` has been core since PG 13, so pgcrypto
 * would be an extension nothing reads. citext is *trusted*, so the app's user
 * can install it without being a superuser — which the deploy checklist wants.
 */
export class CreateExtensions1787185773890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pinned to public, so the type resolves the same way from every schema.
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fails loudly while any citext column still exists. That is the point.
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`)
  }
}
