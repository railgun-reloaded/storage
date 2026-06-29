import assert from 'node:assert'
import { test } from 'node:test'

import type { DBNewRailgunTransaction } from '../src/node/index.js'
import {
  deleteNullifiersFromBlock,
  getAllNullifiers,
  getCommitmentsByBlockRange,
  getCommitmentsByLeafRange,
  getMerkleTree,
  getNullifiersByBlockRange,
  getNullifiersFromBlock,
  getSyncState,
  getTxidSyncCursor,
  getUnshieldsByBlockRange,
  insertCommitmentBatch,
  insertNullifiersBatch,
  insertScanBatch,
  insertUnshieldBatch,
  nullifierExists,
  setMerkleTree,
  updateSyncState
} from '../src/node/index.js'

import {
  createTestChainDB,
  createTestMerkleTree,
  createTestNullifiers,
  createTestShieldCommitments,
  createTestTransactCommitments,
  createTestUnshields,
  shuffleArray
} from './utils.js'

test('ChainDB: Insert nullifiers', async () => {
  const db = await createTestChainDB()
  const nullifiersBatch = createTestNullifiers(8)
  const changes = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(changes, nullifiersBatch.length)
})

test('ChainDB: Should insert and fetch same nullifiers', async () => {
  const db = await createTestChainDB()
  const startBlock = 100n
  const nullifiersBatch = createTestNullifiers(4, 100n)
  const changes = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(changes, nullifiersBatch.length)

  const fetchedNullifiers = await getNullifiersByBlockRange(db, startBlock, startBlock + 10n)
  assert.deepEqual(nullifiersBatch, fetchedNullifiers)
})

test('ChainDB: Should insert duplicate nullifiers with different treeNumber', async () => {
  const db = await createTestChainDB()
  const startBlock = 100n
  const nullifiersBatch = createTestNullifiers(1, 100n)
  let inserted = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(inserted, 1)

  nullifiersBatch[0]!.treeNumber = 1
  inserted = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(inserted, 1)

  const fetchedNullifiers = await getNullifiersByBlockRange(db, startBlock, startBlock + 10n)
  assert.equal(fetchedNullifiers.length, 2)
})

test('ChainDB: Should insert and check it exists', async () => {
  const db = await createTestChainDB()
  const nullifiersBatch = createTestNullifiers(4)
  const changes = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(changes, nullifiersBatch.length)

  for (const { nullifier, treeNumber } of nullifiersBatch) {
    assert.ok(await nullifierExists(db, nullifier as Uint8Array, treeNumber))
  }
})

test('ChainDB: Should insert invalid nullifier', async () => {
  const db = await createTestChainDB()
  const nullifier = new Uint8Array(64)
  const nullifierEntry = {
    nullifier,
    blockNumber: 100n,
    transactionHash: new Uint8Array([0, 0]),
    treeNumber: 0
  }

  await assert.rejects(async () => {
    await insertNullifiersBatch(db, [nullifierEntry])
  })
})

test('ChainDB: Should fetch nullifier by block range', async () => {
  const db = await createTestChainDB()
  const startBlock = 1000n
  const nullifiersBatch = createTestNullifiers(4, 1000n)
  const changes = await insertNullifiersBatch(db, nullifiersBatch)

  assert.equal(changes, nullifiersBatch.length)
  const fetchedNullifiers = await getNullifiersByBlockRange(db, startBlock, startBlock + 10n)
  assert.deepEqual(nullifiersBatch, fetchedNullifiers)
})

test('ChainDB: Should handle duplicate nullifiers id', async () => {
  const db = await createTestChainDB()
  const nullifiersBatch = createTestNullifiers(2, 100n)
  let changes = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(changes, 2)

  nullifiersBatch.forEach((b, index) => { b.blockNumber = 1000n + BigInt(index) })
  changes = await insertNullifiersBatch(db, nullifiersBatch)
  assert.equal(changes, 2)

  const nullifiers = await getNullifiersByBlockRange(db, 1000n, 1011n)
  assert.ok(nullifiers)
  assert.equal(nullifiers.length, nullifiersBatch.length)

  for (let i = 0; i < nullifiersBatch.length; ++i) {
    assert.deepEqual(nullifiers[i]!.nullifier as Uint8Array, nullifiersBatch[i]?.nullifier)
    assert.deepEqual(nullifiers[i]!.transactionHash as Uint8Array, nullifiersBatch[i]?.transactionHash)
    assert.equal(nullifiers[i]!.treeNumber, nullifiersBatch[i]?.treeNumber)
  }
})

test('ChainDB: Should delete nullifier greater than given block', async () => {
  const db = await createTestChainDB()
  const nullifiers = createTestNullifiers(1)
  const changes = await insertNullifiersBatch(db, nullifiers)
  assert.equal(changes, 1)

  let exists = await nullifierExists(db, nullifiers[0]!.nullifier as Uint8Array, nullifiers[0]!.treeNumber)
  assert.equal(exists, true)

  const deleted = await deleteNullifiersFromBlock(db, nullifiers[0]!.blockNumber)
  assert.equal(deleted, 1)

  exists = await nullifierExists(db, nullifiers[0]!.nullifier as Uint8Array, nullifiers[0]!.treeNumber)
  assert.equal(exists, false)
})

test('ChainDB: Should return all nullifiers', async () => {
  const db = await createTestChainDB()
  const batch = createTestNullifiers(5, 100n)
  await insertNullifiersBatch(db, batch)

  const all = await getAllNullifiers(db)
  assert.equal(all.length, 5)
  for (const row of all) {
    assert.ok(row.nullifier instanceof Uint8Array)
    assert.equal((row.nullifier as Uint8Array).length, 32)
  }
})

test('ChainDB: Should return empty array when no nullifiers exist', async () => {
  const db = await createTestChainDB()
  const all = await getAllNullifiers(db)
  assert.equal(all.length, 0)
})

test('ChainDB: Should return nullifiers from block onwards', async () => {
  const db = await createTestChainDB()
  const early = createTestNullifiers(3, 100n)
  const late = createTestNullifiers(4, 200n)
  await insertNullifiersBatch(db, [...early, ...late])

  const result = await getNullifiersFromBlock(db, 200n)
  assert.equal(result.length, 4)
  for (const row of result) {
    assert.ok(row.blockNumber >= 200n)
  }
})

test('ChainDB: Should return empty when no nullifiers after block', async () => {
  const db = await createTestChainDB()
  const batch = createTestNullifiers(3, 100n)
  await insertNullifiersBatch(db, batch)

  const result = await getNullifiersFromBlock(db, 500n)
  assert.equal(result.length, 0)
})

test('ChainDB: Should insert merkletree', async () => {
  const db = await createTestChainDB()
  const leaves = createTestMerkleTree()
  const changes = await setMerkleTree(db, {
    treeNumber: 0,
    leaves,
    leafCount: 65536
  })
  assert.equal(changes, 1)
})

test('ChainDB: Should throw on invalid merkletree insert', async () => {
  const db = await createTestChainDB()
  const leaves = new Uint8Array(32)
  await assert.rejects(async () => {
    await setMerkleTree(db, {
      treeNumber: 0,
      leaves,
      leafCount: 1
    })
  })
})

test('ChainDB: Should throw on invalid merkletree leafCount', async () => {
  const db = await createTestChainDB()
  const leaves = createTestMerkleTree()
  await assert.rejects(async () => {
    await setMerkleTree(db, {
      treeNumber: 0,
      leaves,
      leafCount: 65537
    })
  })
})

test('ChainDB: Should insert shieldCommitments', async () => {
  const db = await createTestChainDB()
  const commitments = createTestShieldCommitments(8, 1000n)

  const inserted = await insertCommitmentBatch(db, commitments)
  assert.equal(inserted, 8)
})

test('ChainDB: Should insert and fetch commitments', async () => {
  const db = await createTestChainDB()

  const startBlock = 1000n
  const shields = createTestShieldCommitments(4, startBlock)
  const transact = createTestTransactCommitments(4, startBlock * 2n)
  const commitments = [...shields, ...transact]

  const inserted = await insertCommitmentBatch(db, commitments)
  assert.equal(inserted, commitments.length)

  const results = await getCommitmentsByBlockRange(db, startBlock, startBlock * 2n)
  assert.equal(results.length, commitments.length)

  assert.deepEqual(results, commitments)
})

test('ChainDB: Should find commitments by treePosition ranges', async () => {
  const db = await createTestChainDB()

  const startBlock = 1000n
  const commitments = createTestShieldCommitments(16, startBlock)

  const shuffleCommitments = commitments
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)

  const inserted = await insertCommitmentBatch(db, shuffleCommitments)
  assert.equal(inserted, commitments.length)

  const results = await getCommitmentsByLeafRange(db, 0, 0, 16)
  assert.deepEqual(results, commitments)
})

test('ChainDB: Should find commitments by treePosition ranges', async () => {
  const db = await createTestChainDB()

  const startBlock = 1000n
  const commitments = createTestShieldCommitments(16, startBlock)

  const shuffleCommitments = shuffleArray(commitments)

  const inserted = await insertCommitmentBatch(db, shuffleCommitments)
  assert.equal(inserted, commitments.length)

  const results = await getCommitmentsByLeafRange(db, 0, 0, 16)
  assert.deepEqual(results, commitments)
})

test('ChainDB: Should find commitments by block ranges', async () => {
  const db = await createTestChainDB()

  const commitments = createTestShieldCommitments(16)
  const shuffleCommitments = shuffleArray(commitments)

  const inserted = await insertCommitmentBatch(db, shuffleCommitments)
  assert.equal(inserted, commitments.length)

  const startBlock = commitments[0]!.blockNumber
  const endBlock = commitments[commitments.length - 1]!.blockNumber
  const results = await getCommitmentsByBlockRange(db, startBlock, endBlock)
  assert.deepEqual(results, commitments)
})

test('ChainDB: Should handle empty commitments', async () => {
  const db = await createTestChainDB()
  await assert.doesNotReject(async () => {
    await insertCommitmentBatch(db, [])
  })
})

test('ChainDB: Should handle empty unshields', async () => {
  const db = await createTestChainDB()
  const inserted = await insertUnshieldBatch(db, [])
  assert.equal(inserted, 0)
})

test('ChainDB: Should throw on invalid tree position', async () => {
  const db = await createTestChainDB()
  const commitment = createTestShieldCommitments(1)
  commitment[0]!.treePosition = 66_000
  await assert.rejects(async () => {
    await insertCommitmentBatch(db, commitment)
  })
})

test('ChainDB: Should throw on invalid commitment data', async () => {
  const db = await createTestChainDB()
  const commitment = createTestShieldCommitments(1)
  commitment[0]!.treePosition = 66_000
  commitment[0]!.commitment = undefined
  await assert.rejects(async () => {
    await insertCommitmentBatch(db, commitment)
  })
})

test('ChainDB: Should validate scan state', async () => {
  const db = await createTestChainDB()
  const inserted = await updateSyncState(db, 1, 54843n)
  assert.equal(inserted, 1)

  const syncState = await getSyncState(db, 1)
  if (syncState) {
    assert.equal(syncState.chainID, 1)
    assert.equal(syncState.lastBlockHeight, 54843n)
  } else {
    assert.fail()
  }
})

test('ChainDB: Should insert and fetch unshields', async () => {
  const db = await createTestChainDB()
  const unshields = createTestUnshields(5)
  const inserted = await insertUnshieldBatch(db, unshields)
  assert.equal(inserted, unshields.length)
})

test('ChainDB: Should fetch unshields by blockRange', async () => {
  const db = await createTestChainDB()

  const startBlock = 10000n
  const unshields = createTestUnshields(5, startBlock)
  const inserted = await insertUnshieldBatch(db, unshields)
  assert.equal(inserted, unshields.length)

  const endBlock = unshields[unshields.length - 1]!.blockNumber
  const fetched = await getUnshieldsByBlockRange(db, startBlock, endBlock)
  assert.deepEqual(unshields, fetched)
})

test('ChainDB: insertScanBatch persists all batch members and sync state', async () => {
  const db = await createTestChainDB()
  const nullifiersBatch = createTestNullifiers(4, 500n)
  const commitmentsBatch = createTestShieldCommitments(3, 500n)
  const unshieldsBatch = createTestUnshields(2, 500n)
  const leaves = createTestMerkleTree()

  await insertScanBatch(db, {
    chainID: 1,
    blockNumber: 510n,
    nullifiers: nullifiersBatch,
    commitments: commitmentsBatch,
    unshields: unshieldsBatch,
    merkleTrees: [{ treeNumber: 0, leafCount: 3, leaves }]
  })

  assert.equal((await getNullifiersByBlockRange(db, 500n, 510n)).length, 4)
  assert.equal((await getCommitmentsByBlockRange(db, 500n, 510n)).length, 3)
  assert.equal((await getUnshieldsByBlockRange(db, 500n, 510n)).length, 2)
  assert.equal((await getMerkleTree(db, 0))?.leafCount, 3)
  assert.equal((await getSyncState(db, 1))?.lastBlockHeight, 510n)
  assert.equal(await getTxidSyncCursor(db, 1), 0n)
})

test('ChainDB: insertScanBatch advances txid cursor only on new railgun transactions', async () => {
  const db = await createTestChainDB()
  const row: DBNewRailgunTransaction = {
    railgunTxid: new Uint8Array(32).fill(1),
    txidVersion: 2,
    chainTxid: new Uint8Array(32).fill(2),
    graphID: null,
    blockNumber: 120n,
    timestamp: 1000n,
    nullifiers: [new Uint8Array(32).fill(3)],
    commitments: [new Uint8Array(32).fill(4)],
    boundParamsHash: new Uint8Array(32).fill(5),
    hasUnshield: false,
    unshield: null,
    utxoTreeIn: 0,
    utxoTreeOut: 1,
    utxoBatchStartPositionOut: 0,
    verificationHash: null,
  }

  await insertScanBatch(db, { chainID: 1, blockNumber: 120n, railgunTransactions: [row] })
  assert.equal(await getTxidSyncCursor(db, 1), 120n)
  assert.equal((await getSyncState(db, 1))?.lastBlockHeight, 120n)

  await insertScanBatch(db, { chainID: 1, blockNumber: 130n, railgunTransactions: [row] })
  assert.equal(await getTxidSyncCursor(db, 1), 120n)
  assert.equal((await getSyncState(db, 1))?.lastBlockHeight, 130n)
})

test('ChainDB: insertScanBatch rolls back every write when one insert fails', async () => {
  const db = await createTestChainDB()
  const nullifiersBatch = createTestNullifiers(2, 700n)
  const badCommitments = createTestShieldCommitments(1, 700n)
  badCommitments[0]!.treePosition = 66_000

  await assert.rejects(insertScanBatch(db, {
    chainID: 1,
    blockNumber: 700n,
    nullifiers: nullifiersBatch,
    commitments: badCommitments
  }))

  assert.equal((await getAllNullifiers(db)).length, 0)
  assert.equal(await getSyncState(db, 1), undefined)
})
