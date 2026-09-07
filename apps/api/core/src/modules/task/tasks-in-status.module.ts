import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { Task } from './task.entity'
import { TasksInStatusService } from './tasks-in-status.service'

/**
 * `TasksInStatusService` alone, so `ProjectModule` can ask about the tasks in
 * a status without importing `TaskModule` — which imports `ProjectModule`
 * right back, since a task needs its project's permissions, its number and its
 * statuses.
 *
 * The same cut `AuthCookiesModule` makes between auth and users, for the same
 * reason: this is the leaf both sides need, and it depends on neither.
 */
@Module({
  providers: [provideOrgRepository(Task), TasksInStatusService],
  exports: [TasksInStatusService],
})
export class TasksInStatusModule {}
