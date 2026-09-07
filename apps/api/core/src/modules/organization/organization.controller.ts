import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

import {
  addOrgMemberSchema,
  changeMemberRoleSchema,
  createOrganizationSchema,
  memberUserIdSchema,
  updateOrganizationSchema,
  wholeList,
  type AddOrgMemberInput,
  type ChangeMemberRoleInput,
  type CreateOrganizationInput,
  type OrgRole,
  type Page,
  type UpdateOrganizationInput,
} from '@repo/shared'

import { ApiZodBody } from '#shared/http/api-zod'
import { SkipOrgScope } from '#shared/http/route-metadata'
import { ZodValidationPipe } from '#shared/http/zod-validation.pipe'

import { RequirePermission } from '../../permission/require-permission.decorator'
import { UserService } from '../iam/user/user.service'
import { MemberService, type OrgMember } from './member.service'
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
  /**
   * `active` | `deactivated` | … — a deactivated colleague stays in this
   * list, which is the whole difference between switching an account off and
   * removing somebody from the organisation.
   */
  status: string | null
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
  @ApiZodBody(updateOrganizationSchema)
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
  @ApiZodBody(createOrganizationSchema)
  create(
    @Body(new ZodValidationPipe(createOrganizationSchema))
    body: CreateOrganizationInput,
  ): Promise<OrganizationView> {
    return this.organizations.create(body)
  }

  @Get('members')
  @RequirePermission('read', 'Organization')
  @ApiOperation({ summary: 'Everyone in this organisation' })
  async listMembers(): Promise<Page<MemberView>> {
    const members = await this.members.list()

    // Names come from iam through its service, never from a join: this module
    // does not own `iam.users` and importing the entity here is how a module
    // boundary stops meaning anything.
    const people = await this.users.findByIds(
      members.map((member) => member.userId),
    )
    const byId = new Map(people.map((person) => [person.id, person]))

    return wholeList(
      members.map((member) => {
        const person = byId.get(member.userId)

        return {
          ...member,
          name: person?.name ?? null,
          nickname: person?.nickname ?? null,
          email: person?.email ?? null,
          avatarUrl: person?.avatarUrl ?? null,
          status: person?.status ?? null,
        }
      }),
    )
  }

  /**
   * Adds somebody to this organisation, creating their account if the address
   * is new.
   *
   * Phase 1's way of onboarding people: `organization.invitations` is
   * migrated and unread until Phase 2, so somebody with the rights types the
   * details in. The permission check needs the requested role, so it runs in
   * the service rather than as a decorator.
   */
  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add somebody to this organisation' })
  @ApiZodBody(addOrgMemberSchema)
  addMember(
    @Body(new ZodValidationPipe(addOrgMemberSchema)) body: AddOrgMemberInput,
  ): Promise<OrgMember> {
    return this.members.add(body)
  }

  /**
   * Switch a colleague's account off. They stay in this list, their name
   * stays on their finished work, and the tasks they are holding stay with
   * them — see `MemberService.setActive`, including why an account shared with
   * another organisation is refused.
   */
  @Post('members/:userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Switch a colleague's account off" })
  deactivate(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
  ): Promise<OrgMember> {
    return this.members.setActive(userId, false)
  }

  /** And back on. Nothing was moved while they were away, so nothing returns. */
  @Delete('members/:userId/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch it back on' })
  reactivate(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
  ): Promise<OrgMember> {
    return this.members.setActive(userId, true)
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
  @ApiZodBody(changeMemberRoleSchema)
  changeMemberRole(
    @Param('userId', new ZodValidationPipe(memberUserIdSchema)) userId: string,
    @Body(new ZodValidationPipe(changeMemberRoleSchema))
    body: ChangeMemberRoleInput,
  ) {
    return this.members.changeRole(userId, body.role)
  }
}
