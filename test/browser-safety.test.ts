import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const srcRoot = path.resolve(here, '..', 'src')

/**
 * Collect the static import graph of an ES module by following only relative
 * specifiers, recording every bare (external) specifier encountered. Used to
 * scope the no-Buffer check to root-reachable source. Node-module resolution is
 * verified separately by the browser bundle CI step, and packaging correctness
 * by `publint`.
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

test('Root surface: shared source references no Buffer global', () => {
  const { files } = importGraph(path.join(srcRoot, 'index.js'))
  const usesBuffer = [...files]
    .filter((file) => /\bBuffer\b/.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(srcRoot, file))
  assert.deepEqual(usesBuffer, [], 'root-reachable source must not reference the Buffer global')
})
