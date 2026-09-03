import { Column, Entity } from 'typeorm'

import { OrgScopedEntity } from '#shared/entity/base.entity'

/**
 * An invitation to join an organization. The table ships in Phase 1; the API
 * and the screens are Phase 2, so until then nothing writes here.
 *
 * No soft delete: `revoked_at` ends its life the way `used_at` ends a password
 * reset token's, and a second delete marker would only be one more thing to
 * keep in sync.
 */
@Entity({ schema: 'organization', name: 'invitations' })
export class Invitation extends OrgScopedEntity {
  /** citext — matches the address however it was typed. */
  @Column('citext')
  email!: string

  /** 'admin' | 'member'. Ownership is granted from inside, never invited. */
  @Column('text')
  role!: string

  /** The link in the mail holds the only plaintext copy. */
  @Column('text')
  tokenHash!: string

  @Column({ type: 'timestamptz' })
  expiresAt!: Date

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt!: Date | null

  @Column({ type: 'uuid', nullable: true })
  acceptedBy!: string | null

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null
}
