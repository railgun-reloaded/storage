import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import * as root from '../src/index.js'

const nodeRequire = createRequire(import.meta.url)

test('Root Entry: exposes the runtime-agnostic surface', () => {
  assert.ok(root.commitments, 'chain schema table is exported')
  assert.ok(root.nullifiers, 'chain schema table is exported')
  assert.ok(root.notes, 'wallet schema table is exported')
  assert.ok(root.wallets, 'wallet schema table is exported')
  assert.equal(typeof root.toDBNote, 'function', 'note converter is exported')
  assert.equal(typeof root.toDBNotes, 'function', 'note converter is exported')
})

test('Root Entry: does not expose runtime-dependent queries or factories', () => {
  const surface = root as Record<string, unknown>
  assert.equal(surface['getUnspentNotes'], undefined, 'queries live under ./node')
  assert.equal(surface['insertScanBatch'], undefined, 'queries live under ./node')
  assert.equal(surface['createChainDB'], undefined, 'factories live under ./node')
  assert.equal(surface['createWalletDB'], undefined, 'factories live under ./node')
})

test('Root Entry: does not leak core value helpers', () => {
  const surface = root as Record<string, unknown>
  assert.equal(surface['normalizeToken'], undefined, 'core helpers stay internal')
  assert.equal(surface['isEmptyBatch'], undefined, 'core helpers stay internal')
  assert.equal(surface['normalizeMutationCount'], undefined, 'core helpers stay internal')
})

test('Root Entry: pulls in no native database module', () => {
  const nativeLoaded = Object.keys(nodeRequire.cache).some((modulePath) =>
    modulePath.includes('better-sqlite3')
  )
  assert.equal(nativeLoaded, false, 'importing the root entry must not load better-sqlite3')
})
