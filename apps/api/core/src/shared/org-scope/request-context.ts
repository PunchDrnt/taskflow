import { AsyncLocalStorage } from 'node:async_hooks'

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
}

/** A context that has an org — what everything touching org-scoped data needs. */
export interface OrgRequestContext extends RequestContext {
  orgId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/** Runs `fn` with the context visible to everything it awaits. */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn)
}

/**
 * Sets the context for the rest of the current async chain, with no callback
 * to close it.
 *
 * For `AuthGuard`, and deliberately awkward everywhere else. `canActivate`
 * returns a boolean rather than calling the handler, so a scope opened with
 * `runWithRequestContext` closes before the controller runs and the request
 * arrives with no context at all. `enterWith` has no such boundary: it writes
 * into the async resource the request is already on, which the handler, the
 * services below it and every `await` in them inherit.
 *
 * The cost is that nothing closes it — the store lives as long as the async
 * resource does. That is right for one HTTP request, whose resource ends with
 * it, and wrong for a job, a seed or a test, where `runWithRequestContext` is
 * still the answer.
 */
export function enterRequestContext(context: RequestContext): void {
  storage.enterWith(context)
}

/** `undefined` outside a request: startup, a migration, a background job. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/**
 * The context, or a thrown error. For callers that cannot proceed without
 * knowing the org — there is no safe default, guessing is the leak itself.
 */
export function requireRequestContext(): RequestContext {
  const context = storage.getStore()

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
