/**
 * The account every automated write is attributed to.
 *
 * `created_by` / `updated_by` are NOT NULL on every table, and a background
 * job has no user to name. Rather than let the audit columns be guessed —
 * which `AuditColumnsSubscriber` deliberately refuses to do — jobs and
 * migrations write as this row.
 *
 * The id is fixed so it is recognisable in logs and identical in every
 * environment. `003 CreateIdentityUsers` seeds it, spelling the same literal
 * out rather than importing this constant: a migration whose meaning changes
 * when someone edits a constant is not a record of what was done. The two are
 * held together by `test/schema-invariants.spec.ts` instead.
 *
 * The row cannot sign in (`password_hash IS NULL`, enforced by CHECK) and
 * cannot be deleted (enforced by trigger).
 */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000'
