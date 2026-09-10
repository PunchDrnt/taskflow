import { ApiError } from '../api/errors'

/**
 * What a form knows after a submission, for `useActionState`.
 *
 * One shape for every form here, and in its own module rather than beside the
 * action that returns it: a `'use server'` file may export async functions and
 * nothing else, so a constant exported from one arrives in the browser as
 * `undefined` and fails at the first property read rather than where the
 * mistake is.
 *
 * `error` is the line above the form; `fieldErrors` is the line under one
 * input. Both, because they answer different questions — "this did not work"
 * and "this box is wrong" — and a form that only has the first makes people
 * hunt for which field it meant.
 */
export interface FormState<Field extends string> {
  error: string | null
  fieldErrors: Partial<Record<Field, string>>
}

export function blankForm<Field extends string>(): FormState<Field> {
  return { error: null, fieldErrors: {} }
}

/**
 * The first message per field. One line under each input, not a stack of them:
 * zod reports every failed rule, and showing all of them turns a mistyped
 * prefix into a paragraph.
 */
export function fieldErrorsOf<Field extends string>(
  issues: readonly { path: PropertyKey[]; message: string }[],
  fields: readonly Field[],
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}

  for (const issue of issues) {
    const name = String(issue.path[0] ?? '')
    const field = fields.find((candidate) => candidate === name)

    if (field !== undefined && errors[field] === undefined) {
      errors[field] = issue.message
    }
  }

  return errors
}

/**
 * A failed request as form state, with the option of blaming one field.
 *
 * `NAME_TAKEN` is the case this exists for: the API answers with a code and a
 * sentence, and putting that sentence above the form leaves the person looking
 * for which of four boxes it is about. The caller maps the codes it knows;
 * anything else stays a message above the form, which is the honest place for
 * "the server said no" when nobody can say which box caused it.
 */
export function failureOf<Field extends string>(
  error: unknown,
  blame: Partial<Record<string, Field>> = {},
): FormState<Field> {
  if (!(error instanceof ApiError)) throw error

  const field = blame[error.code]

  return field === undefined
    ? { error: error.message, fieldErrors: {} }
    : {
        error: null,
        fieldErrors: { [field]: error.message } as Partial<
          Record<Field, string>
        >,
      }
}
