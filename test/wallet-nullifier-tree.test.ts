import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  createWallet,
  getNoteByNullifier,
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

  assert.equal(insertNotesBatch(db, [noteTree0, noteTree1]), 2)
})

test('notes table allows same nullifier and tree_id when chain differs', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  createWallet(db, wallet)

  const noteChain1 = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    treeNumber: 0
  })
  const noteChain137 = createTestNote({
    walletId: wallet.id,
    chainId: 137,
    treeNumber: 0,
    nullifier: noteChain1.nullifier
  })

  assert.equal(insertNotesBatch(db, [noteChain1, noteChain137]), 2)

  assert.equal(getNoteByNullifier(db, {
    chainId: 1,
    nullifier: noteChain1.nullifier,
    treeNumber: 0
  })?.chainId, 1)
  assert.equal(getNoteByNullifier(db, {
    chainId: 137,
    nullifier: noteChain1.nullifier,
    treeNumber: 0
  })?.chainId, 137)
})

test('notes table rejects duplicate (chain_id, nullifier, tree_id) tuple', () => {
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
