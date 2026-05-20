import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createWallet,
  insertNotesBatch
} from '../src/wallet/index'

import {
  createTestNote,
  createTestWallet,
  createTestWalletDB,
  resetTestCounters
} from './utils'

test('notes table allows same nullifier bytes when tree_id differs', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  createWallet(db, wallet)

  const noteTree0 = createTestNote({ walletId: wallet.id, treeNumber: 0 })
  const noteTree1 = createTestNote({
    walletId: wallet.id,
    treeNumber: 1,
    // Force same nullifier bytes across trees.
    nullifier: noteTree0.nullifier
  })

  insertNotesBatch(db, [noteTree0, noteTree1])
  // No assertion text needed — the insert must not throw on the second row.
  assert.ok(true)
})

test('notes table rejects duplicate (nullifier, tree_id) pair', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  createWallet(db, wallet)

  const first = createTestNote({ walletId: wallet.id, treeNumber: 0 })
  const dup = createTestNote({
    walletId: wallet.id,
    treeNumber: 0,
    nullifier: first.nullifier
  })

  insertNotesBatch(db, [first])
  assert.throws(() => insertNotesBatch(db, [dup]))
})
