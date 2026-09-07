import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { Task } from './task.entity'
import { TaskService } from './task.service'

/**
 * Tasks. A stub until §6: it exists now because `project/` has to ask two
 * questions about tasks before it may delete or re-type a status, and asking
 * them by reading `task.tasks` from over there would make the boundary
 * decorative.
 */
@Module({
  providers: [provideOrgRepository(Task), TaskService],
  exports: [TaskService],
})
export class TaskModule {}
