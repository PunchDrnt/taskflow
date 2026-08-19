import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm'

/**
 * Maps camelCase entity properties onto snake_case database identifiers, so
 * entities read as TypeScript and the schema reads as Postgres without a
 * `@Column({ name })` on every single field.
 *
 * This is the one place the two naming conventions meet — see
 * .claude/docs/01-architecture.md#naming. Raw SQL and migrations still spell
 * snake_case out by hand; only the entity mapping is automatic.
 *
 * Written here rather than pulled from `typeorm-naming-strategies`, which
 * still declares a peer range of `^0.2.0 || ^0.3.0` and reaches into
 * `typeorm/util/StringUtils` — an internal path, not part of TypeORM's public
 * API. The conversion below is byte-for-byte the same algorithm.
 */
function snakeCase(input: string): string {
  return (
    input
      // ABc -> a_bc
      .replaceAll(/([A-Z])([A-Z])([a-z])/g, '$1_$2$3')
      // aC -> a_c
      .replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toLowerCase()
  )
}

export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  override tableName(className: string, customName: string | undefined) {
    return customName ?? snakeCase(className)
  }

  override columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ) {
    return (
      snakeCase(embeddedPrefixes.concat('').join('_')) +
      (customName ?? snakeCase(propertyName))
    )
  }

  override relationName(propertyName: string) {
    return snakeCase(propertyName)
  }

  override joinColumnName(relationName: string, referencedColumnName: string) {
    return snakeCase(`${relationName}_${referencedColumnName}`)
  }

  override joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ) {
    return snakeCase(
      `${firstTableName}_${firstPropertyName.replaceAll('.', '_')}_${secondTableName}`,
    )
  }

  override joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ) {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`)
  }
}
