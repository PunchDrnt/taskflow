import { type MigrationInterface, type QueryRunner } from 'typeorm'

/**
 * The `discussion` schema (Phase 3). Both tables are polymorphic — they attach
 * to a task today and to anything else later — so `entity_id` carries no
 * foreign key and the index below does the work an FK would have done.
 *
 * This module must not know what a task is. It sees `entity_type` and
 * `entity_id`, nothing more.
 *
 * See .claude/docs/02-database/schema.md#schema-discussion
 */
export class CreateDiscussion1787190911661 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE discussion.comments (
        id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id             uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        entity_type        text        NOT NULL,
        -- Polymorphic, so no FK. No CHECK on entity_type either: the set grows
        -- with every feature that becomes commentable.
        entity_id          uuid        NOT NULL,
        parent_comment_id  uuid,
        body               text        NOT NULL,
        edited_at          timestamptz,

        created_at         timestamptz NOT NULL DEFAULT now(),
        created_by         uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at         timestamptz NOT NULL DEFAULT now(),
        updated_by         uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at         timestamptz,
        deleted_by         uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT comments_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
        CONSTRAINT comments_not_own_parent_check
          CHECK (parent_comment_id IS DISTINCT FROM id)
      )
    `)
    await queryRunner.query(`
      ALTER TABLE discussion.comments
        ADD CONSTRAINT comments_id_org_unique UNIQUE (id, org_id)
    `)
    // Slack-style threads: a reply to a comment that no longer exists does not
    // stand on its own.
    await queryRunner.query(`
      ALTER TABLE discussion.comments
        ADD CONSTRAINT comments_parent_fkey
        FOREIGN KEY (parent_comment_id, org_id)
        REFERENCES discussion.comments (id, org_id) ON DELETE CASCADE
    `)
    await queryRunner.query(`
      CREATE INDEX comments_entity_idx
        ON discussion.comments (org_id, entity_type, entity_id, created_at)
    `)

    await queryRunner.query(`
      CREATE TABLE discussion.attachments (
        id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id       uuid        NOT NULL REFERENCES organization.organizations(id) ON DELETE CASCADE,

        entity_type  text        NOT NULL,
        entity_id    uuid        NOT NULL,
        file_name    text        NOT NULL,
        file_size    bigint      NOT NULL,
        mime_type    text        NOT NULL,
        -- Storage key. The bucket is private; files are served through
        -- presigned URLs, never directly.
        storage_key  text        NOT NULL,

        created_at   timestamptz NOT NULL DEFAULT now(),
        created_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid        NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        deleted_at   timestamptz,
        deleted_by   uuid        REFERENCES identity.users(id) ON DELETE RESTRICT,

        CONSTRAINT attachments_deleted_pair_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
        CONSTRAINT attachments_file_size_check CHECK (file_size >= 0)
      )
    `)
    await queryRunner.query(`
      CREATE INDEX attachments_entity_idx
        ON discussion.attachments (org_id, entity_type, entity_id)
    `)
    // Deleting a row here must be followed by deleting the object in storage;
    // the database cannot cascade into object storage. Backups of the two are
    // taken separately for the same reason.
    await queryRunner.query(`
      CREATE UNIQUE INDEX attachments_storage_key_unique
        ON discussion.attachments (storage_key)
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS discussion.attachments`)
    await queryRunner.query(`DROP TABLE IF EXISTS discussion.comments`)
  }
}
