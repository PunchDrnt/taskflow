import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * A file in MinIO. Deleting this row must be followed by deleting the object —
 * the database cannot cascade into object storage, which is also why the two
 * are backed up separately.
 */
@Entity({ schema: 'discussion', name: 'attachments' })
export class Attachment extends BaseEntity {
  @Column('text')
  entityType!: string

  @Column('uuid')
  entityId!: string

  @Column('text')
  fileName!: string

  /** bigint: TypeORM hands these back as strings to avoid losing precision. */
  @Column('bigint')
  fileSize!: string

  @Column('text')
  mimeType!: string

  /** Key in MinIO. The bucket is private; files go out through presigned URLs. */
  @Column('text')
  storageKey!: string
}
