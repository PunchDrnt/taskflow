import type { DataSourceOptions } from 'typeorm'

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
 * Add each entity here as it lands.
 */
export const entities: NonNullable<DataSourceOptions['entities']> = []
