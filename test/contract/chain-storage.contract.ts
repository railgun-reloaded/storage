import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  createTestCommitments,
  createTestMerkleTreeLeaves,
  createTestNullifiers,
  createTestRailgunTransaction,
  createTestUnshields,
} from './fixtures.js'
import type { ChainHarnessFactory, ChainStorageHarness } from './harness.js'

/**
 * Register the full `ChainStorage` contract suite against an adapter.
 * @param name - Human-readable name of the adapter under test.
 * @param makeHarness - Factory producing a fresh, isolated chain store.
 */
function runChainStorageContract (name: string, makeHarness: ChainHarnessFactory): void {
  /**
   * Run a test body against a fresh harness and always close it afterwards.
   * @param body - Test body receiving the harness.
   * @returns A function suitable for passing to `test`.
   */
  const withChain = (body: (harness: ChainStorageHarness) => Promise<void>) => async () => {
    const harness = await makeHarness()
    try {
      await body(harness)
    } finally {
      await harness.close()
    }
  }

  describe(`ChainStorage contract: ${name}`, () => {
    test('empty batches are no-ops returning 0', withChain(async ({ storage }) => {
      assert.equal(await storage.insertNullifiersBatch([]), 0)
      assert.equal(await storage.insertCommitmentBatch([]), 0)
      assert.equal(await storage.insertUnshieldBatch([]), 0)
      assert.equal(await storage.insertRailgunTransactions([]), 0)
      assert.deepEqual(await storage.getAllNullifiers(), [])
    }))

    test('batch mutation counts are plain numbers', withChain(async ({ storage }) => {
      const count = await storage.insertNullifiersBatch(createTestNullifiers(3))
      assert.equal(typeof count, 'number')
      assert.equal(count, 3)
    }))

    test('nullifiers persist, exist, and return ordered by block', withChain(async ({ storage }) => {
      const nullifiers = createTestNullifiers(3, 500n)
      await storage.insertNullifiersBatch([nullifiers[2]!, nullifiers[0]!, nullifiers[1]!])

      const all = await storage.getAllNullifiers()
      assert.deepEqual(all, nullifiers)
      assert.equal(await storage.nullifierExists(nullifiers[0]!.nullifier, 0), true)
      assert.equal(await storage.nullifierExists(new Uint8Array(32), 0), false)
    }))

    test('nullifier range queries are inclusive and ordered', withChain(async ({ storage }) => {
      await storage.insertNullifiersBatch(createTestNullifiers(5, 100n))
      const range = await storage.getNullifiersByBlockRange(101n, 103n)
      assert.deepEqual(range.map((n) => n.blockNumber), [101n, 102n, 103n])
      const fromBlock = await storage.getNullifiersFromBlock(103n)
      assert.deepEqual(fromBlock.map((n) => n.blockNumber), [103n, 104n])
    }))

    test('reorg deletion removes nullifiers at or after a block', withChain(async ({ storage }) => {
      await storage.insertNullifiersBatch(createTestNullifiers(5, 100n))
      const deleted = await storage.deleteNullifiersFromBlock(102n)
      assert.equal(deleted, 3)
      const remaining = await storage.getAllNullifiers()
      assert.deepEqual(remaining.map((n) => n.blockNumber), [100n, 101n])
    }))

    test('upsert conflict on nullifier identity keeps a single row', withChain(async ({ storage }) => {
      const [nullifier] = createTestNullifiers(1, 100n)
      await storage.insertNullifiersBatch([nullifier!])
      await storage.insertNullifiersBatch([{ ...nullifier!, blockNumber: 999n }])
      const all = await storage.getAllNullifiers()
      assert.equal(all.length, 1)
      assert.equal(all[0]!.blockNumber, 999n)
    }))

    test('commitments persist with leaf-range and block-range ordering', withChain(async ({ storage }) => {
      const commitments = createTestCommitments(4, 200n)
      await storage.insertCommitmentBatch(commitments)
      const byLeaf = await storage.getCommitmentsByLeafRange(0, 1, 2)
      assert.deepEqual(byLeaf, commitments.slice(1, 3))
      const byBlock = await storage.getCommitmentsByBlockRange(200n, 201n)
      assert.deepEqual(byBlock, commitments.slice(0, 2))
      assert.equal(await storage.deleteCommitmentsFromBlock(202n), 2)
    }))

    test('merkle trees upsert, fetch, and list ordered by tree number', withChain(async ({ storage }) => {
      const leaves = createTestMerkleTreeLeaves()
      await storage.setMerkleTree({ treeNumber: 1, leaves, leafCount: 10 })
      await storage.setMerkleTree({ treeNumber: 0, leaves, leafCount: 5 })
      const all = await storage.getAllMerkleTrees()
      assert.deepEqual(all.map((t) => t.treeNumber), [0, 1])
      const one = await storage.getMerkleTree(0)
      assert.equal(one?.leafCount, 5)
      assert.equal(await storage.getMerkleTree(99), undefined)
    }))

    test('sync cursor and txid cursor advance independently', withChain(async ({ storage }) => {
      assert.equal(await storage.getSyncState(1), undefined)
      await storage.updateSyncState(1, 500n)
      assert.equal((await storage.getSyncState(1))?.lastBlockHeight, 500n)
      assert.equal(await storage.getTxidSyncCursor(1), 0n)
      await storage.setTxidSyncCursor(1, 480n)
      assert.equal(await storage.getTxidSyncCursor(1), 480n)
      assert.equal((await storage.getSyncState(1))?.lastBlockHeight, 500n)
    }))

    test('railgun transactions dedup, fetch, and locate by leaf', withChain(async ({ storage }) => {
      const tx = createTestRailgunTransaction({ blockNumber: 300n, utxoTreeOut: 0, utxoBatchStartPositionOut: 5 })
      assert.equal(await storage.insertRailgunTransactions([tx]), 1)
      assert.equal(await storage.insertRailgunTransactions([tx]), 0)

      const fetched = await storage.getRailgunTransactionByTxid(tx.railgunTxid)
      assert.deepEqual(fetched?.railgunTxid, tx.railgunTxid)
      assert.deepEqual(fetched?.nullifiers, tx.nullifiers)
      assert.deepEqual(fetched?.commitments, tx.commitments)
      assert.deepEqual(fetched?.boundParamsHash, tx.boundParamsHash)
      assert.deepEqual((await storage.getRailgunTransactionsByBlockRange(300n, 300n)).length, 1)
      assert.deepEqual((await storage.getRailgunTransactionsByTreeRange(0, 0, 10)).length, 1)
      assert.ok(await storage.findRailgunTransactionForLeaf(0, 6))
      assert.equal(await storage.findRailgunTransactionForLeaf(0, 7), undefined)
    }))

    test('unshields persist and return ordered by block', withChain(async ({ storage }) => {
      const unshields = createTestUnshields(3, 100n)
      await storage.insertUnshieldBatch(unshields)
      const range = await storage.getUnshieldsByBlockRange(100n, 102n)
      assert.deepEqual(range, unshields)
    }))

    test('insertScanBatch persists every member and advances cursors', withChain(async ({ storage }) => {
      await storage.insertScanBatch({
        chainID: 1,
        blockNumber: 700n,
        nullifiers: createTestNullifiers(2, 700n),
        commitments: createTestCommitments(2, 700n),
        unshields: createTestUnshields(1, 700n),
        railgunTransactions: [createTestRailgunTransaction({ blockNumber: 700n })],
        merkleTrees: [{ treeNumber: 0, leaves: createTestMerkleTreeLeaves(), leafCount: 2 }],
      })

      assert.equal((await storage.getAllNullifiers()).length, 2)
      assert.equal((await storage.getCommitmentsByBlockRange(700n, 701n)).length, 2)
      assert.equal((await storage.getUnshieldsByBlockRange(700n, 700n)).length, 1)
      assert.equal((await storage.getAllMerkleTrees()).length, 1)
      assert.equal((await storage.getRailgunTransactionsByBlockRange(700n, 700n)).length, 1)
      assert.equal((await storage.getSyncState(1))?.lastBlockHeight, 700n)
      assert.equal(await storage.getTxidSyncCursor(1), 700n)
    }))

    test('insertScanBatch leaves the txid cursor untouched without a new railgun transaction', withChain(async ({ storage }) => {
      const transaction = createTestRailgunTransaction({ blockNumber: 700n })
      await storage.insertScanBatch({
        chainID: 1,
        blockNumber: 700n,
        railgunTransactions: [transaction],
      })
      await storage.insertScanBatch({
        chainID: 1,
        blockNumber: 800n,
        nullifiers: createTestNullifiers(1, 800n),
        railgunTransactions: [transaction],
      })
      assert.equal((await storage.getSyncState(1))?.lastBlockHeight, 800n)
      assert.equal(await storage.getTxidSyncCursor(1), 700n)
    }))

    test('insertScanBatch rolls back fully when a member is invalid', withChain(async ({ storage }) => {
      await assert.rejects(storage.insertScanBatch({
        chainID: 1,
        blockNumber: 900n,
        nullifiers: createTestNullifiers(2, 900n),
        merkleTrees: [{ treeNumber: 0, leaves: new Uint8Array(8), leafCount: 1 }],
      }))

      assert.deepEqual(await storage.getAllNullifiers(), [])
      assert.equal(await storage.getSyncState(1), undefined)
    }))

    test('written chain state survives close and reopen', withChain(async (harness) => {
      await harness.storage.insertNullifiersBatch(createTestNullifiers(2, 100n))
      await harness.storage.updateSyncState(1, 100n)
      const reopened = await harness.reopen()
      assert.equal((await reopened.getAllNullifiers()).length, 2)
      assert.equal((await reopened.getSyncState(1))?.lastBlockHeight, 100n)
    }))
  })
}

export { runChainStorageContract }
