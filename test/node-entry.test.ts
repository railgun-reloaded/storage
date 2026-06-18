import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import * as node from '../src/node.js'

const nodeRequire = createRequire(import.meta.url)

test('Node Entry: exposes the database factories', () => {
  assert.equal(typeof node.createChainDB, 'function')
  assert.equal(typeof node.createWalletDB, 'function')
  assert.equal(typeof node.closeChainDB, 'function')
  assert.equal(typeof node.closeWalletDB, 'function')
})

test('Node Entry: exposes the runtime-dependent queries', () => {
  assert.equal(typeof node.getUnspentNotes, 'function')
  assert.equal(typeof node.insertScanBatch, 'function')
  assert.equal(typeof node.nullifierExists, 'function')
})

test('Node Entry: re-exports the schemas and note converter', () => {
  assert.ok(node.commitments, 'chain schema table is re-exported')
  assert.ok(node.notes, 'wallet schema table is re-exported')
  assert.equal(typeof node.toDBNote, 'function', 'note converter is re-exported')
})

test('Node Entry: defers loading the native module until a database is created', () => {
  const nativeLoaded = Object.keys(nodeRequire.cache).some((modulePath) =>
    modulePath.includes('better-sqlite3')
  )
  assert.equal(nativeLoaded, false, 'importing ./node must not load better-sqlite3 eagerly')
})
