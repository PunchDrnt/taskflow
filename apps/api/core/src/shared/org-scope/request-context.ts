import { AsyncLocalStorage } from 'node:async_hooks'

import type { OrgRole } from '@repo/shared'

/**
 * Who is making the current request, and for which organisation.
 *
 * In AsyncLocalStorage rather than an argument: a parameter that can be
 * omitted eventually is, and here that failure is a cross-org leak.
 */
export interface RequestContext {
  /**
   * The organisation whose data this request may touch, or `null` for someone
   * signed in and not acting for any one org.
   *
   * Null is a real state, not a gap: the Home screen lists your organisations
   * before you have picked one, somebody in three companies has not chosen
   * yet, and a system-role account is deliberately a member of none. Anything
   * org-scoped calls `requireOrgContext` and so cannot see this value at all.
   */
  orgId: string | null
  /** The user acting. Writes are attributed to them. */
  userId: string
  /**
   * What the caller is in `orgId` — the input every permission question needs,
   * and the reason it is carried rather than looked up: the guard has already
   * read `organization.members` to decide which org this request is for, so
   * asking again in each controller would be the same row fetched twice to
   * answer a question already answered.
   *
   * Null in two different situations, and neither is a gap. `orgId` is null,
   * so there is no org to hold a role in; or something that is not a person is
   * acting — a cron job, a seed, a migration — which has an org but no
   * membership. That second case is why this stays nullable even on
   * `OrgRequestContext`: a job legitimately has an org and no role, and
   * `actorFromContext` refuses rather than inventing one.
   */
  orgRole: OrgRole | null
  /**
   * The session this request arrived on, or `null` for anything that is not
   * an HTTP request — a job, a seed, a migration.
   *
   * Here rather than passed down because only the guard knows it and only it
   * can be trusted about it. "Sign out every device except this one" is the
   * case that needs it: without the current session's id that operation can
   * only be all-or-nothing, and answering a successful password change with a
   * login screen reads as a failure.
   */
  sessionId: string | null
}

/** A context that has an org — what everything touching org-scoped data needs. */
export interface OrgRequestContext extends RequestContext {
  orgId: string
}

/**
 * The store is a *cell* rather than the context itself, so the slot can be
 * opened before the value is known. See `openRequestContext`.
 */
interface ContextCell {
  current: RequestContext | undefined
}

const storage = new AsyncLocalStorage<ContextCell>()

/** Runs `fn` with the context visible to everything it awaits. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run({ current: context }, fn)
}

/**
 * Opens a context slot for the current request and returns the one function
 * that fills it. For `AuthGuard`, and deliberately awkward everywhere else.
 *
 * 🔒 **Call it before the first `await`.** That is the whole reason this is a
 * cell and not a plain `enterWith(context)`. `enterWith` writes the store into
 * the async resource that is executing *right now*; the synchronous prefix of
 * `canActivate` still runs on the resource Express owns, which the handler and
 * everything below it inherit, while everything after an `await` runs on a
 * fresh promise resource the handler never sees. The guard has to look the
 * session up before it knows the org, so the value cannot be ready in the
 * prefix — the slot can.
 *
 * `run` is not an option either: `canActivate` returns a boolean rather than
 * calling the handler, so its scope would close before the controller ran.
 *
 * Measured 2026-09-04 on Node 22.22, in a real `node:http` server shaped like
 * Nest's guard → pipe → handler chain: entering after the `await` was answered
 * correctly on the first request of a connection and `undefined` on the third,
 * which is the shape of the bug — `POST /v1/me/active-org` returned 500 with
 * "No request context" while login, being `@Public()`, looked fine. Opening
 * the slot in the prefix was correct across 40 parallel requests and 10
 * sequential ones on one keep-alive socket. Pinned by request-context.spec.ts.
 */
export function openRequestContext(): (context: RequestContext) => void {
  const cell: ContextCell = { current: undefined }

  storage.enterWith(cell)

  return (context) => {
    cell.current = context
  }
}

/** `undefined` outside a request: startup, a migration, a background job. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()?.current
}

/**
 * The context, or a thrown error. For callers that cannot proceed without
 * knowing the org — there is no safe default, guessing is the leak itself.
 */
export function requireRequestContext(): RequestContext {
  const context = storage.getStore()?.current

  if (!context) {
    throw new Error(
      'No request context. Anything touching org-scoped data must run inside ' +
        'runWithRequestContext — a background job needs to establish one ' +
        'explicitly, naming the org it acts for.',
    )
  }

  return context
}

/**
 * The context, with an org guaranteed.
 *
 * The narrowing is the point: `orgId` is nullable on `RequestContext`, so
 * `string | null` will not assign to `string` and the compiler finds every
 * place that needs this rather than leaving it to be remembered. Callers that
 * only want `userId` — the audit columns subscriber, `updatedBy` — keep using
 * `requireRequestContext` and are unaffected.
 *
 * Throwing rather than defaulting, for the reason the context exists: there is
 * no safe org to guess, and guessing is the leak itself.
 */
export function requireOrgContext(): OrgRequestContext {
  const context = requireRequestContext()

  if (context.orgId === null) {
    throw new Error(
      'No organisation in the request context. This request is signed in but ' +
        'not acting for any one org — route it through @SkipOrgScope(), or ' +
        'have the caller choose an org with POST /v1/me/active-org.',
    )
  }

  return { ...context, orgId: context.orgId }
}
