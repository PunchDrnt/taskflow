import { z } from 'zod'

import { TASK_PRIORITIES } from '../constants.js'
import { idSchema } from './id.js'

/** Codes the client branches on, beside the module that raises them. */
export const TASK_ERROR_CODES = {
  /**
   * The person being assigned is in the organisation but not in this project.
   *
   * A refusal rather than a silent join, because adding somebody to a project
   * gives them everything in it — every task, every comment, every attachment
   * — and that is not a side effect of picking a name out of a list. The
   * client asks ("เพิ่มเข้าโปรเจกต์เลยไหม") and sends `addToProject: true`,
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
} as const

export const taskTitleSchema = z
  .string()
  .trim()
  .min(1, 'กรุณากรอกชื่องาน')
  .max(500, 'ชื่องานต้องไม่เกิน 500 ตัวอักษร')

export const taskDescriptionSchema = z
  .string()
  .trim()
  .max(20000, 'รายละเอียดต้องไม่เกิน 20000 ตัวอักษร')

export const taskPrioritySchema = z.enum(
  TASK_PRIORITIES,
  'ความสำคัญต้องเป็น low, medium, high หรือ urgent',
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
  .datetime({ offset: true, message: 'วันครบกำหนดต้องเป็นวันที่แบบ ISO 8601' })
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
  statusId: idSchema('status id ไม่ถูกต้อง').optional(),
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
    statusId: idSchema('status id ไม่ถูกต้อง').optional(),
    afterId: idSchema('task id ไม่ถูกต้อง').nullable().optional(),
  })
  .refine(
    (body) => Object.values(body).some((value) => value !== undefined),
    'ต้องระบุอย่างน้อยหนึ่งอย่างที่จะแก้',
  )

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>

/**
 * `assigneeType` is not a field: Phase 1 assigns people, and teams are Phase 2
 * (docs/04-features/phase-1.md#task). The column and its CHECK already hold
 * both, so adding teams later is a schema change of nothing.
 */
export const assignTaskSchema = z.object({
  userId: idSchema('user id ไม่ถูกต้อง'),
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
 * answer — and `org` behind the picker's "ค้นหาทั้งองค์กร" button. The middle
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

export const taskIdSchema = idSchema('task id ไม่ถูกต้อง')
