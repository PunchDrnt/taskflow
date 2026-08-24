import { z } from 'zod'

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
})

export type LoginInput = z.infer<typeof loginSchema>
