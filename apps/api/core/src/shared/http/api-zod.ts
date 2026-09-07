import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiQuery } from '@nestjs/swagger'
import { z } from 'zod'

/**
 * The schema shape Swagger accepts, pulled out of its own public signature
 * rather than deep-imported from `@nestjs/swagger/dist/…` — that path exists
 * on disk but is not in the package's `exports` map, so importing it resolves
 * at runtime and fails to compile.
 */
type SchemaObject = NonNullable<
  Extract<Parameters<typeof ApiBody>[0], { schema?: unknown }>['schema']
>

/**
 * Puts the zod schema a route already validates with onto its Swagger entry.
 *
 * `/docs` is something the rest of the team reads this phase, and a page that
 * lists every endpoint without saying what to send is close to useless for
 * that: the summary tells you a route exists, and then you guess the body.
 *
 * The schema is the same object the `ZodValidationPipe` enforces, so the two
 * cannot drift — the alternative is a parallel set of DTO classes carrying
 * `@ApiProperty`, which is the arrangement where documentation and validation
 * disagree and only the documentation is wrong.
 *
 * ⚠️ **`io: 'input'`** — what a caller sends, not what the service receives.
 * The two differ wherever a schema transforms: `dueDate` is an ISO string on
 * the way in and a `Date` after parsing, and documenting the `Date` would tell
 * everyone to send the wrong thing.
 *
 * `unrepresentable: 'any'` because zod refuses to describe some transformed
 * values; that is the honest answer for those few fields rather than a reason
 * to have no documentation at all.
 *
 * Uses zod 4's built-in conversion — no extra dependency, and no chance of a
 * converter falling behind the zod the schemas are written in.
 */
function toOpenApi(schema: z.ZodType): SchemaObject {
  const converted = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  })

  // `$schema` is JSON Schema's own dialect marker and means nothing to
  // OpenAPI, which shows it as a stray field on every model.
  delete converted['$schema']

  return converted as SchemaObject
}

/** The request body this route accepts, from the schema that validates it. */
export function ApiZodBody(schema: z.ZodType): MethodDecorator {
  return ApiBody({ schema: toOpenApi(schema) })
}

/**
 * The query string this route accepts, one parameter per top-level property.
 *
 * OpenAPI describes a query as separate parameters rather than as one object,
 * so the schema is taken apart here. A property that accepts either one value
 * or an array is exactly the repeated parameter the API uses for "is in".
 */
export function ApiZodQuery(schema: z.ZodType): MethodDecorator {
  const converted = toOpenApi(schema) as {
    properties?: Record<string, unknown>
    required?: string[]
  }
  const required = new Set(converted.required ?? [])

  return applyDecorators(
    ...Object.entries(converted.properties ?? {}).map(([name, property]) =>
      ApiQuery({
        name,
        required: required.has(name),
        schema: property as SchemaObject,
      }),
    ),
  )
}
