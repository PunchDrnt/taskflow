import { Module } from '@nestjs/common'

import { provideOrgRepository } from '#shared/org-scope/org-repository.provider'

import { AuditModule } from '../audit/audit.module'
import { UserModule } from '../iam/user/user.module'
import { ProjectModule } from '../project/project.module'
import { Assignee } from './assignee.entity'
import { ProjectTaskController } from './project-task.controller'
import { TaskController } from './task.controller'
import { Task } from './task.entity'
import { TaskService } from './task.service'

/**
 * Tasks and who they belong to.
 *
 * Imports `ProjectModule` and not the other way round: a task needs its
 * project's permissions, its number and its statuses, while the only thing a
 * project needs from here is the handful of facts in `TasksInStatusModule` —
 * which is a module of its own precisely so these two never import each other.
 *
 * `UserModule` is for names. Ids come out of this module's tables; the people
 * behind them come from `iam` through its service, never from a join.
 */
@Module({
  imports: [AuditModule, ProjectModule, UserModule],
  controllers: [ProjectTaskController, TaskController],
  providers: [
    provideOrgRepository(Task),
    provideOrgRepository(Assignee),
    TaskService,
  ],
  exports: [TaskService],
})
export class TaskModule {}
