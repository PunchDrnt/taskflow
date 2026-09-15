import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Keeps `src/README.md` honest.
 *
 * A map of a codebase is worth having and worth nothing the moment it stops
 * being true — somebody looks up where a route lives, opens a file that was
 * moved last month, and trusts the map less every time. Conventions alone do
 * not solve it: they tell you what a file is called once you have found it.
 *
 * So the map is checked rather than maintained by discipline. A directory
 * added without a line, a controller mounted at a prefix nobody wrote down, or
 * a line pointing at a file that has moved all fail here.
 *
 * It asserts presence, never prose: the sentence beside each entry is a
 * person's description and no test should have an opinion about it.
 */
// `process.cwd()` is the workspace: vitest runs with @api/core as its root,
// the same footing `docs-links.spec.ts` stands on. `import.meta` is not an
// option — this file is type-checked against the CommonJS build config.
const SRC = join(process.cwd(), 'src')
const MAP = readFileSync(join(SRC, 'README.md'), 'utf8')

/** Every `.ts` under `src`, as paths relative to it. */
function sourceFiles(dir = SRC, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`

    if (entry.isDirectory()) return sourceFiles(join(dir, entry.name), path)

    return entry.name.endsWith('.ts') ? [path] : []
  })
}

const files = sourceFiles()

describe('the source map', () => {
  it('names every directory directly under src', () => {
    const directories = readdirSync(SRC, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `${entry.name}/`)

    expect(directories.filter((name) => !MAP.includes(name))).toEqual([])
  })

  it('names every module, so an empty one is never a surprise', () => {
    // The ones holding nothing but entities are the reason this matters: a
    // reader who opens `billing/` and finds four files and no code should have
    // been told, not left to work it out.
    const modules = readdirSync(join(SRC, 'modules'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `\`${entry.name}/\``)

    expect(modules.filter((name) => !MAP.includes(name))).toEqual([])
  })

  it('names every route prefix, and the file answering it', () => {
    const controllers = files.filter(
      (file) => file.endsWith('.controller.ts') && !file.endsWith('.spec.ts'),
    )

    const missing = controllers.filter((file) => {
      const source = readFileSync(join(SRC, file), 'utf8')
      const prefix = /@Controller\((?:'([^']*)')?\)/.exec(source)?.[1]

      // The file has to be listed, and beside the prefix it actually answers
      // on — a map that sends somebody to the wrong controller is worse than
      // one that sends them nowhere.
      return (
        !MAP.includes(file) ||
        (prefix !== undefined && !MAP.includes(`\`${prefix}\``))
      )
    })

    expect(missing).toEqual([])
  })

  it('points at nothing that has moved', () => {
    // Every `path/like/this.ts` the map mentions. Resolved from the workspace
    // root as well as from `src`, because the map also points at `test/`.
    const mentioned = [...MAP.matchAll(/`([\w./-]+\.ts)`/g)]
      .map((match) => match[1]!)
      .filter((path) => path.includes('/'))

    const missing = mentioned.filter(
      (path) =>
        !existsSync(join(SRC, path)) && !existsSync(join(SRC, '..', path)),
    )

    expect(missing).toEqual([])
  })
})
