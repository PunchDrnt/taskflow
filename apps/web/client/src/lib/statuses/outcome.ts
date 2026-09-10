/**
 * What a status write answers with.
 *
 * No row comes back, because a change to one status can move another: the
 * project keeps exactly one default, at least one status, and at least one
 * that counts as finished, so setting a default clears the previous one and a
 * delete can be refused by a rule about its neighbours. The page is
 * revalidated instead, and this says only whether that happened.
 *
 * In its own module because a `'use server'` file may export nothing but async
 * functions — types survive only by being erased.
 */
export type StatusOutcome = { ok: true } | { ok: false; message: string }
