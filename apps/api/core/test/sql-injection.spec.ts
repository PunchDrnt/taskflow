import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Nothing may become SQL *text* unless somebody wrote it.
 *
 * Every value that comes from a request goes to Postgres as a parameter —
 * `$1`, or `:named` through TypeORM — and a parameter can never be read as
 * syntax however it is spelled. That is the whole defence, and it holds today:
 * the audit that produced the list below found no user-controlled value
 * reaching SQL text anywhere in `src/`.
 *
 * An audit is a photograph, though. This is the part that keeps holding.
 *
 * It finds every place a string is built into SQL rather than passed to it —
 * an interpolation inside a query, or a query-builder method handed something
 * other than a literal — and fails on any that is not named below with a
 * reason. The reason is the point: identifiers cannot be parameterised, so
 * building them *is* sometimes the only way, and the question is never "does
 * this interpolate" but "where did that value come from". Writing the answer
 * down once is what stops the next person from having to re-derive it, and
 * stops a new one from slipping in under the cover of the old ones.
 *
 * ⚠️ **`ORDER BY` is the one to watch.** A column name cannot be a parameter,
 * so a sortable list is where this goes wrong in most codebases. Ours is safe
 * because `?sort=` is validated against a closed zod enum and then used as a
 * *key* into `TASK_SORTS`, whose five SQL fragments are author-written — see
 * that entry below. It is safe by construction and not by care, which is the
 * only kind of safe worth having.
 *
 * Scanned with the TypeScript parser rather than by regex, because this
 * codebase writes in backticks constantly and a docblock saying
 * `` `${orgId}` `` must not read as a query.
 *
 * `database/migrations/` is left out. Its DDL is written by hand, reviewed as
 * a schema change, and run by the deployer with no request anywhere near it —
 * the same carve-out, and the same reasoning, as `src/maintenance/` being
 * outside the `OrgScopedRepository` lint rule.
 */
// `process.cwd()` is the workspace: vitest runs with @api/core as its root,
// the same footing `code-map.spec.ts` stands on.
const SRC = join(process.cwd(), 'src')

/** Where SQL text is accepted. `query` is node-postgres; the rest are TypeORM. */
const SINKS = new Set([
  'query',
  'where',
  'andWhere',
  'orWhere',
  'having',
  'andHaving',
  'orHaving',
  'orderBy',
  'addOrderBy',
  'select',
  'addSelect',
  'groupBy',
  'addGroupBy',
])

/** The joins, whose SQL is the *third* argument — the first is an entity. */
const JOINS = new Set([
  'innerJoin',
  'leftJoin',
  'innerJoinAndSelect',
  'leftJoinAndSelect',
])

/**
 * A template literal that reads like SQL even though nothing here can see
 * where it ends up — `assignedTo()` in `task.service.ts` returns a fragment
 * from a plain function, and the call that uses it is three hundred lines
 * away. Either a statement keyword at the front or a parameter placeholder
 * anywhere in it; prose has neither.
 */
const STATEMENT =
  /^\s*(?:--[^\n]*\n\s*)*(select|insert|update|delete|create|alter|drop|truncate|exists|values|with\s+\w+\s+as)\b/i
const PLACEHOLDER = /\$\d|:\.\.\.[a-z]|:[a-z_]\w*\b/i

interface Allowance {
  /** Path relative to `src`. */
  file: string
  /** The expression, exactly as `found()` prints it. */
  value: string
  /** Where that value comes from, and why a request cannot reach it. */
  because: string
}

/**
 * Every interpolation that reaches SQL today, and the argument for each.
 *
 * A new entry is a decision to take seriously: it says a value is spliced into
 * a statement, so the reason has to end at something a request cannot touch —
 * a constant in this repository, or a name Postgres itself gave us.
 */
const ALLOWED: Allowance[] = [
  {
    file: 'shared/org-scope/query-builders.ts',
    value: 'alias',
    because:
      'The alias the calling service chose for its own query builder — ' +
      "`withOrg('task')`, written at the call site. The org id beside it is " +
      '`:__orgId`.',
  },
  {
    file: 'shared/org-scope/query-builders.ts',
    value: 'this.scopeColumn',
    because:
      "`'orgId'` or `'id'`, chosen when the repository is constructed: " +
      'organization.organizations scopes on its own primary key.',
  },
  {
    file: 'shared/entity/cascade-soft-delete.ts',
    value: 'query.table',
    because:
      'A `schema.table` from `AGGREGATE_CHILDREN`, the hand-written map at ' +
      'the top of this file, or the literal a service passes to ' +
      "`softDelete()` — `'project.projects'` and `'task.tasks'` are the two.",
  },
  {
    file: 'shared/entity/cascade-soft-delete.ts',
    value: 'child.column',
    because: 'A column name from `AGGREGATE_CHILDREN`, beside its table.',
  },
  {
    file: 'shared/entity/cascade-soft-delete.ts',
    value: 'orgColumn',
    because:
      "`'id'` or `'org_id'` — a ternary two lines above, on the table name.",
  },
  {
    file: 'shared/entity/cascade-soft-delete.ts',
    value: 'setUpdated',
    because:
      'Empty or one fixed `SET` clause, chosen by whether the entity has ' +
      '`updatedAt` — read from TypeORM metadata, not from a request.',
  },
  {
    file: 'shared/entity/cascade-soft-delete.ts',
    value: 'query.where',
    because:
      'Built a few lines above out of `child.column` and `$3`/`$4`. The ids ' +
      'being deleted are the parameters; only the column name is text.',
  },
  {
    file: 'maintenance/retention.service.ts',
    value: 'target.qualified',
    because:
      'Postgres named this one: `retention.policy.ts` reads the purge order ' +
      'from `pg_class`, already quoted by `quote_ident()`. No TypeScript ' +
      'string, let alone a request, chooses which table is swept.',
  },
  {
    file: 'maintenance/retention.service.ts',
    value: 'PURGE_BATCH_SIZE',
    because: '`1_000`, a number constant in `retention.policy.ts`.',
  },
  {
    file: 'maintenance/retention.service.ts',
    value: 'sql',
    because:
      'The statement `deleteInBatches` was handed by one of the four purge ' +
      'methods in this same file, repeated until a batch comes back short.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: 'rule.sql',
    because:
      '⚠️ The sort — the one place this could have gone wrong. `?sort=` is ' +
      'parsed by `z.enum(TASK_SORT_FIELDS)`, so it is one of five words or ' +
      'the request is already a 400; that word is then a *key* into ' +
      '`TASK_SORTS`, and what lands in the SQL is the fragment written ' +
      "beside it here. The direction is `rule.direction`, itself `'ASC'` or " +
      "`'DESC'` from a comparison. Nothing the caller typed is ever the text.",
  },
  {
    file: 'modules/task/task.service.ts',
    value: 'rule.cast',
    because:
      "The column's type for `CAST(:cursorValue0 AS …)`, from the same five " +
      'entries in `TASK_SORTS`. The cursor value itself is the parameter.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: 'index',
    because:
      'A loop counter, numbering the cursor parameters and their aliases.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: "branches.map((branch) => `(${branch})`).join(' OR ')",
    because:
      'The keyset comparison, assembled from `rule.sql` and the ' +
      '`:cursorValue<n>` placeholders in the loop above it. Parentheses and ' +
      '` OR `, nothing else.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: 'parameter',
    because:
      'The *name* of the parameter the `EXISTS` subquery will read the ' +
      'assignee ids from — see the two call sites below.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: "assignedTo('mine')",
    because:
      'A fixed fragment. The user id goes in as `mine`, a bound parameter.',
  },
  {
    file: 'modules/task/task.service.ts',
    value: "assignedTo('assigneeIds')",
    because:
      'The same fragment for the filter. `?assigneeId=` is bound to ' +
      '`assigneeIds`, never spliced.',
  },
  {
    file: 'database/seed/demo.ts',
    value: 'table',
    because:
      'A literal list in this file, and the seed is run by hand against a ' +
      'development database.',
  },
  {
    file: 'database/reset.ts',
    value: 'schema',
    because:
      'The `SCHEMAS` constant in this file. It drops schemas, which is why ' +
      'it refuses to run at all under `NODE_ENV=production`.',
  },
]

interface Finding {
  file: string
  line: number
  value: string
}

/**
 * Whether an expression can only ever be a string this repository wrote.
 *
 * Folding these is better than listing them: `'a' + 'b'` and
 * `done ? 'now()' : 'NULL'` are constants that happen to be spelled with an
 * operator, and an allow-list entry for each would be an exception granted to
 * something that is not an exception. A conditional qualifies only when *both*
 * branches do, so `done ? input : 'NULL'` still fails.
 */
function isWrittenHere(node: ts.Expression): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return true
  }
  if (ts.isParenthesizedExpression(node)) return isWrittenHere(node.expression)
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    return isWrittenHere(node.left) && isWrittenHere(node.right)
  }
  if (ts.isConditionalExpression(node)) {
    return isWrittenHere(node.whenTrue) && isWrittenHere(node.whenFalse)
  }

  return false
}

/** The argument carrying SQL, if this call is one that accepts SQL. */
function sqlArgument(node: ts.Node): ts.Expression | undefined {
  if (!ts.isCallExpression(node)) return undefined
  if (!ts.isPropertyAccessExpression(node.expression)) return undefined

  const method = node.expression.name.text

  if (SINKS.has(method)) return node.arguments[0]
  if (JOINS.has(method)) return node.arguments[2]

  return undefined
}

/** Every value built into SQL text in one file. */
function found(file: string, source: string): Finding[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const findings: Finding[] = []

  const at = (node: ts.Node): number =>
    parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1

  const text = (node: ts.Node): string =>
    node.getText(parsed).replace(/\s+/g, ' ').trim()

  const walk = (node: ts.Node): void => {
    const argument = sqlArgument(node)

    // Something other than a literal handed to a sink: a variable, a call, a
    // join of an array. The template literals among these are reported by
    // their interpolations instead, just below.
    if (
      argument !== undefined &&
      !isWrittenHere(argument) &&
      !ts.isTemplateExpression(argument) &&
      // TypeORM's own grouping API. It takes a callback, and the `where` calls
      // inside that callback are walked like any others.
      !(
        ts.isNewExpression(argument) && text(argument.expression) === 'Brackets'
      )
    ) {
      findings.push({ file, line: at(argument), value: text(argument) })
    }

    if (ts.isTemplateExpression(node)) {
      const cooked =
        node.head.text +
        node.templateSpans.map((span) => span.literal.text).join(' ')

      const isSql =
        STATEMENT.test(cooked) ||
        PLACEHOLDER.test(cooked) ||
        sqlArgument(node.parent) === node

      if (isSql) {
        for (const span of node.templateSpans) {
          if (isWrittenHere(span.expression)) continue

          findings.push({
            file,
            line: at(span.expression),
            value: text(span.expression),
          })
        }
      }
    }

    ts.forEachChild(node, walk)
  }

  walk(parsed)

  return findings
}

/** Every `.ts` under `src`, as paths relative to it. */
function sourceFiles(dir = SRC, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) return sourceFiles(join(dir, entry.name), path)

    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const findings = sourceFiles()
  .filter((file) => !file.startsWith('database/migrations/'))
  .flatMap((file) => found(file, readFileSync(join(SRC, file), 'utf8')))

const allows = (finding: Finding): boolean =>
  ALLOWED.some(
    (allowance) =>
      allowance.file === finding.file && allowance.value === finding.value,
  )

describe('SQL', () => {
  it('is never built out of anything but what is on the list', () => {
    const unexplained = findings
      .filter((finding) => !allows(finding))
      .map((finding) => `${finding.file}:${finding.line}  ${finding.value}`)

    // If this is your line: a value is being spliced into a statement rather
    // than bound to it. Bind it — `$1`, or `:name` — and this goes away. If it
    // is an identifier and cannot be bound, add it to ALLOWED with the reason
    // a request can never reach it.
    expect(unexplained).toEqual([])
  })

  it('has nothing on the list that has stopped existing', () => {
    // An allowance outlives its code silently, and the next reader takes it
    // for a thing that was thought about recently.
    const stale = ALLOWED.filter(
      (allowance) =>
        !findings.some(
          (finding) =>
            finding.file === allowance.file &&
            finding.value === allowance.value,
        ),
    ).map((allowance) => `${allowance.file}  ${allowance.value}`)

    expect(stale).toEqual([])
  })

  it('has a reason written against every allowance', () => {
    expect(ALLOWED.filter((one) => one.because.trim().length < 20)).toEqual([])
  })
})

/**
 * The scan itself, against source that is not in the repository.
 *
 * A checker that has quietly stopped matching anything passes every run it
 * will ever make. These two are the shapes it exists to tell apart.
 */
describe('the scan', () => {
  const sortedByHand = [
    'class Tasks {',
    '  list(sort: string) {',
    '    return this.db.query(`SELECT * FROM task.tasks ORDER BY ${sort}`)',
    '  }',
    '}',
  ].join('\n')

  const bound = [
    'class Tasks {',
    '  list(id: string) {',
    "    return this.db.query('SELECT * FROM task.tasks WHERE id = $1', [id])",
    '  }',
    '}',
  ].join('\n')

  it('catches a value interpolated into a statement', () => {
    expect(found('injected.ts', sortedByHand)).toEqual([
      { file: 'injected.ts', line: 3, value: 'sort' },
    ])
  })

  it('says nothing about a parameterised one', () => {
    expect(found('bound.ts', bound)).toEqual([])
  })

  it('reads a docblock as prose, not as a query', () => {
    const commented = [
      '/** Scoped to `${orgId}`, which is not a query at all. */',
      'export const NOTE = 1',
    ].join('\n')

    expect(found('note.ts', commented)).toEqual([])
  })
})
