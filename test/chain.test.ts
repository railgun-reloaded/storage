import { test } from 'brittle'

import { deleteNullifiersFromBlock, getNullifiersByBlockRange, insertNullifiersBatch, nullifierExists, setMerkleTree } from '../src'

import { createTestChainDB, createTestMerkleTreeLeaves, createTestNullifiers } from './utils'
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

test('ChainDB: Should insert and check it exists', (assert) => {
  const db = createTestChainDB()
  const nullifiersBatch = createTestNullifiers(4)
  const changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, nullifiersBatch.length)

  for (const { nullifier } of nullifiersBatch) {
    assert.ok(nullifierExists(db, nullifier as Uint8Array))
  }
})

test('ChainDB: Should insert invalid nullifier', (assert) => {
  const db = createTestChainDB()
  const nullifier = new Uint8Array(64)
  const nullifierEntry = {
    nullifier,
    blockNumber: 100n,
    transactionHash: new Uint8Array([0, 0]),
    treeNumber: 0
  }

  assert.exception(async () => {
    insertNullifiersBatch(db, [nullifierEntry])
  })
})

test('ChainDB: Should fetch nullifier by block range', (assert) => {
  const db = createTestChainDB()
  const startBlock = 1000n
  const nullifiersBatch = createTestNullifiers(4, 1000n)
  const changes = insertNullifiersBatch(db, nullifiersBatch)

  assert.is(changes, nullifiersBatch.length)
  const fetchedNullifiers = getNullifiersByBlockRange(db, startBlock, startBlock + 10n)
  assert.alike(nullifiersBatch, fetchedNullifiers)
})

test('ChainDB: Should handle duplicate nullifiers id', (assert) => {
  const db = createTestChainDB()
  const nullifiersBatch = createTestNullifiers(2, 100n)
  let changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, 2)

  nullifiersBatch.forEach((b, index) => { b.blockNumber = 1000n + BigInt(index) })
  changes = insertNullifiersBatch(db, nullifiersBatch)
  assert.is(changes, 2)

  const nullifiers = getNullifiersByBlockRange(db, 1000n, 1011n)
  assert.ok(nullifiers)
  assert.is(nullifiers.length, nullifiersBatch.length)

  for (let i = 0; i < nullifiersBatch.length; ++i) {
    assert.alike(nullifiers[i]!.nullifier as Uint8Array, nullifiersBatch[i]?.nullifier)
    assert.alike(nullifiers[i]!.transactionHash as Uint8Array, nullifiersBatch[i]?.transactionHash)
    assert.is(nullifiers[i]!.treeNumber, nullifiersBatch[i]?.treeNumber)
  }
})

test('ChainDB: Should delete nullifier greater than given block', (assert) => {
  const db = createTestChainDB()
  const nullifiers = createTestNullifiers(1)
  const changes = insertNullifiersBatch(db, nullifiers)
  assert.is(changes, 1)

  let exists = nullifierExists(db, nullifiers[0]!.nullifier as Uint8Array)
  assert.is(exists, true)

  const deleted = deleteNullifiersFromBlock(db, nullifiers[0]!.blockNumber)
  assert.is(deleted, 1)

  exists = nullifierExists(db, nullifiers[0]!.nullifier as Uint8Array)
  assert.is(exists, false)
})

test('ChainDB: Should insert merkletree', (assert) => {
  const db = createTestChainDB()
  const leaves = createTestMerkleTreeLeaves()
  const changes = setMerkleTree(db, {
    treeNumber: 0,
    leaves,
    leafCount: 65536
  })
  assert.is(changes, 1)
})

test('ChainDB: Should throw on invalid merkletree insert', (assert) => {
  const db = createTestChainDB()
  const leaves = new Uint8Array(32)
  assert.exception(() => {
    setMerkleTree(db, {
      treeNumber: 0,
      leaves,
      leafCount: 1
    })
  })
})

test('ChainDB: Should throw on invalid merkletree leafCount', (assert) => {
  const db = createTestChainDB()
  const leaves = createTestMerkleTreeLeaves()
  assert.exception(() => {
    setMerkleTree(db, {
      treeNumber: 0,
      leaves,
      leafCount: 65537
    })
  })
})
