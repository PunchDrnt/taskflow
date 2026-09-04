import { Column, Entity } from 'typeorm'

import { CreatedEntity } from '#shared/entity/base.entity'

/**
 * One row per provider a person has linked. Migrated in Phase 1 and read by
 * nobody yet — Google login is not switched on — which is the same pattern as
 * the RBAC tables that have sat here since Phase 0.
 *
 * `CreatedEntity`: hard delete, and no `updated_*`. Nothing edits a link, and
 * a soft-deleted one would be a login bug rather than a display one — the sign
 * -in query is `WHERE provider = $1 AND provider_user_id = $2`, and the day
 * somebody forgets `AND deleted_at IS NULL` is the day an unlinked account
 * signs back in. A deleted row cannot be forgotten. Relinking is one click,
 * and `audit.logs` already records who unlinked what.
 *
 * See docs/02-database/schema.md#schema-identity.
 */
@Entity({ schema: 'identity', name: 'oauth_accounts' })
export class OauthAccount extends CreatedEntity {
  @Column('uuid')
  userId!: string

  /** 'google' today; the CHECK is what widens when another one arrives. */
  @Column('text')
  provider!: string

  /**
   * The `sub` the provider issued, never the email — an address can change
   * hands, and matching on one would hand the account over with it.
   */
  @Column('text')
  providerUserId!: string

  /** What the provider said the address was at link time. For tracing only. */
  @Column('text', { nullable: true })
  providerEmail!: string | null
}
