/**
 * The account automated writes are attributed to: `created_by` is NOT NULL
 * everywhere and a background job has no user to name.
 *
 * Migration `003` spells the same literal out rather than importing this;
 * `test/schema-invariants.spec.ts` holds the two together.
 */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
