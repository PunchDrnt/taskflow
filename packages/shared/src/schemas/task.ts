import { z } from 'zod'

import { TASK_PRIORITIES } from '../constants.js'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../pagination.js'
import { idSchema } from './id.js'

/** Codes the client branches on, beside the module that raises them. */
export const TASK_ERROR_CODES = {
  /**
   * The person being assigned is in the organisation but not in this project.
   *
   * A refusal rather than a silent join, because adding somebody to a project
   * gives them everything in it — every task, every comment, every attachment
   * — and that is not a side effect of picking a name out of a list. The
   * client asks ("Add them to it?") and sends `addToProject: true`,
   * which is the confirmation docs/04-features/phase-1.md#assignee-picker
   * describes, expressed as a second request rather than as a hidden write.
   */
  NOT_PROJECT_MEMBER: 'NOT_PROJECT_MEMBER',
  /** That person already has this task. */
  ALREADY_ASSIGNED: 'ALREADY_ASSIGNED',
  /**
   * The project is archived, so it takes no new work and no edits.
   *
   * Archiving is not deleting — members keep reading the history and the
   * project keeps its rows — but a project that still accepts tasks after
   * being archived was never archived in any sense the sidebar's absence
   * would suggest. Un-archiving is the way back, and it is one click.
   */
  PROJECT_ARCHIVED: 'PROJECT_ARCHIVED',
  /**
   * The account is deactivated, so it takes no new work.
   *
   * The work it already holds stays exactly where it is — switching an
   * account off is not a decision about who does the job, and making it one
   * silently would be the system reassigning things nobody asked it to.
   */
  USER_INACTIVE: 'USER_INACTIVE',
} as const

export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, 'Enter a task title')
  .max(500, 'Task title must be 500 characters or fewer')

export const taskDescriptionSchema = z
  .string()
  .trim()
  .max(20000, 'Description must be 20000 characters or fewer')

export const taskPrioritySchema = z.enum(
  TASK_PRIORITIES,
  'Priority must be low, medium, high or urgent',
)

/**
 * A due date as an ISO 8601 instant, parsed here rather than at the column.
 *
 * `z.iso.datetime({ offset: true })` and not `z.coerce.date()`: coercion
 * accepts anything `new Date()` accepts, which includes `"tomorrow"` → Invalid
 * Date and a bare `"2026-09-07"` → **midnight UTC**, seven hours before the
 * day starts in Bangkok. A date with no offset is a date whose meaning depends
 * on which machine read it, and every table here stores `timestamptz` for
 * exactly that reason (docs/00-overview.md#binding-decisions). So the client
 * sends the offset it meant.
 */
export const dueDateSchema = z.iso
  .datetime({
    offset: true,
    message: 'Due date must be an ISO 8601 date-time with an offset',
  })
  .transform((value) => new Date(value))

/**
 * Quick add is why every field but the title is optional.
 *
 * docs/04-features/phase-1.md#task: typing a name and pressing Enter has to be
 * the whole interaction, so the status comes from the project's default and
 * the position from the end of the list. A required `statusId` would push that
 * choice into a form and cost the feature the thing it exists for.
 *
 * `parentTaskId` is deliberately absent. Sub-tasks are Phase 2 — the column,
 * the depth CHECK and the cascade are already in place for them, but nothing
 * in Phase 1 creates one, and accepting the field would ship a half of the
 * feature (a tree with no way to draw it) that people would then rely on.
 */
export const createTaskSchema = z.object({
  title: taskTitleSchema,
  description: taskDescriptionSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: dueDateSchema.optional(),
  /** Omitted means the project's default status. */
  statusId: idSchema('Invalid status id').optional(),
})

export type CreateTaskInput = z.infer<typeof createTaskSchema>

/**
 * Every field optional, at least one required.
 *
 * `description`, `priority` and `dueDate` accept null, because clearing one is
 * a real edit and `undefined` already means "leave it alone". `afterId` is the
 * neighbour to sit behind — never the sort key itself, for the reason
 * `updateStatusSchema` gives at length.
 */
export const updateTaskSchema = z
  .object({
    title: taskTitleSchema.optional(),
    description: taskDescriptionSchema.nullable().optional(),
    priority: taskPrioritySchema.nullable().optional(),
    dueDate: dueDateSchema.nullable().optional(),
    statusId: idSchema('Invalid status id').optional(),
    afterId: idSchema('Invalid task id').nullable().optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    'Provide at least one field to change',
  )

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/**
 * `assigneeType` is not a field: Phase 1 assigns people, and teams are Phase 2
 * (docs/04-features/phase-1.md#task). The column and its CHECK already hold
 * both, so adding teams later is a schema change of nothing.
 */
export const assignTaskSchema = z.object({
  userId: idSchema('Invalid user id'),
  /**
   * Join them to the project as a `member` if they are not in it yet. Default
   * false, so the first attempt reports `NOT_PROJECT_MEMBER` and the client
   * can ask before widening anyone's access.
   */
  addToProject: z.boolean().default(false),
})

export type AssignTaskInput = z.infer<typeof assignTaskSchema>

/**
 * Who this project can hand work to, for the assignee picker.
 *
 * Two tiers rather than one ranked list: `project` first — nearly always the
 * answer — and `org` behind the picker's "Search the whole organisation" button. The middle
 * tier the original spec had ("people you assigned recently", computed from
 * the activity log) was cut in the docs: the most expensive query on the most
 * frequently opened screen, to reorder something the first tier already
 * answers.
 */
export const assignableQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  scope: z.enum(['project', 'org']).default('project'),
})

export type AssignableQuery = z.infer<typeof assignableQuerySchema>

export const taskIdSchema = idSchema('Invalid task id')

/**
 * How a list is ordered.
 *
 * Each of these maps to a **NOT NULL** SQL expression in the API — a nullable
 * ordering column cannot be paged with a keyset cursor, because
 * `(a, b) > (NULL, c)` is NULL rather than true and the page comes back empty.
 * `dueDate` and `priority` are nullable columns and are handled there rather
 * than being left off this list, since "what is due first" and "what is
 * urgent" are the two questions the list view exists to answer.
 */
export const TASK_SORT_FIELDS = [
  /** The manual order — what a person dragged the cards into. */
  'order',
  'dueDate',
  'priority',
  'created',
  'title',
] as const

export type TaskSortField = (typeof TASK_SORT_FIELDS)[number]

/** Repeated query params arrive as one string or several; both mean a list. */
const many = <T extends z.ZodType>(item: T) =>
  z
    .union([item, z.array(item)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    // `.optional()` last, so an absent parameter leaves the key absent rather
    // than present-and-undefined — the difference between "no filter" and
    // "a filter of nothing" at every call site that spreads this type.
    .optional()

/**
 * Filtering, sorting, searching and paging one list of tasks.
 *
 * **Every condition is ANDed; there is no OR between them.** Several values
 * inside one condition is "is in" — `?priority=high&priority=urgent` means
 * either of those, and that is the only disjunction the grammar has. An OR
 * across different fields is a query builder, and a query builder is Phase 4's
 * saved views, not a URL somebody sends a colleague.
 *
 * 🔒 Paging is `cursor`, never an offset — see `shared/http/cursor.ts`.
 *
 * The whole state lives in the query string on purpose: docs say a filtered
 * list has to be shareable as a link, and that is what makes it so without a
 * table to store views in.
 */
export const listTasksQuerySchema = z.object({
  statusId: many(idSchema('Invalid status id')),
  assigneeId: many(idSchema('Invalid user id')),
  priority: many(taskPrioritySchema),
  /** Inclusive, and both may be given to bracket a range. */
  dueAfter: dueDateSchema.optional(),
  dueBefore: dueDateSchema.optional(),
  /** Matched against the title, case-insensitively. */
  q: z.string().trim().max(200).optional(),
  sort: z.enum(TASK_SORT_FIELDS).default('order'),
  dir: z.enum(['asc', 'desc']).default('asc'),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE),
  cursor: z.string().optional(),
})

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>

/**
 * My Tasks — everything assigned to the caller, across every project they can
 * see.
 *
 * **`includeClosed` defaults to false**, which hides statuses that count as
 * done *or* cancelled. Opening this screen should show what there is to do,
 * not a pile of what has already been dealt with; docs/04-features/phase-1.md
 * says so and it is the difference between a screen people open daily and one
 * they open once.
 *
 * Phase 1 has no team assignment, so "mine" means assigned to me directly.
 */
export const myTasksQuerySchema = listTasksQuerySchema.extend({
  includeClosed: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
})

export type MyTasksQuery = z.infer<typeof myTasksQuerySchema>

/**
 * My work, across **every** organisation the caller belongs to.
 *
 * The same question as `myTasksQuerySchema` asks of one organisation, and the
 * home screen's reason to exist: somebody with a day job and a side company
 * has two employers' worth of deadlines and one morning to plan
 * (docs/04-features/phase-1.md#organization).
 *
 * `sort` defaults to `dueDate` rather than `order`, which is the one field
 * that means nothing here — `order` is a fractional index scoped to a single
 * column of a single project, so comparing it across projects interleaves
 * unrelated lists in an arbitrary but stable way. It stays accepted because
 * the cursor still pages it correctly; it is simply never the useful answer.
 */
export const myWorkQuerySchema = myTasksQuerySchema.extend({
  sort: z.enum(TASK_SORT_FIELDS).default('dueDate'),
})

export type MyWorkQuery = z.infer<typeof myWorkQuerySchema>
