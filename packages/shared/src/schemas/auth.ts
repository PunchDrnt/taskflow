import { z } from 'zod'

import { idSchema } from './id.js'

/** docs/01-architecture.md#password--rate-limit */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Trimmed and lower-cased before it reaches the database. `identity.users.email`
 * is `citext`, so the column would match either way — this keeps what is stored
 * and echoed back consistent instead.
 */
export const emailSchema = z
  .email('อีเมลไม่ถูกต้อง')
  .trim()
  .toLowerCase()
  .max(320, 'อีเมลยาวเกินไป')

/** For setting a password. Checking one at login uses `presentedPassword`. */
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `รหัสผ่านต้องมีอย่างน้อย ${PASSWORD_MIN_LENGTH} ตัว`,
  )
  // argon2 has no meaningful input limit, but an unbounded one is free CPU for
  // whoever sends a megabyte of it.
  .max(256, 'รหัสผ่านยาวเกินไป')

/**
 * Deliberately not `passwordSchema`: the policy can tighten later, and an
 * account whose password predates the change must still be able to sign in.
 * Rejecting it here would also tell an attacker the length rule for free.
 */
const presentedPassword = z.string().min(1, 'กรุณากรอกรหัสผ่าน')

export const loginSchema = z.object({
  email: emailSchema,
  password: presentedPassword,
  /**
   * "Remember me" is not a mechanism, only a number: how long
   * `sessions.expires_at` is set to. Nothing downstream branches on it.
   */
  rememberMe: z.boolean().default(false),
})

export type LoginInput = z.infer<typeof loginSchema>

/** `POST /v1/me/active-org` — which org the caller is acting for. */
export const setActiveOrgSchema = z.object({
  orgId: idSchema('org ไม่ถูกต้อง'),
})

export type SetActiveOrgInput = z.infer<typeof setActiveOrgSchema>

/**
 * The codes the sign-in screens branch on. Here rather than in
 * `API_ERROR_CODES` for the reason given there: that file is for codes no
 * feature owns, and every module collecting its codes into it would make it a
 * file everyone edits.
 *
 * The last two are the pair most easily collapsed into one, and must not be.
 * `orgId` is null for two reasons that need different screens — see
 * docs/01-architecture.md#org-ไหนของ-request-นี้.
 */
export const AUTH_ERROR_CODES = {
  /** Wrong email or wrong password. Deliberately does not say which. */
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** Too many failures. Says locked, never says for how long. */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** The password was right; the account is deactivated or being deleted. */
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  /** The refresh token is spent, revoked, or was never ours. Sign in again. */
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  /** Signed in and a member of no org at all → Home, create the first one. */
  NO_ORGANIZATION: 'NO_ORGANIZATION',
  /** Signed in, a member of several, and has not picked → the org picker. */
  ORG_NOT_SELECTED: 'ORG_NOT_SELECTED',
} as const

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]
