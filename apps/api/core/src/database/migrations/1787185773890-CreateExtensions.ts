import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * Extensions come first: a later migration cannot declare a `citext` column
 * before the type exists.
 *
 * Only `citext` is installed. `pgcrypto` is not needed — `gen_random_uuid()`
 * has been in the Postgres core since 13, and this project targets 18, so
 * installing pgcrypto for it would add an extension nothing reads.
 *
 * `citext` is a trusted extension, so the app's database user can install it
 * without being a superuser. That matters: the deployment checklist requires
 * the app to run as an ordinary user.
 */
export class CreateExtensions1787185773890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pinned to public rather than left to search_path, so the type resolves
    // the same way from every schema.
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fails loudly while any citext column still exists, which is the point:
    // reverting this migration out from under identity.users should not be
    // something Postgres quietly allows.
    await queryRunner.query(`DROP EXTENSION IF EXISTS citext`)
  }
}
