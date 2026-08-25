import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every cross-reference in `.claude/` resolves — the file exists, and so does
 * the heading the `#anchor` names.
 *
 * The specification is roughly 4,000 lines across ten files that link into each
 * other several hundred times, and a link that rots is silent: the reader
 * follows it, lands at the top of the right file, and reads the wrong section
 * without ever knowing. Restructuring the docs is what makes this expensive,
 * so it is checked rather than watched.
 *
 * Code is included on purpose. `base.entity.ts` and `org-isolation.spec.ts`
 * both cite a doc anchor in a comment, and those are exactly the references
 * nobody thinks to update when a heading moves.
 */

/** The repo root, found by walking up — cwd is the workspace under Turbo. */
function repoRoot(): string {
  let dir = process.cwd()

  while (!existsSync(join(dir, '.claude'))) {
    const parent = dirname(dir)
    if (parent === dir)
      throw new Error('no .claude/ above the working directory')
    dir = parent
  }

  return dir
}

const ROOT = repoRoot()
const CLAUDE = join(ROOT, '.claude')

function walk(dir: string, match: (path: string) => boolean): string[] {
  const found: string[] = []

  for (const entry of readdirSync(dir)) {
    // skills/ ships with the CLI rather than with this repo, and node_modules
    // is not ours to police.
    if (entry === 'node_modules' || entry === 'skills' || entry === 'dist') {
      continue
    }

    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...walk(path, match))
    } else if (match(path)) {
      found.push(path)
    }
  }

  return found
}

/**
 * GitHub's heading-to-anchor rule: lower-case, drop punctuation, spaces become
 * hyphens.
 *
 * `\p{L}\p{N}\p{M}` rather than `\w`, and the `u` flag is not optional: **Thai
 * vowels and tone marks are combining marks, not letters**, so `\w` — and even
 * `[a-z0-9]` with `u` — silently strips them and turns every Thai heading into
 * a different anchor than the one being linked to. Half the headings in these
 * docs are Thai. Same trap as `StorageService.keyFor`.
 */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, '')
    .trim()
    .replace(/ /g, '-')
}

/** Headings outside fenced code blocks — `# comments` in bash are not headings. */
function headingsOf(markdown: string): Set<string> {
  const slugs = new Set<string>()
  let fenced = false

  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (fenced) continue

    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading?.[1]) slugs.add(slugify(heading[1]))
  }

  return slugs
}

const markdownFiles = walk(CLAUDE, (path) => path.endsWith('.md'))

const headings = new Map<string, Set<string>>(
  markdownFiles.map((path) => [path, headingsOf(readFileSync(path, 'utf8'))]),
)

interface Reference {
  /** Where the link was written, relative to the repo root. */
  from: string
  /** Absolute path of the file it points at. */
  target: string
  /** The `#anchor`, or undefined for a plain file link. */
  anchor?: string
  raw: string
}

/**
 * Blanks out fenced blocks and inline code, so an *illustration* of a link is
 * not mistaken for one. `.claude/agents/doc-sync.md` describes the rule as
 * `](./NN-name.md#anchor)`, which is a pattern rather than a destination.
 */
function withoutCode(markdown: string): string {
  return markdown.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

/** `[text](./path.md#anchor)` — skips external URLs and bare fragments. */
function linksInMarkdown(path: string): Reference[] {
  const references: Reference[] = []

  for (const match of withoutCode(readFileSync(path, 'utf8')).matchAll(
    /\]\(([^)\s]+)\)/g,
  )) {
    const link = match[1]
    if (!link || /^(https?:|mailto:)/.test(link)) continue

    const [filePart = '', anchor] = link.split('#')
    const target = filePart === '' ? path : resolve(dirname(path), filePart)

    references.push({
      from: relative(ROOT, path),
      target,
      anchor: anchor || undefined,
      raw: link,
    })
  }

  return references
}

/**
 * Doc references written in code comments — a doc path with an optional
 * fragment, with or without the `.claude/` prefix. Trailing sentence
 * punctuation is not part of the anchor.
 */
function linksInSource(path: string): Reference[] {
  const references: Reference[] = []
  const pattern =
    /(?:\.claude\/)?(?:docs|checklists)\/([\w.-]+\.md)(#[^\s)\],;`'"]*)?/g

  for (const match of readFileSync(path, 'utf8').matchAll(pattern)) {
    const [, fileName, fragment] = match
    if (!fileName) continue

    const folder = match[0].includes('checklists/') ? 'checklists' : 'docs'
    const anchor = fragment?.slice(1).replace(/[.,:;]+$/, '')

    references.push({
      from: relative(ROOT, path),
      target: join(CLAUDE, folder, fileName),
      anchor: anchor || undefined,
      raw: match[0],
    })
  }

  return references
}

const sourceFiles = walk(join(ROOT, 'apps'), (path) =>
  /\.(ts|mts|tsx)$/.test(path),
)

const references = [
  ...markdownFiles.flatMap(linksInMarkdown),
  ...sourceFiles.flatMap(linksInSource),
]

/** `file#anchor`, for a failure message that says where to look. */
const describeRef = (reference: Reference): string =>
  `${reference.from} -> ${reference.raw}`

describe('documentation cross-references', () => {
  it('finds the docs to check, so a path change fails loudly', () => {
    // Without this, a wrong ROOT would collect nothing and every assertion
    // below would pass by vacuum.
    expect(markdownFiles.length).toBeGreaterThan(5)
    expect(references.length).toBeGreaterThan(100)
    expect(sourceFiles.length).toBeGreaterThan(50)
  })

  it('points only at files that exist', () => {
    const missing = references
      .filter((reference) => !existsSync(reference.target))
      .map(describeRef)

    expect(missing).toEqual([])
  })

  it('names a heading that exists, in the file it points at', () => {
    const broken = references
      .filter((reference) => reference.anchor !== undefined)
      .filter((reference) => existsSync(reference.target))
      .filter((reference) => {
        const slugs = headings.get(reference.target)
        // A markdown file outside .claude/ has no heading index; nothing to check.
        return slugs !== undefined && !slugs.has(reference.anchor!)
      })
      .map(describeRef)

    expect(broken).toEqual([])
  })
})
