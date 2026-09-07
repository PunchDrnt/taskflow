import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { describe, expect, it } from 'vitest'

import { ApiException } from '#shared/http/api-exception'
import { runWithRequestContext } from '#shared/org-scope/request-context'

import type { OrgRole } from './actor'
import { PermissionGuard } from './permission.guard'
import { PermissionService } from './permission.service'
import {
  REQUIRE_PERMISSION,
  RequirePermission,
} from './require-permission.decorator'

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER_ORG = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'

const guard = new PermissionGuard(new Reflector(), new PermissionService())

/** A route carrying whatever `@RequirePermission` would have put on it. */
function route(metadata?: {
  action: string
  subject: string
}): ExecutionContext {
  const handler = () => undefined
  if (metadata) Reflect.defineMetadata(REQUIRE_PERMISSION, metadata, handler)

  return {
    getHandler: () => handler,
    getClass: () => class Controller {},
  } as unknown as ExecutionContext
}

const asRole = <R>(orgRole: OrgRole | null, fn: () => R): R =>
  runWithRequestContext(
    { orgId: ORG, userId: USER, orgRole, sessionId: 'session-1' },
    fn,
  )

describe('PermissionGuard', () => {
  it('lets an owner update the organisation', () => {
    expect(
      asRole('owner', () =>
        guard.canActivate(route({ action: 'update', subject: 'Organization' })),
      ),
    ).toBe(true)
  })

  it('refuses an admin the two things only an owner may do', () => {
    // The line between the roles, and the reason `ability.ts` spells it out
    // with `cannot` rather than by giving admin a shorter list: an admin
    // manages everything in the org except disposing of it or changing who
    // owns it.
    for (const action of ['update', 'delete'] as const) {
      expect(() =>
        asRole('admin', () =>
          guard.canActivate(route({ action, subject: 'Organization' })),
        ),
      ).toThrow(ApiException)
    }
  })

  it('lets an admin read it', () => {
    expect(
      asRole('admin', () =>
        guard.canActivate(route({ action: 'read', subject: 'Organization' })),
      ),
    ).toBe(true)
  })

  it('refuses a member', () => {
    expect(() =>
      asRole('member', () =>
        guard.canActivate(route({ action: 'update', subject: 'Organization' })),
      ),
    ).toThrow(ApiException)
  })

  it('allows a route that asked for nothing', () => {
    // Reachable when a class-level decorator is overridden by a handler with
    // none, so it is answered rather than assumed impossible.
    expect(asRole('member', () => guard.canActivate(route()))).toBe(true)
  })

  it('refuses to answer for something with no membership', () => {
    // A job, which has an org and no role. Not a 403 — a 403 would mean the
    // question was asked and answered, and the honest outcome is that this
    // caller must not be asking it at all.
    expect(() =>
      asRole(null, () =>
        guard.canActivate(route({ action: 'read', subject: 'Organization' })),
      ),
    ).toThrow(/No role in organisation/)
  })

  it('decides about the org in the context, never one named elsewhere', () => {
    // 🔒 The resource is built from the request context rather than taken from
    // the route, because every scoped query below will use the context's org.
    // Checking one org and querying another is a permission check that passes
    // for an organisation the request never touches.
    const permissions = new PermissionService()
    const asked: unknown[] = []
    const spy = new PermissionGuard(new Reflector(), {
      assert: (_actor, _action, _subject, resource) => {
        asked.push(resource)
      },
      can: permissions.can.bind(permissions),
      isEverAllowedTo: permissions.isEverAllowedTo.bind(permissions),
    } as PermissionService)

    asRole('owner', () =>
      spy.canActivate(route({ action: 'update', subject: 'Organization' })),
    )

    expect(asked).toEqual([{ id: ORG }])
    expect(asked).not.toEqual([{ id: OTHER_ORG }])
  })

  it('is attached to the route, so it cannot run before AuthGuard', () => {
    // The decorator carries its own `UseGuards`, and Nest runs route-bound
    // guards after every global one. Registered as an APP_GUARD instead, this
    // would run in module-provider order — putting the security of each route
    // in the hands of the import list in app.module.ts.
    class Controller {
      @RequirePermission('update', 'Organization')
      handler() {}
    }

    const attached = Reflect.getMetadata(
      '__guards__',
      Controller.prototype.handler,
    ) as unknown[]

    expect(attached).toContain(PermissionGuard)
  })
})
