import type { DataSource } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { updateProfileSchema } from '@repo/shared'

import { createOrgScopedRepository } from '#shared/org-scope/org-scoped.repository'
import { SYSTEM_USER_ID } from '#shared/system-user'

import { User } from '../src/modules/identity/user/user.entity'
import { UserService } from '../src/modules/identity/user/user.service'
import { createMigratedTestDataSource, hasTestDatabase } from './database'

/**
 * What a person can change about their own account: the profile here, and the
 * two password paths that follow it.
 *
 * Separate from `auth.spec.ts` because the question is different — that file
 * asks whether somebody may get in, this one asks what they may change once
 * they are in.
 */
describe.skipIf(!hasTestDatabase)('account', () => {
  let dataSource: DataSource
  let users: UserService
  let counter = 0

  const newUser = async (): Promise<string> => {
    counter += 1
    const [user] = (await dataSource.query(
      `INSERT INTO identity.users
         (email, name, nickname, status, created_by, updated_by)
       VALUES ($1, $2, $2, 'active', $3, $3) RETURNING id`,
      [`account-${counter}@example.test`, `user-${counter}`, SYSTEM_USER_ID],
    )) as { id: string }[]

    return user!.id
  }

  /** The row itself, so the assertions read columns rather than a return value. */
  const rowOf = (id: string): Promise<User | null> =>
    dataSource.getRepository(User).findOneBy({ id })

  beforeAll(async () => {
    dataSource = await createMigratedTestDataSource()
    users = new UserService(createOrgScopedRepository(dataSource, User))
  })

  afterAll(async () => {
    await dataSource?.destroy()
  })

  describe('profile', () => {
    it('writes the three editable fields', async () => {
      const id = await newUser()

      await users.updateProfile(id, {
        name: 'Anong Wattana',
        nickname: 'หนึ่ง',
        avatarUrl: 'https://cdn.example.test/a.png',
      })

      expect(await rowOf(id)).toMatchObject({
        name: 'Anong Wattana',
        nickname: 'หนึ่ง',
        avatarUrl: 'https://cdn.example.test/a.png',
      })
    })

    it('clears the avatar with null rather than leaving the old one', async () => {
      const id = await newUser()
      await users.updateProfile(id, {
        name: 'a',
        nickname: 'a',
        avatarUrl: 'https://cdn.example.test/a.png',
      })

      await users.updateProfile(id, {
        name: 'a',
        nickname: 'a',
        avatarUrl: null,
      })

      expect((await rowOf(id))?.avatarUrl).toBeNull()
    })

    it('moves updated_at and updated_by, unlike the lockout counters', async () => {
      // The distinction UserService draws on purpose: a person edited this,
      // so the audit columns follow. `setLockoutState` leaves them alone.
      const id = await newUser()
      const before = await rowOf(id)

      await users.updateProfile(
        id,
        { name: 'b', nickname: 'b', avatarUrl: null },
        new Date(Date.now() + 60_000),
      )

      const after = await rowOf(id)
      expect(after!.updatedBy).toBe(id)
      expect(after!.updatedAt.getTime()).toBeGreaterThan(
        before!.updatedAt.getTime(),
      )
    })

    it('does not touch a soft-deleted row', async () => {
      const id = await newUser()
      await dataSource.query(
        `UPDATE identity.users
            SET status = 'deleted', deleted_at = now(), deleted_by = $2
          WHERE id = $1`,
        [id, SYSTEM_USER_ID],
      )

      await users.updateProfile(id, {
        name: 'ghost',
        nickname: 'ghost',
        avatarUrl: null,
      })

      expect((await rowOf(id))?.name).not.toBe('ghost')
    })
  })

  describe('updateProfileSchema', () => {
    const valid = { name: 'Somchai', nickname: 'Chai', avatarUrl: null }

    it('trims rather than rejecting padded input', () => {
      const result = updateProfileSchema.parse({
        ...valid,
        name: '  Somchai  ',
      })

      expect(result.name).toBe('Somchai')
    })

    it('refuses a blank nickname, which whitespace alone still is', () => {
      // Thai users are addressed by nickname first, so an empty one makes the
      // person unfindable by what colleagues actually call them.
      expect(
        updateProfileSchema.safeParse({ ...valid, nickname: '   ' }).success,
      ).toBe(false)
    })

    it('refuses an avatar that is not a URL, and accepts null', () => {
      expect(
        updateProfileSchema.safeParse({ ...valid, avatarUrl: 'nope' }).success,
      ).toBe(false)
      expect(updateProfileSchema.safeParse(valid).success).toBe(true)
    })

    it('has no email field, so one sent along is dropped', () => {
      // Changing the login identifier needs a confirmation round trip to the
      // new address; a profile PATCH must not be a back door into it.
      const result = updateProfileSchema.parse({
        ...valid,
        email: 'attacker@example.test',
      })

      expect(result).not.toHaveProperty('email')
    })
  })
})
