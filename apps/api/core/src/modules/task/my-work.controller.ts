import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import { myWorkQuerySchema, type MyWorkQuery, type Page } from '@repo/shared'

import { ApiZodQuery } from '#shared/http/api-zod'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { UserService } from '../iam/user/user.service'
import { withAssignees, type AssigneeView } from './task-people'
import { TaskService, type MyWorkView } from './task.service'

/** A home-screen row: the task, who holds it, and which company it belongs to. */
type MyWorkResponse = Omit<MyWorkView, 'assigneeIds'> & {
  assignees: AssigneeView[]
}

/**
 * The caller's work, across every organisation they belong to.
 *
 * Filed under `/me` rather than `/tasks` because of the split
 * `organization.controller.ts` draws and this route is the clearest case of:
 * `/org/*` answers questions about one organisation, `/me/*` answers questions
 * about the person — and "what am I meant to be doing" is the second kind. It
 * is also the only task route that cannot answer under a single `org_id`, so
 * putting it beside `/tasks` would leave one endpoint in that group quietly
 * obeying different rules from its neighbours.
 *
 * `@SkipOrgScope()` for the same reason: an org has to be *not* chosen for the
 * question to mean anything, and somebody who belongs to no organisation at
 * all still gets a page — an empty one — rather than a 403 on the first screen
 * they see after signing in.
 */
@ApiTags('task')
@Controller('me/tasks')
export class MyWorkController {
  constructor(
    private readonly tasks: TaskService,
    private readonly users: UserService,
  ) {}

  @Get()
  @SkipOrgScope()
  @ApiOperation({ summary: 'My work, across every organisation' })
  @ApiZodQuery(myWorkQuerySchema)
  async mine(
    @Query(new ZodValidationPipe(myWorkQuerySchema)) query: MyWorkQuery,
  ): Promise<Page<MyWorkResponse>> {
    const page = await this.tasks.myWork(query)

    return { ...page, data: await withAssignees(this.users, page.data) }
  }
}
