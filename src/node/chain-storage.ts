import type { ChainDB } from '../chain/db.js'
import {
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
  insertScanBatch,
  insertUnshieldBatch,
  nullifierExists,
  setMerkleTree,
  setTxidSyncCursor,
  updateSyncState,
} from '../chain/queries.js'
import type { ChainStorage } from '../core/chain-storage.js'

import { bind, boundCount } from './bind.js'

/**
 * Construct a `ChainStorage` backed by a Node `better-sqlite3` database.
 * @param db - The chain database handle to bind.
 * @returns A `ChainStorage` implementation delegating to the bound database.
 */
function createChainStorage (db: ChainDB): ChainStorage {
  return {
    nullifierExists: bind(nullifierExists, db),
    insertNullifiersBatch: boundCount(insertNullifiersBatch, db),
    getNullifiersByBlockRange: bind(getNullifiersByBlockRange, db),
    deleteNullifiersFromBlock: boundCount(deleteNullifiersFromBlock, db),
    getAllNullifiers: bind(getAllNullifiers, db),
    getNullifiersFromBlock: bind(getNullifiersFromBlock, db),
    insertCommitmentBatch: boundCount(insertCommitmentBatch, db),
    getCommitmentsByLeafRange: bind(getCommitmentsByLeafRange, db),
    getCommitmentsByBlockRange: bind(getCommitmentsByBlockRange, db),
    deleteCommitmentsFromBlock: boundCount(deleteCommitmentsFromBlock, db),
    getMerkleTree: bind(getMerkleTree, db),
    getAllMerkleTrees: bind(getAllMerkleTrees, db),
    setMerkleTree: boundCount(setMerkleTree, db),
    getSyncState: bind(getSyncState, db),
    updateSyncState: boundCount(updateSyncState, db),
    getTxidSyncCursor: bind(getTxidSyncCursor, db),
    setTxidSyncCursor: boundCount(setTxidSyncCursor, db),
    insertRailgunTransactions: boundCount(insertRailgunTransactions, db),
    getRailgunTransactionByTxid: bind(getRailgunTransactionByTxid, db),
    getRailgunTransactionsByBlockRange: bind(getRailgunTransactionsByBlockRange, db),
    getRailgunTransactionsByTreeRange: bind(getRailgunTransactionsByTreeRange, db),
    findRailgunTransactionForLeaf: bind(findRailgunTransactionForLeaf, db),
    insertUnshieldBatch: boundCount(insertUnshieldBatch, db),
    getUnshieldsByBlockRange: bind(getUnshieldsByBlockRange, db),
    insertScanBatch: bind(insertScanBatch, db),
  }
}

export { createChainStorage }
