import { test } from 'brittle'

import { getNullifiersByBlockRange, insertNullifiersBatch, nullifierExists } from '../src'

import { createTestChainDB, createTestNullifiers } from './utils'
/*
import {
  deleteNullifiersFromBlock,
  getChainDBStats,
  getCommitmentsByLeafRange,
  getMerkleNode,
  getMerkleSiblingPath,
  getNullifiersByBlockRange,
  getSyncState,
  insertCommitmentsBatch,
  insertMerkleNodesBatch,
  insertNullifiersBatch,
  nullifierExists,
  updateSyncState,
} from '../src/chain/index'

import {
  createTestChainDB,
  createTestCommitment,
  createTestMerkleNode,
  createTestNullifier,
  resetTestCounters,
} from './utils'

test('Chain Database - Nullifiers: insert and check existence', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nullifier = createTestNullifier()

  insertNullifiersBatch(db, [nullifier])

  t.is(nullifierExists(db, nullifier.nullifier), true)
  t.is(nullifierExists(db, '0xnonexistent'), false)
})

test('Chain Database - Nullifiers: batch insert', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nullifiers = [
    createTestNullifier(),
    createTestNullifier(),
    createTestNullifier(),
  ]

  const count = insertNullifiersBatch(db, nullifiers)

  t.is(count, 3)
  nullifiers.forEach((n) => {
    t.is(nullifierExists(db, n.nullifier), true)
  })
})

test('Chain Database - Nullifiers: Find by block range', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nullifiers = [
    createTestNullifier(),
    createTestNullifier(),
    createTestNullifier(),
  ]
  const count = insertNullifiersBatch(db, nullifiers)
  t.is(count, 3)

  const startBlock = nullifiers[0]!.blockNumber;
  const endBlock = nullifiers[nullifiers.length - 1]!.blockNumber
  const result = getNullifiersByBlockRange(db, startBlock, endBlock);
  t.is(result.length, 3);
})

test('Chain Database - Nullifiers: handle duplicates (idempotent)', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nullifier = createTestNullifier()

  const count1 = insertNullifiersBatch(db, [nullifier])
  const count2 = insertNullifiersBatch(db, [nullifier])

  t.is(count1, 1)
  t.is(count2, 0) // Duplicate ignored
})

test('Chain Database - Nullifiers: delete from block (reorg)', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nullifiers = [
    createTestNullifier({ blockNumber: 100n }),
    createTestNullifier({ blockNumber: 101n }),
    createTestNullifier({ blockNumber: 102n }),
  ]

  insertNullifiersBatch(db, nullifiers)

  const deleted = deleteNullifiersFromBlock(db, 101n)

  t.is(deleted, 2)
  t.is(nullifierExists(db, nullifiers[0]!.nullifier), true)
  t.is(nullifierExists(db, nullifiers[1]!.nullifier), false)
  t.is(nullifierExists(db, nullifiers[2]!.nullifier), false)
})

test('Chain Database - Merkle Nodes: insert and retrieve', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const node = createTestMerkleNode({ treeId: 0, level: 1, index: 5n })

  insertMerkleNodesBatch(db, [node])

  const retrieved = getMerkleNode(db, 0, 1, 5n)

  t.ok(retrieved)
  t.alike(retrieved?.hash, node.hash)
})

test('Chain Database - Merkle Nodes: batch insert', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const nodes = [
    createTestMerkleNode({ level: 0, index: 0n }),
    createTestMerkleNode({ level: 0, index: 1n }),
    createTestMerkleNode({ level: 1, index: 0n }),
  ]

  const count = insertMerkleNodesBatch(db, nodes)

  t.is(count, 3)
})

test('Chain Database - Merkle Nodes: get sibling path', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const depth = 4

  const nodes = [
    createTestMerkleNode({ level: 0, index: 4n, hash: Buffer.from('04'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 0, index: 5n, hash: Buffer.from('05'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 1, index: 2n, hash: Buffer.from('12'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 1, index: 3n, hash: Buffer.from('13'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 2, index: 0n, hash: Buffer.from('20'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 2, index: 1n, hash: Buffer.from('21'.repeat(32), 'hex') }),
    createTestMerkleNode({ level: 3, index: 1n, hash: Buffer.from('31'.repeat(32), 'hex') }),
  ]

  insertMerkleNodesBatch(db, nodes)

  const siblings = getMerkleSiblingPath(db, 0, 5n, depth)

  t.is(siblings.length, depth)
  t.alike(siblings[0], Buffer.from('04'.repeat(32), 'hex'))
  t.alike(siblings[1], Buffer.from('13'.repeat(32), 'hex'))
  t.alike(siblings[2], Buffer.from('20'.repeat(32), 'hex'))
  t.alike(siblings[3], Buffer.from('31'.repeat(32), 'hex'))
})

test('Chain Database - Commitments: insert and query', (t) => {
  resetTestCounters()
  const db = createTestChainDB()
  const commitments = [
    createTestCommitment({ leafIndex: 10n }),
    createTestCommitment({ leafIndex: 11n }),
    createTestCommitment({ leafIndex: 12n }),
  ]

  insertCommitmentsBatch(db, commitments)

  const range = getCommitmentsByLeafRange(db, 0, 10n, 11n)

  t.is(range.length, 2)
  t.is(range[0]!.leafIndex, 10n)
  t.is(range[1]!.leafIndex, 11n)
})

test('Chain Database - Commitments: handle empty batch', (t) => {
  const db = createTestChainDB()

  const count = insertCommitmentsBatch(db, [])

  t.is(count, 0)
})

test('Chain Database - Sync State: set and get', (t) => {
  const db = createTestChainDB()

  updateSyncState(db, 1, 1000n)

  const state = getSyncState(db, 1)

  t.ok(state)
  t.is(state?.lastBlock, 1000n)
})

test('Chain Database - Sync State: update existing', (t) => {
  const db = createTestChainDB()

  updateSyncState(db, 1, 1000n)
  updateSyncState(db, 1, 2000n)

  const state = getSyncState(db, 1)

  t.is(state?.lastBlock, 2000n)
})

test('Chain Database - Stats: return correct counts', (t) => {
  resetTestCounters()
  const db = createTestChainDB()

  insertNullifiersBatch(db, [createTestNullifier(), createTestNullifier()])
  insertMerkleNodesBatch(db, [createTestMerkleNode()])
  insertCommitmentsBatch(db, [createTestCommitment()])

  const stats = getChainDBStats(db)

  t.is(stats.nullifiers, 2)
  t.is(stats.merkleNodes, 1)
  t.is(stats.commitments, 1)
})
*/

test('ChainDB: Insert nullifiers', (assert) => {
  const db = createTestChainDB()
  const nullifiersBatch = createTestNullifiers(8)
  const changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, nullifiersBatch.length)
})

test('ChainDB: Should insert and fetch same nullifiers', (assert) => {
  const db = createTestChainDB()
  const startBlock = 100n
  const nullifiersBatch = createTestNullifiers(4, 100n)
  const changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, nullifiersBatch.length)

  const fetchedNullifiers = getNullifiersByBlockRange(db, startBlock, startBlock + 10n)
  assert.alike(nullifiersBatch, fetchedNullifiers)
})

test('ChainD: Should insert and check it exists', (assert) => {
  const db = createTestChainDB()
  const nullifiersBatch = createTestNullifiers(4)
  const changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, nullifiersBatch.length)

  for (const { nullifier } of nullifiersBatch) {
    assert.ok(nullifierExists(db, nullifier as Uint8Array))
  }
})
