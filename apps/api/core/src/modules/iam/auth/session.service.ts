import { Injectable } from '@nestjs/common'

import { InjectOrgRepository } from '#shared/org-scope/org-repository.provider'
import { OrgScopedRepository } from '#shared/org-scope/org-scoped.repository'

import { Session } from './session.entity'
import { REFRESH_TOKEN_TTL_SECONDS } from './token.service'

/** "Remember me" ticked. The ceiling, and what the refresh cookie is set to. */
export const REMEMBERED_SESSION_TTL_SECONDS = REFRESH_TOKEN_TTL_SECONDS
/** Not ticked: a working day, so a shared or borrowed machine forgets by itself. */
export const SESSION_TTL_SECONDS = 12 * 60 * 60

/**
 * How long a rotated token stays usable, for the tab that was a moment behind.
 * Ten seconds is long enough for two tabs waking together and far too short to
 * be worth stealing.
 */
export const ROTATION_GRACE_MS = 10_000

/** What `create` needs from the request, and what the columns will not accept null for. */
export interface SessionOrigin {
  userAgent: string
  ipAddress: string
}

export interface SessionRecord {
  id: string
  userId: string
}

/**
 * `iam.sessions`: one row per login, for the life of that login.
 *
 * Rotation changes hashes in place rather than inserting — the row is the
 * session, so "sign out this device" stays one row to revoke however many
 * times the token has turned over.
 *
 * Every query is `queryBuilder.base`, which is the only option: `iam.*`
 * has no `org_id`, and a session is not an org's row anyway — the same person
 * uses one session across every org they belong to.
 */
@Injectable()
export class SessionService {
  constructor(
    @InjectOrgRepository(Session)
    private readonly sessions: OrgScopedRepository<Session>,
  ) {}

  /**
   * `createdBy` is the caller's own id and not always `userId` — an
   * impersonating admin in Phase 7 differs, and the column is what says so.
   */
  async create(
    userId: string,
    tokenHash: string,
    origin: SessionOrigin,
    remember: boolean,
    now = new Date(),
  ): Promise<SessionRecord> {
    const ttl = remember ? REMEMBERED_SESSION_TTL_SECONDS : SESSION_TTL_SECONDS

    const inserted = await this.sessions.queryBuilder
      .base('session')
      .insert()
      .into(Session)
      .values({
        userId,
        currentTokenHash: tokenHash,
        previousTokenHash: null,
        userAgent: origin.userAgent,
        ipAddress: origin.ipAddress,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + ttl * 1000),
        createdBy: userId,
        updatedBy: userId,
      })
      .returning('id')
      .execute()

    return { id: (inserted.raw as { id: string }[])[0]!.id, userId }
  }

  /** Live means: exists, not revoked, not expired. Says nothing about the user. */
  findLive(id: string, now = new Date()): Promise<Session | null> {
    return this.sessions.queryBuilder
      .base('session')
      .where('session.id = :id', { id })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now })
      .getOne()
  }

  /** For refresh: found by what was presented, not by an id the caller supplies. */
  findByCurrentToken(
    tokenHash: string,
    now = new Date(),
  ): Promise<Session | null> {
    return this.sessions.queryBuilder
      .base('session')
      .where('session.currentTokenHash = :tokenHash', { tokenHash })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now })
      .getOne()
  }

  /**
   * 🔒 Rotates in **one statement**, and returns the row only if this call is
   * the one that did it.
   *
   * The condition lives in the `UPDATE`'s own `WHERE`, never in a `SELECT`
   * before it. Two refreshes arriving together both read the same
   * `current_token_hash`, both decide it is valid, and both rotate — and the
   * second one overwrites `previous_token_hash` with a value the first just
   * wrote, so the first client's brand-new token is now unknown to the row and
   * its next refresh looks like theft. Postgres serialises the two `UPDATE`s
   * on the row instead: the loser matches nothing and gets an empty
   * `RETURNING`, which is a lost race and **not** a rotation.
   *
   * The same lesson as `OutboxWorker.claim()`, where read-then-write sent
   * twenty-three emails for twelve rows.
   */
  async rotate(
    presentedHash: string,
    nextHash: string,
    now = new Date(),
  ): Promise<SessionRecord | null> {
    const result = await this.sessions.queryBuilder
      .base('session')
      .update(Session)
      .set({
        previousTokenHash: () => 'current_token_hash',
        currentTokenHash: nextHash,
        rotatedAt: now,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where('current_token_hash = :presentedHash', { presentedHash })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > :now', { now })
      // ⚠️ Property names going in, column names coming back out, and a name
      // that is neither is dropped from the SQL without a word. This read
      // `['id', 'user_id']` and shipped: `user_id` matches no property, so it
      // never reached the RETURNING clause, `userId` came back undefined, and
      // every access token minted by a refresh carried no `sub` — unusable,
      // so every request after the first refresh answered 401. Measured
      // against TypeORM 0.3 on 2026-09-04; test/auth.spec.ts now signs a
      // request with the rotated token rather than trusting that one exists.
      .returning(['id', 'userId'])
      .execute()

    const rows = result.raw as { id: string; user_id: string }[]
    if (rows.length === 0) return null

    const rotated = rows[0]!
    // Belt and braces for the silent drop above: a rotation that cannot name
    // its user is not a rotation, and failing here beats minting a token that
    // authenticates nobody.
    if (typeof rotated.user_id !== 'string') {
      throw new Error(
        'Rotation returned no user_id. `returning()` takes entity property ' +
          'names and silently ignores anything else — check the argument.',
      )
    }

    return { id: rotated.id, userId: rotated.user_id }
  }

  /**
   * The token that was rotated away from, for telling a slow tab apart from a
   * stolen token. Deliberately ignores `revoked_at`: a session already revoked
   * for reuse must still be recognisable, or the second presentation of a
   * stolen token reads as an ordinary unknown one.
   */
  findByPreviousToken(tokenHash: string): Promise<Session | null> {
    return this.sessions.queryBuilder
      .base('session')
      .where('session.previousTokenHash = :tokenHash', { tokenHash })
      .getOne()
  }

  async revoke(id: string, reason: string, now = new Date()): Promise<void> {
    await this.sessions.queryBuilder
      .base('session')
      .update(Session)
      .set({ revokedAt: now, revokedReason: reason, updatedAt: now })
      .where('id = :id', { id })
      .andWhere('revoked_at IS NULL')
      .execute()
  }

  /** Sign out everywhere. `except` keeps the session asking for it alive. */
  async revokeAllForUser(
    userId: string,
    reason: string,
    except?: string,
    now = new Date(),
  ): Promise<number> {
    const query = this.sessions.queryBuilder
      .base('session')
      .update(Session)
      .set({ revokedAt: now, revokedReason: reason, updatedAt: now })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')

    if (except !== undefined) {
      query.andWhere('id <> :except', { except })
    }

    return (await query.execute()).affected ?? 0
  }

  /**
   * Written only when the stored value is more than five minutes stale.
   *
   * Per-request would make `sessions` the hottest table in the schema for a
   * column nothing reads in a query — every request writing a row is every
   * request producing dead tuples for autovacuum. Five minutes is far finer
   * than "when was this device last used" is ever read at.
   */
  async touch(session: Session, now = new Date()): Promise<void> {
    if (now.getTime() - session.lastUsedAt.getTime() < 5 * 60_000) return

    await this.sessions.queryBuilder
      .base('session')
      .update(Session)
      .set({ lastUsedAt: now })
      .where('id = :id', { id: session.id })
      .execute()
  }
}
