import { z } from 'zod'

import { ORG_ROLES } from '../constants.js'
import { emailSchema, passwordSchema } from './auth.js'
import { idSchema } from './id.js'
import { nicknameSchema, personNameSchema, usernameSchema } from './user.js'

/**
 * Codes the client branches on, kept with the module that raises them rather
 * than in `API_ERROR_CODES` — collecting every code in one file would make
 * that file something every module has to edit.
 */
export const ORGANIZATION_ERROR_CODES = {
  /** The change would leave the organisation with no owner. */
  LAST_OWNER: 'LAST_OWNER',
  /** Another live organisation already uses this slug. */
  SLUG_TAKEN: 'SLUG_TAKEN',
  /** That email or username is already taken by another account. */
  ACCOUNT_EXISTS: 'ACCOUNT_EXISTS',
  /**
   * 🔒 The account belongs to more than one organisation, so this
   * organisation cannot switch it off.
   *
   * Deactivating writes `iam.users.status`, which is account-level and not
   * org-level: one company's admin doing it would lock the person out of
   * every other company they work with. The specification never contemplated
   * this — its own example routes the shared-account case to "remove from the
   * organisation" instead, which is Phase 2. Refusing is the honest answer
   * until that exists; doing it anyway would be a cross-org effect, and those
   * are the ones this codebase treats as binding.
   */
  USER_IN_OTHER_ORGS: 'USER_IN_OTHER_ORGS',
} as const

/**
 * A slug is what an organisation is called in a URL, so it is deliberately
 * narrower than a name: lowercase, digits and single hyphens, never leading
 * or trailing. Nothing in the docs fixed the shape — this is the decision,
 * and it is the smallest one that keeps a slug readable and unambiguous in a
 * path segment.
 *
 * Uniqueness is a partial index (`WHERE deleted_at IS NULL`), so a deleted
 * organisation releases its slug and a live one holds it.
 */
export const orgSlugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(50, 'Slug must be 50 characters or fewer')
  .regex(
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    'Slug may use a-z, 0-9 and -, and may not start or end with -',
  )

export const orgNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter an organisation name')
  .max(100, 'Organisation name must be 100 characters or fewer')

export const createOrganizationSchema = z.object({
  name: orgNameSchema,
  slug: orgSlugSchema,
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>

/**
 * Both fields optional, and at least one required: a PATCH that changes
 * nothing is a request that should say so rather than quietly succeeding and
 * writing an audit row describing no change.
 */
export const updateOrganizationSchema = z
  .object({
    name: orgNameSchema.optional(),
    slug: orgSlugSchema.optional(),
  })
  .refine(
    (body) => body.name !== undefined || body.slug !== undefined,
    'Provide at least one field to change',
  )

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>

/**
 * Who to change, and to what. The user id is in the path; this is the body.
 *
 * `owner` is a valid value here — appointing one is what an owner is for.
 * Whether *this* caller may set it is a permission question, not a shape
 * question, and answering it in the schema would put the rule in two places.
 */
export const changeMemberRoleSchema = z.object({
  role: z.enum(ORG_ROLES, 'Role must be owner, admin or member'),
})

export type ChangeMemberRoleInput = z.infer<typeof changeMemberRoleSchema>

/** The path parameter, validated rather than trusted into a query. */
export const memberUserIdSchema = idSchema('Invalid user id')

/**
 * Adding somebody to the organisation, in the phase before invitations exist.
 *
 * `organization.invitations` is migrated and unread until Phase 2, and the
 * checklist says Phase 1 adds people with a script. This is that, as an
 * endpoint: an owner or admin types the details and the account and the
 * membership are created together.
 *
 * A password is set here rather than emailed, because the reset flow already
 * exists and is the safe way to hand one over — the admin tells the person to
 * use "forgot password", or passes the initial one out of band. Inventing a
 * second invitation mechanism now is what Phase 2 is for.
 */
export const addOrgMemberSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  name: personNameSchema,
  nickname: nicknameSchema,
  password: passwordSchema,
  role: z
    .enum(ORG_ROLES, 'Role must be owner, admin or member')
    .default('member'),
})

export type AddOrgMemberInput = z.infer<typeof addOrgMemberSchema>
