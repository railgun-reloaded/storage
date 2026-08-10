import assert from 'node:assert'
import { test } from 'node:test'

import {
  getCommitmentsByBlockRange,
  getMerkleTree,
  getNullifiersByBlockRange,
  insertCommitmentBatch,
  insertNullifiersBatch,
  setMerkleTree,
} from '../../src/chain/queries.js'
import {
  createTestChainDB,
  createTestMerkleTree,
  createTestNullifiers,
  createTestShieldCommitments,
  createTestTransactCommitments,
} from '../utils.js'

test('ChainDB: nullifier identity includes tree number', async () => {
  const db = await createTestChainDB()
  const nullifiers = createTestNullifiers(1, 100n)
  await insertNullifiersBatch(db, nullifiers)

  nullifiers[0]!.treeNumber = 1
  await insertNullifiersBatch(db, nullifiers)

  const stored = await getNullifiersByBlockRange(db, 100n, 110n)
  assert.deepEqual(stored.map((row) => row.treeNumber), [0, 1])
})

test('ChainDB: rejects nullifiers with an invalid byte length', async () => {
  const db = await createTestChainDB()

  await assert.rejects(insertNullifiersBatch(db, [{
    nullifier: new Uint8Array(64),
    blockNumber: 100n,
    transactionHash: new Uint8Array(32),
    treeNumber: 0,
  }]))
})

test('ChainDB: stores a full-depth Merkle tree', async () => {
  const db = await createTestChainDB()
  const leaves = createTestMerkleTree()
  await setMerkleTree(db, {
    treeNumber: 0,
    leaves,
    leafCount: 65536,
  })

  const stored = await getMerkleTree(db, 0)
  assert.equal(stored?.leafCount, 65536)
  assert.equal(stored?.leaves.length, leaves.length)
})

test('ChainDB: rejects a Merkle tree leaf count above the maximum', async () => {
  const db = await createTestChainDB()
  const leaves = createTestMerkleTree()

  await assert.rejects(setMerkleTree(db, {
    treeNumber: 0,
    leaves,
    leafCount: 65537,
  }))
})

test('ChainDB: commitment payloads survive a database round-trip', async () => {
  const db = await createTestChainDB()
  const startBlock = 1000n
  const commitments = [
    ...createTestShieldCommitments(4, startBlock),
    ...createTestTransactCommitments(4, startBlock * 2n),
  ]

  await insertCommitmentBatch(db, commitments)

  const stored = await getCommitmentsByBlockRange(db, startBlock, startBlock * 2n)
  assert.deepEqual(stored, commitments)
})

test('ChainDB: rejects commitment positions outside a tree', async () => {
  const db = await createTestChainDB()
  const commitment = createTestShieldCommitments(1)
  commitment[0]!.treePosition = 66_000

  await assert.rejects(insertCommitmentBatch(db, commitment))
})
