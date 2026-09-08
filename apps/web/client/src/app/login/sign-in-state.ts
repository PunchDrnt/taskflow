/**
 * The sign-in form's state, in its own module and **not** in `actions.ts`.
 *
 * A `'use server'` file may export async functions and nothing else — Next
 * turns every export into a callable server reference, so a plain object
 * exported from there arrives in the client as `undefined`. That failure is
 * silent until render: `useActionState` is handed undefined as its initial
 * state and the first property read throws
 * `Cannot read properties of undefined`.
 */
export interface SignInState {
  /**
   * A password that was right but owes a second factor is neither an error nor
   * a success. Naming that state keeps the form from inferring it from the
   * absence of both.
   */
  stage: 'credentials' | 'two-factor'
  /** Shown above the form. Already English — the API answers in English. */
  error: string | null
  fieldErrors: Partial<Record<'login' | 'password' | 'code', string>>
}

export const SIGN_IN_START: SignInState = {
  stage: 'credentials',
  error: null,
  fieldErrors: {},
}
