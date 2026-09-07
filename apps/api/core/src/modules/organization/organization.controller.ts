import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  changeMemberRoleSchema,
  createOrganizationSchema,
  memberUserIdSchema,
  updateOrganizationSchema,
  type ChangeMemberRoleInput,
  type CreateOrganizationInput,
  type OrgRole,
  type UpdateOrganizationInput,
} from '@repo/shared'

import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { RequirePermission } from '../../permission/require-permission.decorator'
import { UserService } from '../iam/user/user.service'
import { MemberService } from './member.service'
import {
  OrganizationService,
  type OrganizationView,
} from './organization.service'

/** A member as the members screen draws them. */
interface MemberView {
  userId: string
  role: OrgRole
  joinedAt: Date
  /** Null when the account has been anonymised but the membership remains. */
  name: string | null
  nickname: string | null
  email: string | null
  avatarUrl: string | null
}

/**
 * The organisation this request is acting for — singular on purpose.
 *
 * `/org` and not `/orgs/:id`: which organisation a request is for is settled
 * by the `active_org` cookie and re-checked against the caller's memberships
 * every request, so an id in the path would be a second answer to a question
 * already answered — and the two disagreeing is a request checked against one
 * org and served from another. The list of organisations a person may act for
 * is `GET /v1/me`, which is a question about them rather than about any one
 * org.
 *
 * `POST /v1/org` is the exception and is `@SkipOrgScope()`: somebody creating
 * their first organisation is not yet in one.
 */
@ApiTags('organization')
@Controller('org')
export class OrganizationController {
  constructor(
    private readonly organizations: OrganizationService,
    private readonly members: MemberService,
    private readonly users: UserService,
  ) {}

  @Get()
  @RequirePermission('read', 'Organization')
  @ApiOperation({ summary: 'The organisation this session is acting for' })
  find(): Promise<OrganizationView> {
    return this.organizations.findActive()
  }

  /**
   * Owner only, and the guard is what says so — `ability.ts` gives an admin
   * `manage all` and then takes back exactly two things, of which this is one.
   */
  @Patch()
  @RequirePermission('update', 'Organization')
  @ApiOperation({ summary: 'Rename the organisation, or change its slug' })
  update(
    @Body(new ZodValidationPipe(updateOrganizationSchema))
    body: UpdateOrganizationInput,
  ): Promise<OrganizationView> {
    return this.organizations.update(body)
  }

  /**
   * No screen calls this in Phase 1 — organisations are created through the
   * API or a seed script until a later phase, which
   * docs/04-features/phase-1.md#organization states outright. The endpoint
   * exists now because the alternative is a seed script writing two tables by
   * hand and getting the owner row subtly wrong.
   */
  @Post()
  @SkipOrgScope()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an organisation, owned by its creator' })
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    body: CreateOrganizationInput,
  ): Promise<OrganizationView> {
    return this.organizations.create(body)
  }

  @Get('members')
  @RequirePermission('read', 'Organization')
  @ApiOperation({ summary: 'Everyone in this organisation' })
  async listMembers(): Promise<MemberView[]> {
    const members = await this.members.list()

    // Names come from iam through its service, never from a join: this module
    // does not own `iam.users` and importing the entity here is how a module
    // boundary stops meaning anything.
    const people = await this.users.findByIds(
      members.map((member) => member.userId),
    )
    const byId = new Map(people.map((person) => [person.id, person]))

    return members.map((member) => {
      const person = byId.get(member.userId)

      return {
        ...member,
        name: person?.name ?? null,
        nickname: person?.nickname ?? null,
        email: person?.email ?? null,
        avatarUrl: person?.avatarUrl ?? null,
      }
    })
  }

  /**
   * No `@RequirePermission` here, and that is deliberate rather than an
   * omission. Whether the caller may make *this* change depends on what the
   * target is now and what they would become, neither of which exists before
   * the row is loaded — so the check runs in `MemberService.changeRole`,
   * beside the load. See `ContextResolvedSubject`.
   */
  @Patch('members/:userId')
  @ApiOperation({ summary: "Change somebody's role in this organisation" })
  changeMemberRole(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema))
    body: ChangeMemberRoleInput,
  ) {
    return this.members.changeRole(userId, body.role)
  }
}
