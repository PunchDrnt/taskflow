import { z } from 'zod'

import { SCOPED_ROLES, STATUS_COLORS } from '../constants.js'
import { idSchema } from './id.js'

/**
 * Codes the client branches on, beside the module that raises them — the same
 * arrangement `ORGANIZATION_ERROR_CODES` explains.
 */
export const PROJECT_ERROR_CODES = {
  /** Another live project in this organisation already has this name. */
  NAME_TAKEN: 'NAME_TAKEN',
  /** Another live project in this organisation already has this key prefix. */
  KEY_PREFIX_TAKEN: 'KEY_PREFIX_TAKEN',
  /** The person is already in this project. */
  ALREADY_MEMBER: 'ALREADY_MEMBER',
} as const

/**
 * The prefix half of a task key: `DEV` in `DEV-120`.
 *
 * ⚠️ The rule is `^[A-Z][A-Z0-9]{1,5}$` — from
 * docs/04-features/phase-1.md#task-key and the `projects_key_prefix_check`
 * CHECK, **not** from the prototype, which allowed a leading digit. `12-40`
 * does not read as a key at all, and this schema is what keeps the two from
 * disagreeing: a value the API accepts and the database then rejects arrives
 * as a 500.
 *
 * ⚠️ **Unique per organisation, and set once.** Both follow from the same
 * decision: the prefix is what a project's URL is made of, so
 * `/projects/DEV/settings` has to name one project (hence
 * `projects_org_key_prefix_unique`) and has to go on naming it (hence
 * `createProjectSchema` accepting this and `updateProjectSchema` not).
 *
 * The specification originally allowed duplicates and allowed renaming — the
 * key was assembled at display time precisely so a rename needed no backfill.
 * What changed is that a renameable segment makes every link somebody pasted
 * into chat a 404, and worse, makes it a *different project* the day another
 * one takes the freed prefix. An identifier people paste is one that must not
 * be reissued, which is the rule `tasks.number` already lives by.
 *
 * The prefix never travels to the API as an identifier even so: it is a
 * browser URL segment, resolved to an id by the page that reads it. Ids are
 * what endpoints take, because that is what the rest of the data references.
 */
export const keyPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z][A-Z0-9]{1,5}$/,
    'Key prefix must be 2-6 uppercase characters, starting with a letter',
  )

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a project name')
  .max(100, 'Project name must be 100 characters or fewer')

export const projectDescriptionSchema = z
  .string()
  .trim()
  .max(2000, 'Description must be 2000 characters or fewer')

/**
 * A palette token, never a hex value — so a theme can restyle every project
 * and status at once instead of through a data migration.
 *
 * `STATUS_COLORS` names it because statuses were the first to need it, and the
 * spec fixes projects to the same eight (docs/04-features/phase-1.md#project:
 * "ทรงเดียวกับ status"). One list, so a colour can never exist on a project
 * that a status cannot use.
 */
export const paletteColorSchema = z.enum(
  STATUS_COLORS,
  'Colour must be one from the palette',
)

export const createProjectSchema = z.object({
  name: projectNameSchema,
  keyPrefix: keyPrefixSchema,
  color: paletteColorSchema,
  description: projectDescriptionSchema.optional(),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>

/**
 * Every field optional, at least one required — a PATCH that changes nothing
 * should say so rather than write an audit row describing no change.
 *
 * `description` accepts null: clearing it is a real edit, and `undefined`
 * already means "leave it alone", so the two cannot be collapsed.
 *
 * `keyPrefix` is deliberately absent, and it is the omission worth stating: it is the
 * project's URL, and a URL that changes is a link somebody already sent that
 * now opens nothing — or opens whichever project later takes the prefix. It is
 * chosen once, at `createProjectSchema`. A body carrying one is *stripped*
 * rather than refused, which zod objects do by default, so a request whose
 * only field was the prefix fails the refine below as a body that changes
 * nothing — which is exactly what it is.
 *
 * `archivedAt` is deliberately absent. Archiving is its own endpoint because
 * it is a different decision with a different permission and a different
 * confirmation — folding it into a general update makes "rename this project"
 * and "hide it from everyone's sidebar" the same request shape.
 */
export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    color: paletteColorSchema.optional(),
    description: projectDescriptionSchema.nullable().optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    'Provide at least one field to change',
  )

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

/**
 * Project roles are `admin` and `member`, not the org's three. A project owner
 * would have nothing left to own — the organisation above it already has one,
 * and it is the org's owners who cannot be locked out of a project.
 */
export const addProjectMemberSchema = z.object({
  userId: idSchema('Invalid user id'),
  role: z.enum(SCOPED_ROLES, 'Role must be admin or member').default('member'),
})

export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>

export const changeProjectMemberRoleSchema = z.object({
  role: z.enum(SCOPED_ROLES, 'Role must be admin or member'),
})

export type ChangeProjectMemberRoleInput = z.infer<
  typeof changeProjectMemberRoleSchema
>

/** Path parameters, validated rather than trusted into a query. */
export const projectIdSchema = idSchema('Invalid project id')
export const projectMemberUserIdSchema = idSchema('Invalid user id')

/**
 * Archived projects are hidden, not deleted, so a list has to say which it
 * wants. Absent means live only — the sidebar and every picker.
 */
export const listProjectsQuerySchema = z.object({
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>
