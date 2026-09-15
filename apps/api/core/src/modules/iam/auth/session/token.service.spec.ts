import { JwtService } from '@nestjs/jwt'
import { describe, expect, it } from 'vitest'

import {
  ACCESS_TOKEN_TTL_SECONDS,
  TokenService,
  type AccessTokenPayload,
} from './token.service'

const secret = 'test-secret-at-least-thirty-two-characters'

/** The same options auth.module.ts binds, since half of what is asserted is them. */
function tokenService(overrides?: { secret?: string }): TokenService {
  return new TokenService(
    new JwtService({
      secret: overrides?.secret ?? secret,
      signOptions: {
        algorithm: 'HS256',
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      },
      verifyOptions: { algorithms: ['HS256'] },
    }),
  )
}

const payload: AccessTokenPayload = { sub: 'user-1', sid: 'session-1' }

describe('access tokens', () => {
  const tokens = tokenService()

  it('round-trips the two claims it carries', () => {
    expect(tokens.verifyAccessToken(tokens.signAccessToken(payload))).toEqual(
      payload,
    )
  })

  it('carries no org, no role and nothing else identifying', () => {
    // The rule the whole guard design rests on: anything in here survives
    // until the token expires, so removing a role or an org membership would
    // take fifteen minutes to bite.
    const claims = JSON.parse(
      Buffer.from(
        tokens.signAccessToken(payload).split('.')[1]!,
        'base64url',
      ).toString(),
    ) as Record<string, unknown>

    expect(Object.keys(claims).sort()).toEqual(['exp', 'iat', 'sid', 'sub'])
  })

  it('expires fifteen minutes out', () => {
    const claims = JSON.parse(
      Buffer.from(
        tokens.signAccessToken(payload).split('.')[1]!,
        'base64url',
      ).toString(),
    ) as { iat: number; exp: number }

    expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS)
  })

  it('returns null for a token signed with another secret', () => {
    const foreign = tokenService({
      secret: 'a-completely-different-secret-key!',
    })

    expect(
      tokens.verifyAccessToken(foreign.signAccessToken(payload)),
    ).toBeNull()
  })

  it('returns null rather than throwing for anything malformed', () => {
    expect(tokens.verifyAccessToken('')).toBeNull()
    expect(tokens.verifyAccessToken('not.a.jwt')).toBeNull()
  })

  it('refuses an unsigned token claiming alg: none', () => {
    // The classic JWT forgery. `algorithms: ['HS256']` on the verifier is what
    // stops it, which is why auth.module.ts names an algorithm it could have
    // left to the default.
    const header = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url')
    const body = Buffer.from(
      JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url')

    expect(tokens.verifyAccessToken(`${header}.${body}.`)).toBeNull()
  })

  it('returns null for a validly signed token missing sid', () => {
    // Signed by us, so the signature check passes and only the shape check
    // catches it — a session id is what makes logout work.
    const jwt = new JwtService({ secret, signOptions: { algorithm: 'HS256' } })

    expect(tokens.verifyAccessToken(jwt.sign({ sub: 'user-1' }))).toBeNull()
  })
})

describe('refresh tokens', () => {
  const tokens = tokenService()

  it('mints 256 bits of randomness, never the same twice', () => {
    const first = tokens.createRefreshToken()

    expect(Buffer.from(first, 'base64url')).toHaveLength(32)
    expect(first).not.toBe(tokens.createRefreshToken())
  })

  it('stores a hash, so the plaintext appears in no row', () => {
    const token = tokens.createRefreshToken()
    const hash = tokens.hashRefreshToken(token)

    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
    // Stable, or a session could never be found by the token presented.
    expect(tokens.hashRefreshToken(token)).toBe(hash)
  })

  it('matches a token against a stored hash and rejects any other', () => {
    const token = tokens.createRefreshToken()
    const hash = tokens.hashRefreshToken(token)

    expect(tokens.refreshTokenMatches(token, hash)).toBe(true)
    expect(tokens.refreshTokenMatches(tokens.createRefreshToken(), hash)).toBe(
      false,
    )
  })

  it('answers false for a stored hash of the wrong length', () => {
    // timingSafeEqual throws on a length mismatch, so the guard in front of it
    // is what keeps a truncated row from becoming a 500.
    const token = tokens.createRefreshToken()

    expect(tokens.refreshTokenMatches(token, 'deadbeef')).toBe(false)
    expect(tokens.refreshTokenMatches(token, '')).toBe(false)
  })
})
