import { Column, Entity } from 'typeorm'

import { BaseEntity } from '../../shared/base.entity'

/**
 * Polymorphic: attaches to a task today, to anything later. This module must
 * not know what a task is — it sees `entityType` and `entityId`, nothing more,
 * which is why `entityId` has no foreign key.
 */
@Entity({ schema: 'discussion', name: 'comments' })
export class Comment extends BaseEntity {
  @Column('text')
  entityType!: string

  @Column('uuid')
  entityId!: string

  /** Slack-style threads: deleting a comment takes its replies with it. */
  @Column('uuid', { nullable: true })
  parentCommentId!: string | null

  @Column('text')
  body!: string

  @Column({ type: 'timestamptz', nullable: true })
  editedAt!: Date | null
}
