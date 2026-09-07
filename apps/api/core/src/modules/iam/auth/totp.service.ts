import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { generateSecret, generateSync, generateURI } from 'otplib'

import type { Env } from '../../../config/env'

/** How many 30-second steps either side of now a code is still accepted. */
const WINDOW_STEPS = 1

/** Seconds per TOTP step — RFC 6238's default, and every app's assumption. */
export const TOTP_STEP_SECONDS = 30

/** Issued once when 2FA is switched on, and never shown again. */
export const RECOVERY_CODE_COUNT = 10

/** What the label in the authenticator app says, before the account name. */
const ISSUER = 'Taskflow'

/**
 * The mechanics of TOTP: making a secret, keeping it unreadable at rest, and
 * saying whether a six-digit code is the one this moment produces.
 *
 * `otplib` rather than thirty lines of HMAC: RFC 6238 is simple enough to
 * write and easy enough to get subtly wrong — base32 alphabets, step
 * arithmetic, the comparison — and this is the one place in the codebase where
 * a subtle bug is a security hole rather than a defect. CLAUDE.md's
 * dependency-light rule is about the starter template; a second factor is
 * project logic either way.
 *
 * Owns no rows. `TwoFactorService` decides what the answers mean.
 */
@Injectable()
export class TotpService {
  private readonly key: Buffer

  constructor(config: ConfigService<Env, true>) {
    const encoded: string = config.get('TOTP_ENCRYPTION_KEY', { infer: true })

    this.key = Buffer.from(encoded, 'base64')
  }

  createSecret(): string {
    return generateSecret()
  }

  /**
   * The `otpauth://` URI a QR code encodes. Returned to the browser, which
   * draws the QR itself — rendering one here would mean an image library and a
   * round trip for something the client can do from a string.
   */
  otpauthUrl(secret: string, accountName: string): string {
    return generateURI({
      issuer: ISSUER,
      label: accountName,
      secret,
      period: TOTP_STEP_SECONDS,
    })
  }

  /**
   * AES-256-GCM, output as `iv.tag.ciphertext` in base64.
   *
   * GCM rather than CBC because it authenticates as well as encrypts: a
   * tampered ciphertext fails to decrypt instead of yielding a different
   * secret. The IV is random per row and stored alongside — it is not secret,
   * only unique.
   */
  encrypt(secret: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    const enciphered = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ])

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      enciphered.toString('base64'),
    ].join('.')
  }

  decrypt(stored: string): string {
    const [iv, tag, ciphertext] = stored.split('.')
    if (!iv || !tag || !ciphertext) {
      throw new Error('Stored TOTP secret is not in the iv.tag.ciphertext form')
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(iv, 'base64'),
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64'))

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }

  /**
   * The step a code was generated for, or `null` if it is not a code for this
   * secret at all.
   *
   * The step comes back rather than a boolean because the caller has to reject
   * a code it has already accepted: a code stays valid for its whole window,
   * so without remembering the last step, one observed code works twice.
   */
  stepFor(secret: string, code: string, now = new Date()): number | null {
    const current = Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS)

    // The window is walked here rather than handed to `verifySync`'s
    // tolerance, because the caller needs to know *which* step matched: that
    // is what makes replay detectable. A boolean cannot say it.
    for (let offset = -WINDOW_STEPS; offset <= WINDOW_STEPS; offset += 1) {
      const step = current + offset
      const expected = generateSync({
        secret,
        period: TOTP_STEP_SECONDS,
        epoch: step * TOTP_STEP_SECONDS,
      })

      if (equal(expected, code.trim())) return step
    }

    return null
  }

  /** Ten of them, shown once. Format is cosmetic; the entropy is the 40 bits. */
  createRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(5).toString('hex')
      return `${raw.slice(0, 5)}-${raw.slice(5)}`
    })
  }

  hashRecoveryCode(code: string): string {
    return createHash('sha256').update(code.trim().toLowerCase()).digest('hex')
  }
}

/** Constant-time, so a wrong code does not say *how* wrong by how long it took. */
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  return left.length === right.length && timingSafeEqual(left, right)
}
