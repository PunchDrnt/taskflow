import { z } from 'zod'

import { idSchema } from './id.js'
import { usernameSchema } from './user.js'

/** docs/01-architecture.md#password--rate-limit */
export const PASSWORD_MIN_LENGTH = 8

/**
 * Trimmed and lower-cased before it reaches the database. `identity.users.email`
 * is `citext`, so the column would match either way — this keeps what is stored
 * and echoed back consistent instead.
 */
export const emailSchema = z
  .email('Enter a valid email address')
  .trim()
  .toLowerCase()
  .max(320, 'Email address is too long')

/** For setting a password. Checking one at login uses `presentedPassword`. */
export const passwordSchema = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  )
  // argon2 has no meaningful input limit, but an unbounded one is free CPU for
  // whoever sends a megabyte of it.
  .max(256, 'Password is too long')

/**
 * Deliberately not `passwordSchema`: the policy can tighten later, and an
 * account whose password predates the change must still be able to sign in.
 * Rejecting it here would also tell an attacker the length rule for free.
 */
const presentedPassword = z.string().min(1, 'Enter your password')

/**
 * One field, not two, and not a radio button. Whether somebody types their
 * email or their username is not a question worth asking them — the two
 * alphabets do not overlap, because a username may not contain `@` and a CHECK
 * enforces that. `UserService.findByLogin` picks the query from the shape.
 *
 * Deliberately looser than `emailSchema`: trimmed and lower-cased, but not
 * validated as an address, since most of the time it is not one. A value that
 * matches nothing gets the same INVALID_CREDENTIALS as a wrong password, which
 * is what stops this being a way to test which usernames exist.
 */
const loginIdentifier = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email or username')
  .max(320, 'Too long')

export const loginSchema = z.object({
  login: loginIdentifier,
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
  orgId: idSchema('Invalid organisation id'),
})

export type SetActiveOrgInput = z.infer<typeof setActiveOrgSchema>

/**
 * `PATCH /v1/me/password`.
 *
 * `confirmNewPassword` is checked here as well as in the form. The client is
 * where the mismatch should be caught, because that is where it can be shown
 * next to the field — but "the client already checked" is not a property the
 * API can rely on, and the cost of checking again is one `refine`.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: presentedPassword,
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'New passwords do not match',
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/** `POST /v1/auth/forgot-password` — answers 204 either way. */
export const forgotPasswordSchema = z.object({ email: emailSchema })

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

/** `POST /v1/auth/reset-password` — the code comes from the emailed link. */
export const resetPasswordSchema = z
  .object({
    code: z.string().min(1, 'Invalid link'),
    newPassword: passwordSchema,
    confirmNewPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'New passwords do not match',
  })

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

/**
 * `POST /v1/auth/register` — gated by `public_registration`, which is off.
 *
 * No `orgId`: registering creates a person, not a membership. Somebody who
 * signs up belongs to nothing until an admin adds them, which is exactly why
 * the feature is off — otherwise anyone who knows the URL can sit in the
 * system waiting for a mis-click.
 */
export const registerSchema = z
  .object({
    email: emailSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    name: z
      .string()
      .trim()
      .min(1, 'Enter your name')
      .max(200, 'Name is too long'),
    nickname: z
      .string()
      .trim()
      .min(1, 'Enter a nickname')
      .max(100, 'Nickname is too long'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

export type RegisterInput = z.infer<typeof registerSchema>

/** The six digits from the app, or one of the recovery codes. */
const twoFactorCode = z
  .string()
  .trim()
  .min(1, 'Enter the verification code')
  .max(64, 'Verification code is too long')

/** `POST /v1/auth/login/2fa` — the second step, holding the challenge cookie. */
export const twoFactorLoginSchema = z.object({ code: twoFactorCode })
export type TwoFactorLoginInput = z.infer<typeof twoFactorLoginSchema>

/**
 * `POST /v1/me/2fa/setup` — the password is required even though the caller is
 * signed in: somebody who has taken a session could otherwise enrol their own
 * authenticator and lock the owner out of their account.
 */
export const twoFactorSetupSchema = z.object({ password: presentedPassword })
export type TwoFactorSetupInput = z.infer<typeof twoFactorSetupSchema>

/** `POST /v1/me/2fa/enable` — proves the secret reached the app. */
export const twoFactorEnableSchema = z.object({ code: twoFactorCode })
export type TwoFactorEnableInput = z.infer<typeof twoFactorEnableSchema>

/** `DELETE /v1/me/2fa` — same reasoning as setup, in the other direction. */
export const twoFactorDisableSchema = z.object({ password: presentedPassword })
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>

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
  /**
   * `currentPassword` on a change did not match. Separate from
   * INVALID_CREDENTIALS because the screen is different — the caller is
   * already signed in, and the field to highlight is not the email.
   */
  WRONG_CURRENT_PASSWORD: 'WRONG_CURRENT_PASSWORD',
  /**
   * The reset link is wrong, already spent, or expired. One code for all
   * three, so a guessed code cannot be told apart from a stale one.
   */
  INVALID_RESET_CODE: 'INVALID_RESET_CODE',
  /**
   * Public sign-up is switched off for this installation. Not FORBIDDEN: the
   * caller is not being refused permission, the feature is not on at all, and
   * the screen to show is "ask an admin to invite you" rather than "you may
   * not do that".
   */
  REGISTRATION_DISABLED: 'REGISTRATION_DISABLED',
  /** Sign-up only: that address already has an account. */
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  /** Sign-up or a profile edit: somebody already answers to that name. */
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  /** A profile edit: that number is on another live account. */
  PHONE_TAKEN: 'PHONE_TAKEN',
  /**
   * The password was right and a second factor is now needed. Not an error —
   * a step. The client shows the code field rather than a failure.
   */
  TWO_FACTOR_REQUIRED: 'TWO_FACTOR_REQUIRED',
  /** Wrong, expired, or already used — one code for all three. */
  INVALID_TWO_FACTOR_CODE: 'INVALID_TWO_FACTOR_CODE',
  /** Setup asked for while it is already on. */
  TWO_FACTOR_ALREADY_ENABLED: 'TWO_FACTOR_ALREADY_ENABLED',
  /** Enable called before setup minted a secret. */
  TWO_FACTOR_SETUP_NOT_STARTED: 'TWO_FACTOR_SETUP_NOT_STARTED',
} as const

export type AuthErrorCode =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES]
