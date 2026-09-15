/**
 * What a row action on the members list answers with.
 *
 * A result rather than a throw, and in its own module rather than beside the
 * actions: a `'use server'` file may export nothing but async functions, so a
 * type survives only because types are erased — a constant would arrive in the
 * browser as `undefined`.
 *
 * Nothing comes back on success. The page revalidates, so the row redraws from
 * what the server holds rather than from a shape this side assembled.
 */
export type MemberOutcome = { ok: true } | { ok: false; message: string }
