import { Injectable } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'

/**
 * Hashing and checking passwords, and nothing else — no database, no request
 * context, no policy about who may log in. That lives in AuthService.
 *
 * argon2id, per docs/04-features/phase-1.md#auth--users. `@node-rs/argon2`
 * ships prebuilt napi binaries, so there is no node-gyp in the Alpine builder
 * stage; the musl variant has to be in yarn.lock or the image fails at
 * require() and nowhere earlier.
 *
 * The cost parameters are the library's defaults on purpose — 19 MiB, two
 * passes, one thread, which is OWASP's first recommended argon2id profile.
 * Naming them here would freeze today's numbers into a constant nobody
 * revisits; the encoded hash carries its own parameters, so raising them later
 * still verifies every existing password.
 */
@Injectable()
export class PasswordService {
  /** Returns the PHC string — algorithm, parameters and salt included. */
  async hash(plaintext: string): Promise<string> {
    return hash(plaintext)
  }

  /**
   * False rather than a throw for a wrong password, since that is an expected
   * outcome and not an error. A malformed or truncated stored hash also
   * returns false: it means this password cannot be verified, which is the
   * same answer, and throwing would turn a corrupted row into a 500 that
   * distinguishes it from a wrong password for anyone watching.
   */
  async verify(storedHash: string, plaintext: string): Promise<boolean> {
    try {
      return await verify(storedHash, plaintext)
    } catch {
      return false
    }
  }
}
