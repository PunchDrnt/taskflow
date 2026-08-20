import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Who is making the current request, and on behalf of which organisation.
 *
 * Carried in AsyncLocalStorage rather than passed down as an argument so that
 * the two places that must never be forgotten — org scoping on every query and
 * `created_by`/`updated_by` on every write — can read it without every service
 * method having to thread it through. A parameter that can be omitted will
 * eventually be omitted, and the failure is a cross-org data leak.
 */
export interface RequestContext {
  /** The organisation whose data this request may touch. */
  orgId: string
  /** The user acting. Writes are attributed to them. */
  userId: string
}

const storage = new AsyncLocalStorage<RequestContext>()

/**
 * Runs `fn` with the given context visible to everything it awaits.
 */
export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T,
): T {
  return storage.run(context, fn)
}

/**
 * The current context, or `undefined` outside a request — during startup, in a
 * migration, or in a background job that has not established one.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

/**
 * The current context, or a thrown error.
 *
 * Callers that cannot proceed safely without knowing the org must use this
 * rather than defaulting to something. There is no sensible default: guessing
 * an org is how one tenant's data reaches another.
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
