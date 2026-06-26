import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '..', 'src')

/**
 * Collect the static import graph of an ES module by following only relative
 * specifiers, recording every bare (external) specifier encountered. Packaging
 * correctness (exports map, published files) is validated separately by
 * `publint`; this walk guards the browser-safety invariant of the root surface.
 * @param entryFile - Absolute path of the entry module.
 * @returns The set of visited files and the set of external specifiers.
 */
function importGraph (entryFile: string): { files: Set<string>; externals: Set<string> } {
  const files = new Set<string>()
  const externals = new Set<string>()
  const stack = [entryFile]
  const patterns = [
    /(?:import|export)[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g,
  ]
  while (stack.length > 0) {
    const file = stack.pop() as string
    if (files.has(file)) {
      continue
    }
    files.add(file)
    const source = readFileSync(file, 'utf8')
    for (const pattern of patterns) {
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (specifier === undefined) {
          continue
        }
        if (specifier.startsWith('.')) {
          stack.push(path.resolve(path.dirname(file), specifier))
        } else {
          externals.add(specifier)
        }
      }
    }
  }
  return { files, externals }
}

test('Root surface: pulls in no Node-only modules', () => {
  const { files, externals } = importGraph(path.join(srcRoot, 'index.js'))

  const nodeOnly = [...externals].filter((specifier) =>
    specifier.startsWith('node:') ||
    specifier === 'better-sqlite3' ||
    specifier === 'fs' ||
    specifier === 'path' ||
    specifier.startsWith('fs/') ||
    specifier.startsWith('path/')
  )
  assert.deepEqual(nodeOnly, [], `root graph must stay Node-free, found: ${nodeOnly.join(', ')}`)

  const reachable = [...files].map((file) => path.relative(srcRoot, file))
  assert.ok(!reachable.includes('node.js'), 'node entry is not reachable from root')
  assert.ok(!reachable.includes('sqlite-loader.js'), 'native loader is not reachable from root')
  assert.ok(!reachable.some((file) => file.endsWith('db.js')), 'database factories are not reachable from root')
})

test('Root surface: shared source references no Buffer global', () => {
  const { files } = importGraph(path.join(srcRoot, 'index.js'))
  const usesBuffer = [...files]
    .filter((file) => /\bBuffer\b/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(srcRoot, file))
  assert.deepEqual(usesBuffer, [], 'root-reachable source must not reference the Buffer global')
})
