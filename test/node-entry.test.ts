import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import * as node from '../src/node/index.js'

const nodeRequire = createRequire(import.meta.url)

test('Node Entry: exposes the database factories', () => {
  assert.equal(typeof node.createChainDB, 'function')
  assert.equal(typeof node.createWalletDB, 'function')
  assert.equal(typeof node.closeChainDB, 'function')
  assert.equal(typeof node.closeWalletDB, 'function')
})

test('Node Entry: exposes the storage adapter factories', () => {
  assert.equal(typeof node.createChainStorage, 'function')
  assert.equal(typeof node.createWalletStorage, 'function')
  assert.equal(typeof node.createSqliteTransactor, 'function')
})

test('Node Entry: exposes the chain bootstrap flow', () => {
  assert.equal(typeof node.prepareChainBootstrap, 'function')
  assert.equal(typeof node.promoteChainBootstrap, 'function')
  assert.equal(typeof node.recordSnapshotCheckpoint, 'function')
})

test('Node Entry: does not re-export the platform-neutral surface', () => {
  const surface = node as Record<string, unknown>
  assert.equal(surface['getUnspentNotes'], undefined, 'queries live on the shared layer')
  assert.equal(surface['nullifierExists'], undefined, 'queries live on the shared layer')
  assert.equal(surface['applyScanBatch'], undefined, 'queries live on the shared layer')
  assert.equal(surface['commitments'], undefined, 'schemas live on the root entry')
  assert.equal(surface['notes'], undefined, 'schemas live on the root entry')
  assert.equal(surface['toDBNote'], undefined, 'note converter lives on the root entry')
})

test('Node Entry: defers loading the native module until a database is created', () => {
  const nativeLoaded = Object.keys(nodeRequire.cache).some((modulePath) =>
    modulePath.includes('better-sqlite3')
  )
  assert.equal(nativeLoaded, false, 'importing ./node must not load better-sqlite3 eagerly')
})
