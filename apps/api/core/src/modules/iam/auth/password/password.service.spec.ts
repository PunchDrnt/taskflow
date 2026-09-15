import { describe, expect, it } from 'vitest'

import { PasswordService } from './password.service'

const passwords = new PasswordService()

describe('PasswordService', () => {
  it('verifies a password against its own hash', async () => {
    const hash = await passwords.hash('correct horse battery staple')

    await expect(
      passwords.verify(hash, 'correct horse battery staple'),
    ).resolves.toBe(true)
    await expect(
      passwords.verify(hash, 'Correct horse battery staple'),
    ).resolves.toBe(false)
  })

  it('salts, so the same password hashes differently every time', async () => {
    const first = await passwords.hash('same')
    const second = await passwords.hash('same')

    expect(first).not.toBe(second)
    await expect(passwords.verify(second, 'same')).resolves.toBe(true)
  })

  it('produces an argon2id hash, not argon2i or argon2d', async () => {
    // The PHC string names the algorithm, so this is the only thing that
    // actually proves which one ran. The library's default is argon2id and
    // the service leans on it rather than passing options.
    expect(await passwords.hash('x')).toMatch(/^\$argon2id\$/)
  })

  it('answers false for a corrupted stored hash rather than throwing', async () => {
    // A 500 here would tell anyone watching that this row is different from a
    // row with a merely wrong password.
    await expect(passwords.verify('not-a-hash', 'x')).resolves.toBe(false)
    await expect(passwords.verify('', 'x')).resolves.toBe(false)
  })
})
