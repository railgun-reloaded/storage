import { test } from 'brittle'

import {
  deleteNullifiersFromBlock,
  getCommitmentsByBlockRange,
  getCommitmentsByLeafRange,
  getNullifiersByBlockRange,
  insertCommitmentBatch,
  insertNullifiersBatch,
  nullifierExists,
  setMerkleTree
} from '../src'

import { createTestChainDB, createTestMerkleTreeLeaves, createTestNullifiers, createTestShieldCommitments, shuffleArray } from './utils'

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
  assert.alike.coercively(nullifiersBatch, fetchedNullifiers)
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
  assert.alike.coercively(nullifiersBatch, fetchedNullifiers)
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
    assert.alike.coercively(nullifiers[i]!.nullifier as Uint8Array, nullifiersBatch[i]?.nullifier)
    assert.alike.coercively(nullifiers[i]!.transactionHash as Uint8Array, nullifiersBatch[i]?.transactionHash)
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

test('ChainDB: Should insert shieldCommitments', (assert) => {
  const db = createTestChainDB()
  const commitments = createTestShieldCommitments(8, 1000n)

  const inserted = insertCommitmentBatch(db, commitments)
  assert.is(inserted, 8)
})

test('ChainDB: Should insert and fetch shieldCommitments', async (assert) => {
  const db = createTestChainDB()

  const startBlock = 1000n
  const commitments = createTestShieldCommitments(8, startBlock)

  const inserted = insertCommitmentBatch(db, commitments)
  assert.is(inserted, commitments.length)

  const results = getCommitmentsByBlockRange(db, startBlock, startBlock + 1n)
  assert.is(results.length, commitments.length)

  assert.alike.coercively(results, commitments)
})

test.solo('ChainDB: Should find commitments by treePosition ranges', async (assert) => {
  const db = createTestChainDB()

  const startBlock = 1000n
  const commitments = createTestShieldCommitments(16, startBlock)

  const shuffleCommitments = commitments
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)

  const inserted = insertCommitmentBatch(db, shuffleCommitments)
  assert.is(inserted, commitments.length)

  const results = getCommitmentsByLeafRange(db, 0, 0, 16)
  assert.alike.coercively(results, commitments)
})

test('ChainDB: Should find commitments by treePosition ranges', async (assert) => {
  const db = createTestChainDB()

  const startBlock = 1000n
  const commitments = createTestShieldCommitments(16, startBlock)

  const shuffleCommitments = shuffleArray(commitments)

  const inserted = insertCommitmentBatch(db, shuffleCommitments)
  assert.is(inserted, commitments.length)

  const results = getCommitmentsByLeafRange(db, 0, 0, 16)
  assert.alike.coercively(results, commitments)
})

test.solo('ChainDB: Should find commitments by block ranges', async (assert) => {
  const db = createTestChainDB()

  const commitments = createTestShieldCommitments(16)
  const shuffleCommitments = shuffleArray(commitments)

  const inserted = insertCommitmentBatch(db, shuffleCommitments)
  assert.is(inserted, commitments.length)

  const startBlock = commitments[0]!.blockNumber
  const endBlock = commitments[commitments.length - 1]!.blockNumber
  const results = getCommitmentsByBlockRange(db, startBlock, endBlock)
  assert.alike.coercively(results, commitments)
})
