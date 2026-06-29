import type { WalletStorage } from '../core/wallet-storage.js'
import type { WalletDB } from '../wallet/db.js'
import {
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
  markNotesSpentBatch,
  updateNotePoiStatus,
  updateNotePoiStatusBatch,
  updateScanState,
} from '../wallet/queries.js'

import { bind, boundCount } from './bind.js'

/**
 * Construct a `WalletStorage` backed by a Node `better-sqlite3` database.
 * @param db - The wallet database handle to bind.
 * @returns A `WalletStorage` implementation delegating to the bound database.
 */
function createWalletStorage (db: WalletDB): WalletStorage {
  return {
    createWallet: bind(createWallet, db),
    getWallet: bind(getWallet, db),
    listWallets: bind(listWallets, db),
    deleteWallet: boundCount(deleteWallet, db),
    insertNote: bind(insertNote, db),
    insertNotesBatch: boundCount(insertNotesBatch, db),
    getUnspentNotes: bind(getUnspentNotes, db),
    getUnspentNotesByToken: bind(getUnspentNotesByToken, db),
    getNoteByCommitment: bind(getNoteByCommitment, db),
    getNoteByNullifier: bind(getNoteByNullifier, db),
    markNoteSpent: boundCount(markNoteSpent, db),
    markNotesSpentBatch: boundCount(markNotesSpentBatch, db),
    getAllNotes: bind(getAllNotes, db),
    getNotesNeedingPoiRefresh: bind(getNotesNeedingPoiRefresh, db),
    updateNotePoiStatus: boundCount(updateNotePoiStatus, db),
    updateNotePoiStatusBatch: boundCount(updateNotePoiStatusBatch, db),
    getScanState: bind(getScanState, db),
    updateScanState: bind(updateScanState, db),
    insertTxHistory: bind(insertTxHistory, db),
    insertTxHistoryBatch: boundCount(insertTxHistoryBatch, db),
    getTxHistory: bind(getTxHistory, db),
    getTxById: bind(getTxById, db),
    getWalletDBStats: bind(getWalletDBStats, db),
  }
}

export { createWalletStorage }
