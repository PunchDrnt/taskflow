import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

/** docs/01-architecture.md#auth. Short, because the session check is what revokes. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60
/** The ceiling on `sessions.expires_at`. "Remember me" chooses a shorter one. */
export const REFRESH_TOKEN_TTL_SECONDS = 15 * 24 * 60 * 60

/**
 * What the access token carries, and all it carries.
 *
 * No role, no name, no email, and — since the replan — no org either. Both
 * omissions have the same reason: anything in here survives until the token
 * expires, so an admin revoking a role or removing someone from an org would
 * wait fifteen minutes to take effect. The guard reads the session on every
 * request anyway, so resolving them there costs nothing.
 */
export interface AccessTokenPayload {
  /** The user id. */
  sub: string
  /** The session id — which login this is, so one device can be revoked. */
  sid: string
}

/**
 * Mints and reads the two tokens. Knows nothing about sessions or users; it
 * turns ids into strings and back.
 *
 * The two are deliberately different kinds of thing. The **access token** is a
 * signed JWT because it is read on every request and a database round trip per
 * read would be the wrong trade. The **refresh token** is 32 opaque random
 * bytes because it is read rarely and must be revocable the instant it is
 * used — a signed token cannot be un-signed, so its only home is a row, and
 * what the row holds is the sha256 of it. The plaintext exists in the reply
 * and in the browser's cookie jar, never in the database: a leaked dump then
 * hands over no usable session.
 *
 * sha256 and not argon2, unlike a password: this is 256 bits of randomness
 * from a CSPRNG, not something a person chose, so there is no dictionary to
 * run against it and nothing for a slow hash to buy.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  /** `exp` is added by JwtService from the module's `expiresIn`. */
  signAccessToken(payload: AccessTokenPayload): string {
    return this.jwt.sign(payload)
  }

  /**
   * Null for anything wrong — bad signature, expired, or a payload missing the
   * two claims. The caller answers 401 either way, and one code path for
   * "this token is not usable" is one fewer place to leak which it was.
   */
  verifyAccessToken(token: string): AccessTokenPayload | null {
    try {
      const claims = this.jwt.verify<Partial<AccessTokenPayload>>(token)

      if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string') {
        return null
      }

      return { sub: claims.sub, sid: claims.sid }
    } catch {
      return null
    }
  }

  /** The plaintext, handed to the browser once and never stored. */
  createRefreshToken(): string {
    return randomBytes(32).toString('base64url')
  }

  /** What `sessions.current_token_hash` holds. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Constant-time, for the grace-window comparison that happens in JavaScript
   * rather than in the `UPDATE`'s `WHERE`. The rotation itself compares in
   * Postgres and needs no help; this one is here so the two paths do not
   * differ in how long they take to say no.
   */
  refreshTokenMatches(token: string, storedHash: string): boolean {
    const presented = Buffer.from(this.hashRefreshToken(token), 'hex')
    const stored = Buffer.from(storedHash, 'hex')

    return (
      presented.length === stored.length && timingSafeEqual(presented, stored)
    )
  }
}
