import type { DataSourceOptions } from 'typeorm'

/**
 * TypeORM types `entities` as `MixedList<T>`, which is `T[] | Record<string, T>`.
 * The record branch makes `entities.length` an index lookup rather than an array
 * length, so narrow to the array form here — otherwise every consumer has to.
 */
type EntityList = Extract<
  NonNullable<DataSourceOptions['entities']>,
  readonly unknown[]
>

/**
 * Every entity TypeORM should know about, listed explicitly.
 *
 * A `*.entity.js` glob would be shorter, but it resolves differently under
 * `nest build` (CommonJS, `__dirname` in `dist/`) than under Vitest's SWC
 * transform, which is exactly the kind of difference that shows up as an
 * "entity metadata not found" error in one runner and not the other. The
 * cost is one line per entity; the benefit is that the list is greppable
 * and behaves identically everywhere.
 *
 * `test/schema-drift.spec.ts` asserts this list matches what the migrations
 * built, so an entity that is added here but not migrated fails the suite.
 *
 * Add each entity here as it lands.
 */
export const entities: EntityList = []
