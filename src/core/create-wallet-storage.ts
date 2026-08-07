import {
  applyNotePoiStatusUpdates,
  applyNoteSpends,
  createWallet,
  deleteWallet,
  getAllNotes,
  getNoteByCommitment,
  getNoteByNullifier,
  getNotesNeedingPoiRefresh,
  getScanState,
  getTxById,
  getTxHistory,
  getUnspentNotes,
  getUnspentNotesByToken,
  getWallet,
  getWalletDBStats,
  insertNote,
  insertNotesBatch,
  insertTxHistory,
  insertTxHistoryBatch,
  listWallets,
  markNoteSpent,
  updateNotePoiStatus,
  updateScanState,
} from '../wallet/queries.js'

import { bind } from './bind.js'
import type { Transactor, WalletDatabase } from './database.js'
import type { WalletStorage } from './wallet-storage.js'

/**
 * Construct a `WalletStorage` from a driver-neutral wallet database and the
 * adapter-supplied transaction capability. All storage semantics live in the
 * shared query layer; the adapter only provides query execution and
 * atomicity.
 * @param db - Driver-neutral wallet database.
 * @param transaction - Transaction capability for the database.
 * @returns A `WalletStorage` implementation bound to the database.
 */
function createWalletStorage (db: WalletDatabase, transaction: Transactor<WalletDatabase>): WalletStorage {
  return {
    createWallet: bind(createWallet, db),
    getWallet: bind(getWallet, db),
    listWallets: bind(listWallets, db),
    deleteWallet: bind(deleteWallet, db),
    insertNote: bind(insertNote, db),
    insertNotesBatch: bind(insertNotesBatch, db),
    getUnspentNotes: bind(getUnspentNotes, db),
    getUnspentNotesByToken: bind(getUnspentNotesByToken, db),
    getNoteByCommitment: bind(getNoteByCommitment, db),
    getNoteByNullifier: bind(getNoteByNullifier, db),
    markNoteSpent: bind(markNoteSpent, db),
    /**
     * Mark multiple notes as spent atomically through the adapter's
     * transaction capability.
     * @param identities - Note identities to update.
     * @param spentTxid - Transaction ID that spent the notes.
     * @param spentBlockNumber - Block containing the spending transaction.
     * @param spentTimestamp - Timestamp of the spending block, or `null` when
     * the data source does not carry one for this transaction.
     * @returns Number of rows updated.
     */
    markNotesSpentBatch: (
      identities,
      spentTxid,
      spentBlockNumber,
      spentTimestamp
    ) => transaction((tx) => applyNoteSpends(
      tx,
      identities,
      spentTxid,
      spentBlockNumber,
      spentTimestamp
    )),
    getAllNotes: bind(getAllNotes, db),
    getNotesNeedingPoiRefresh: bind(getNotesNeedingPoiRefresh, db),
    updateNotePoiStatus: bind(updateNotePoiStatus, db),
    /**
     * Persist PPOI status updates for multiple notes atomically through the
     * adapter's transaction capability.
     * @param updates - Note PPOI updates.
     * @returns Number of rows updated.
     */
    updateNotePoiStatusBatch: (updates) => transaction((tx) => applyNotePoiStatusUpdates(tx, updates)),
    getScanState: bind(getScanState, db),
    updateScanState: bind(updateScanState, db),
    insertTxHistory: bind(insertTxHistory, db),
    insertTxHistoryBatch: bind(insertTxHistoryBatch, db),
    getTxHistory: bind(getTxHistory, db),
    getTxById: bind(getTxById, db),
    getWalletDBStats: bind(getWalletDBStats, db),
  }
}

export { createWalletStorage }
