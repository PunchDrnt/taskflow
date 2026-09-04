import { hash } from '@node-rs/argon2'
import { DataSource } from 'typeorm'

import { SYSTEM_USER_ID } from '#shared/system-user'

import { validateDatabaseUrl } from '../../config/env'
import { buildDataSourceOptions } from '../data-source.options'

/**
 * A development and demo dataset: one organisation with people in it, a team,
 * a project with its own statuses and a sprint, and tasks two levels deep.
 *
 *     yarn workspace @api/core db:seed
 *
 * Raw SQL rather than the entities, for the reason the maintenance jobs use
 * it: every statement here crosses the org scope on purpose — there is no
 * request context, because there is nobody making a request.
 *
 * Deletes what it made before making it again, so it can be re-run. It refuses
 * to touch a production database at all.
 */
/**
 * The password every demo account shares, printed on the way out so nobody has
 * to read it out of this file.
 *
 * A real hash rather than a null column, which is what this was before auth
 * existed: with `AuthGuard` in place a seeded database that nobody can log
 * into is a database nobody can use, and the alternative was what it replaced
 * — hand-writing an argon2 hash into psql to try anything. It is safe only
 * because `seed()` refuses to run against `NODE_ENV=production`; treat it the
 * way `.env.example` is treated, as a committed fake.
 */
const DEMO_PASSWORD = 'demo-password-not-for-production'

const ORG_ID = '11111111-1111-1111-1111-111111111111'

const PEOPLE = [
  [
    '22222222-2222-2222-2222-222222222221',
    'owner@taskflow.local',
    'Anong Wattana',
    'Anong',
    'owner',
  ],
  [
    '22222222-2222-2222-2222-222222222222',
    'admin@taskflow.local',
    'Kittipong Sae',
    'Kit',
    'admin',
  ],
  [
    '22222222-2222-2222-2222-222222222223',
    'dev@taskflow.local',
    'Pim Rattana',
    'Pim',
    'member',
  ],
  [
    '22222222-2222-2222-2222-222222222224',
    'design@taskflow.local',
    'Somchai Ura',
    'Chai',
    'member',
  ],
] as const

const [OWNER, ADMIN, DEV, DESIGN] = PEOPLE.map(([id]) => id)

const TEAM_ID = '33333333-3333-3333-3333-333333333331'
const PROJECT_ID = '44444444-4444-4444-4444-444444444441'
const SPRINT_ID = '55555555-5555-5555-5555-555555555551'

/** name, color, sort_order, is_default, is_done_type, is_cancelled_type */
const STATUSES = [
  [
    '66666666-6666-6666-6666-666666666661',
    'Backlog',
    'gray',
    'a0',
    true,
    false,
    false,
  ],
  [
    '66666666-6666-6666-6666-666666666662',
    'In progress',
    'blue',
    'a1',
    false,
    false,
    false,
  ],
  [
    '66666666-6666-6666-6666-666666666663',
    'In review',
    'purple',
    'a2',
    false,
    false,
    false,
  ],
  [
    '66666666-6666-6666-6666-666666666664',
    'Done',
    'green',
    'a3',
    false,
    true,
    false,
  ],
  [
    '66666666-6666-6666-6666-666666666665',
    'Cancelled',
    'pink',
    'a4',
    false,
    false,
    true,
  ],
] as const

const [BACKLOG, IN_PROGRESS, IN_REVIEW, DONE] = STATUSES.map(([id]) => id)

async function seed(dataSource: DataSource): Promise<void> {
  await dataSource.transaction(async (manager) => {
    // Children first: task.tasks references project.projects with RESTRICT, so
    // the order here is the same one the retention job has to work out at run
    // time. It is short enough to keep by hand.
    for (const table of [
      'task.assignees',
      'task.tasks',
      'project.sprints',
      'project.statuses',
      'project.members',
      'project.projects',
      'organization.team_members',
      'organization.teams',
      'organization.members',
    ]) {
      await manager.query(`DELETE FROM ${table} WHERE org_id = $1`, [ORG_ID])
    }
    // The one table scoped by its own id: an organisation's org_id would
    // always equal its primary key, so the column does not exist.
    await manager.query(
      `DELETE FROM organization.organizations WHERE id = $1`,
      [ORG_ID],
    )
    await manager.query(`DELETE FROM identity.users WHERE id = ANY($1)`, [
      PEOPLE.map(([id]) => id),
    ])

    // Hashed once and shared by all four, because hashing is deliberately slow
    // and this is the same throwaway password four times over.
    const passwordHash = await hash(DEMO_PASSWORD)

    for (const [id, email, name, nickname] of PEOPLE) {
      await manager.query(
        `INSERT INTO identity.users (id, email, name, nickname, status, password_hash, created_by, updated_by)
         VALUES ($1, $2, $3, $4, 'active', $5, $6, $6)`,
        [id, email, name, nickname, passwordHash, SYSTEM_USER_ID],
      )
    }

    await manager.query(
      `INSERT INTO organization.organizations (id, name, slug, created_by, updated_by)
       VALUES ($1, 'Taskflow Demo', 'taskflow-demo', $2, $2)`,
      [ORG_ID, OWNER],
    )

    for (const [id, , , , role] of PEOPLE) {
      await manager.query(
        `INSERT INTO organization.members (org_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4)`,
        [ORG_ID, id, role, OWNER],
      )
    }

    await manager.query(
      `INSERT INTO organization.teams (id, org_id, name, description, created_by, updated_by)
       VALUES ($1, $2, 'Product', 'Everyone who ships the app', $3, $3)`,
      [TEAM_ID, ORG_ID, OWNER],
    )
    for (const [userId, role] of [
      [ADMIN, 'admin'],
      [DEV, 'member'],
      [DESIGN, 'member'],
    ] as const) {
      await manager.query(
        `INSERT INTO organization.team_members (org_id, team_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [ORG_ID, TEAM_ID, userId, role, OWNER],
      )
    }

    await manager.query(
      `INSERT INTO project.projects
         (id, org_id, name, description, color, key_prefix, next_task_number,
          sprint_enabled, created_by, updated_by)
       VALUES ($1, $2, 'Website revamp', 'The demo project', 'blue', 'WEB', 6,
               true, $3, $3)`,
      [PROJECT_ID, ORG_ID, OWNER],
    )
    for (const [userId, role] of [
      [ADMIN, 'admin'],
      [DEV, 'member'],
      [DESIGN, 'member'],
    ] as const) {
      await manager.query(
        `INSERT INTO project.members (org_id, project_id, user_id, role, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [ORG_ID, PROJECT_ID, userId, role, OWNER],
      )
    }

    for (const [
      id,
      name,
      color,
      order,
      isDefault,
      isDone,
      isCancelled,
    ] of STATUSES) {
      await manager.query(
        `INSERT INTO project.statuses
           (id, org_id, project_id, name, color, sort_order,
            is_default, is_done_type, is_cancelled_type, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
        [
          id,
          ORG_ID,
          PROJECT_ID,
          name,
          color,
          order,
          isDefault,
          isDone,
          isCancelled,
          OWNER,
        ],
      )
    }

    await manager.query(
      `INSERT INTO project.sprints
         (id, org_id, project_id, name, goal, start_date, end_date, status, sort_order, created_by, updated_by)
       VALUES ($1, $2, $3, 'Sprint 1', 'Ship the new landing page',
               current_date - 3, current_date + 11, 'active', 'a0', $4, $4)`,
      [SPRINT_ID, ORG_ID, PROJECT_ID, OWNER],
    )

    // depth 0 with a sprint; sub-tasks are depth 1 and carry none, which the
    // tasks_subtask_has_no_sprint_check enforces.
    const parents = [
      [
        '77777777-7777-7777-7777-777777777771',
        'Design the new landing page',
        IN_PROGRESS,
        'high',
        DESIGN,
      ],
      [
        '77777777-7777-7777-7777-777777777772',
        'Rewrite the pricing copy',
        BACKLOG,
        'medium',
        DEV,
      ],
      [
        '77777777-7777-7777-7777-777777777773',
        'Set up analytics',
        DONE,
        'low',
        DEV,
      ],
    ] as const

    for (const [id, title, statusId, priority, assignee] of parents) {
      const done = statusId === DONE
      await manager.query(
        `INSERT INTO task.tasks
           (id, org_id, project_id, title, number, status_id, priority, sort_order,
            depth, sprint_id, completed_at, completed_by, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $12, $5, $6, $7, 0, $8, $9, $10, $11, $11)`,
        [
          id,
          ORG_ID,
          PROJECT_ID,
          title,
          statusId,
          priority,
          `a${parents.findIndex(([p]) => p === id)}`,
          SPRINT_ID,
          // completed_at and completed_by are set together or not at all, and
          // only for a status that means done.
          done ? new Date() : null,
          done ? DEV : null,
          OWNER,
          // Numbers are per project and never reused; next_task_number above
          // is set past the last one handed out here.
          parents.findIndex(([p]) => p === id) + 1,
        ],
      )
      await manager.query(
        `INSERT INTO task.assignees (org_id, task_id, assignee_type, assignee_id, created_by)
         VALUES ($1, $2, 'user', $3, $4)`,
        [ORG_ID, id, assignee, OWNER],
      )
    }

    const subtasks = [
      [
        '88888888-8888-8888-8888-888888888881',
        parents[0][0],
        'Hero section mockup',
        IN_REVIEW,
        'a0',
      ],
      [
        '88888888-8888-8888-8888-888888888882',
        parents[0][0],
        'Mobile breakpoints',
        BACKLOG,
        'a1',
      ],
    ] as const

    for (const [
      index,
      [id, parentId, title, statusId, order],
    ] of subtasks.entries()) {
      await manager.query(
        `INSERT INTO task.tasks
           (id, org_id, project_id, title, number, status_id, sort_order, depth,
            parent_task_id, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $9, $5, $6, 1, $7, $8, $8)`,
        [
          id,
          ORG_ID,
          PROJECT_ID,
          title,
          statusId,
          order,
          parentId,
          OWNER,
          // A sub-task carries a number of its own, not 1.1.
          parents.length + index + 1,
        ],
      )
    }
  })
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database')
  }

  const url = validateDatabaseUrl(process.env)
  const dataSource = new DataSource(buildDataSourceOptions(url))
  await dataSource.initialize()

  try {
    await seed(dataSource)
    const [{ count }] = (await dataSource.query(
      `SELECT count(*)::int AS count FROM task.tasks WHERE org_id = $1`,
      [ORG_ID],
    )) as { count: number }[]
    console.log(
      `seeded org ${ORG_ID}: ${PEOPLE.length} users, ${STATUSES.length} statuses, ${count} tasks`,
    )
    console.log(
      `sign in as any of ${PEOPLE.map(([, email]) => email).join(', ')} ` +
        `with the password ${DEMO_PASSWORD}`,
    )
  } finally {
    await dataSource.destroy()
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
