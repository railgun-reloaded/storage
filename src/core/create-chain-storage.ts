import {
  applyScanBatch,
  deleteCommitmentsFromBlock,
  deleteNullifiersFromBlock,
  findRailgunTransactionForLeaf,
  getAllMerkleTrees,
  getAllNullifiers,
  getCommitmentsByBlockRange,
  getCommitmentsByLeafRange,
  getMerkleTree,
  getNullifiersByBlockRange,
  getNullifiersFromBlock,
  getRailgunTransactionByTxid,
  getRailgunTransactionsByBlockRange,
  getRailgunTransactionsByTreeRange,
  getSyncState,
  getTxidSyncCursor,
  getUnshieldsByBlockRange,
  insertCommitmentBatch,
  insertNullifiersBatch,
  insertRailgunTransactions,
  insertUnshieldBatch,
  nullifierExists,
  setMerkleTree,
  setTxidSyncCursor,
  updateSyncState,
} from '../chain/queries.js'

import { bind } from './bind.js'
import type { ChainStorage } from './chain-storage.js'
import type { ChainDatabase, Transactor } from './database.js'

/**
 * Construct a `ChainStorage` from a driver-neutral chain database and the
 * adapter-supplied transaction capability. All storage semantics live in the
 * shared query layer; the adapter only provides query execution and
 * atomicity.
 * @param db - Driver-neutral chain database.
 * @param transaction - Transaction capability for the database.
 * @returns A `ChainStorage` implementation bound to the database.
 */
function createChainStorage (db: ChainDatabase, transaction: Transactor<ChainDatabase>): ChainStorage {
  return {
    nullifierExists: bind(nullifierExists, db),
    insertNullifiersBatch: bind(insertNullifiersBatch, db),
    getNullifiersByBlockRange: bind(getNullifiersByBlockRange, db),
    deleteNullifiersFromBlock: bind(deleteNullifiersFromBlock, db),
    getAllNullifiers: bind(getAllNullifiers, db),
    getNullifiersFromBlock: bind(getNullifiersFromBlock, db),
    insertCommitmentBatch: bind(insertCommitmentBatch, db),
    getCommitmentsByLeafRange: bind(getCommitmentsByLeafRange, db),
    getCommitmentsByBlockRange: bind(getCommitmentsByBlockRange, db),
    deleteCommitmentsFromBlock: bind(deleteCommitmentsFromBlock, db),
    getMerkleTree: bind(getMerkleTree, db),
    getAllMerkleTrees: bind(getAllMerkleTrees, db),
    setMerkleTree: bind(setMerkleTree, db),
    getSyncState: bind(getSyncState, db),
    updateSyncState: bind(updateSyncState, db),
    getTxidSyncCursor: bind(getTxidSyncCursor, db),
    setTxidSyncCursor: bind(setTxidSyncCursor, db),
    insertRailgunTransactions: bind(insertRailgunTransactions, db),
    getRailgunTransactionByTxid: bind(getRailgunTransactionByTxid, db),
    getRailgunTransactionsByBlockRange: bind(getRailgunTransactionsByBlockRange, db),
    getRailgunTransactionsByTreeRange: bind(getRailgunTransactionsByTreeRange, db),
    findRailgunTransactionForLeaf: bind(findRailgunTransactionForLeaf, db),
    insertUnshieldBatch: bind(insertUnshieldBatch, db),
    getUnshieldsByBlockRange: bind(getUnshieldsByBlockRange, db),
    /**
     * Persist one scan batch atomically through the adapter's transaction
     * capability.
     * @param batch - Scan batch to persist.
     * @returns Resolves when the batch is committed.
     */
    insertScanBatch: (batch) => transaction((tx) => applyScanBatch(tx, batch)),
  }
}

export { createChainStorage }
