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
 * Duplicates within an organisation are allowed on purpose. People type these
 * themselves, and `TF-120` pointing at two projects is a cost the spec accepts
 * — every list already shows the project name beside the number.
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
 * `archivedAt` is deliberately absent. Archiving is its own endpoint because
 * it is a different decision with a different permission and a different
 * confirmation — folding it into a general update makes "rename this project"
 * and "hide it from everyone's sidebar" the same request shape.
 */
export const updateProjectSchema = z
  .object({
    name: projectNameSchema.optional(),
    keyPrefix: keyPrefixSchema.optional(),
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
