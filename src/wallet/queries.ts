import { and, eq, inArray, sql } from 'drizzle-orm'

import type { WalletDB } from './db'
import type { DBNewNote, DBNewTxHistory, DBNewWallet } from './schema'
import {
  balances,
  notes,
  scanState,
  txHistory,
  wallets
} from './schema'

/**
 * Insert a new wallet record and return its ID.
 * @param db - Wallet database instance.
 * @param wallet - Data for the new wallet.
 * @returns The `id` of the created wallet.
 */
function createWallet (db: WalletDB, wallet: DBNewWallet): string {
  db.insert(wallets).values(wallet).run()
  return wallet.id
}

/**
 * Retrieve a wallet record by its ID.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet to fetch.
 * @returns The wallet record or `undefined` if not found.
 */
function getWallet (db: WalletDB, walletId: string) {
  return db.select().from(wallets).where(eq(wallets.id, walletId)).get()
}

/**
 * List all wallet records in the database.
 * @param db - Wallet database instance.
 * @returns An array of wallet records.
 */
function listWallets (db: WalletDB) {
  return db.select().from(wallets).all()
}

/**
 * Delete a wallet by ID, wrapped in a transaction.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet to delete.
 * @returns Number of rows deleted (should be 0 or 1).
 */
function deleteWallet (db: WalletDB, walletId: string): number {
  return db.transaction(() => {
    const result = db.delete(wallets).where(eq(wallets.id, walletId)).run()
    return result.changes
  })
}

/**
 * Insert a note into the database ignoring conflicts.
 * @param db - Wallet database instance.
 * @param note - Note data to insert.
 */
function insertNote (db: WalletDB, note: DBNewNote): void {
  db.insert(notes).values(note).onConflictDoNothing().run()
}

/**
 * Batch-insert notes, ignoring conflicts.
 * @param db - Wallet database instance.
 * @param noteList - Array of notes to insert.
 * @returns Number of rows inserted or updated.
 */
function insertNotesBatch (db: WalletDB, noteList: DBNewNote[]): number {
  if (noteList.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .insert(notes)
      .values(noteList)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
}

/**
 * Retrieve all unspent notes for a given wallet.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @returns - All the unspent notes for given walletID
 */
function getUnspentNotes (db: WalletDB, walletId: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.spent, false)))
    .all()
}

/**
 * Retrieve unspent notes filtered by token for a wallet.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param token - Token identifier to filter by.
 * @returns - All the unspent notes for given walletID based on token filter
 */
function getUnspentNotesByToken (
  db: WalletDB,
  walletId: string,
  token: string
) {
  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.walletId, walletId),
        eq(notes.token, token),
        eq(notes.spent, false)
      )
    )
    .all()
}

/**
 * Fetch a note by its commitment value.
 * @param db - Wallet database instance.
 * @param commitment - Commitment string to search for.
 * @returns The note record or `undefined`.
 */
function getNoteByCommitment (db: WalletDB, commitment: Uint8Array) {
  return db.select().from(notes).where(eq(notes.commitment, commitment)).get()
}

/**
 * Fetch a note by its nullifier value.
 * @param db - Wallet database instance.
 * @param nullifier - Nullifier string to search for.
 * @returns The note record or `undefined`.
 */
function getNoteByNullifier (db: WalletDB, nullifier: Uint8Array) {
  return db.select().from(notes).where(eq(notes.nullifier, nullifier)).get()
}

/**
 * Mark a note as spent and record the transaction ID that spent it.
 * @param db - Wallet database instance.
 * @param commitment - Commitment of the note to update.
 * @param spentTxid - Transaction ID that spent the note.
 */
function markNoteSpent (
  db: WalletDB,
  commitment: Uint8Array,
  spentTxid: Uint8Array
): void {
  db.update(notes)
    .set({ spent: true, spentTxid })
    .where(eq(notes.commitment, commitment))
    .run()
}

/**
 * Mark multiple notes as spent in a single transaction.
 * @param db - Wallet database instance.
 * @param commitments - Array of note commitments to update.
 * @param spentTxid - Transaction ID that spent the notes.
 * @returns Number of rows updated.
 */
function markNotesSpentBatch (
  db: WalletDB,
  commitments: Uint8Array[],
  spentTxid: Uint8Array
): number {
  if (commitments.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .update(notes)
      .set({ spent: true, spentTxid })
      .where(inArray(notes.commitment, commitments))
      .run()

    return result.changes
  })
}

/**
 * Return all notes belonging to a wallet.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @returns Array of note records.
 */
function getAllNotes (db: WalletDB, walletId: string) {
  return db.select().from(notes).where(eq(notes.walletId, walletId)).all()
}

/**
 * Recalculate and persist the balance for a given wallet/token pair.
 * The function computes the sum of all unspent notes and upserts the
 * resulting amount into the `balances` table.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param token - Token identifier.
 * @returns The recalculated amount as a bigint.
 */
function recalculateBalance (
  db: WalletDB,
  walletId: string,
  token: string
): bigint {
  // Amount is internally stored as text (custom bigint type) and sqlite has limitation
  // of 64 bit Integer sum, we cannot apply SUM operation here
  return db.transaction(() => {
    const result = db
      .select({ amount: notes.amount })
      .from(notes)
      .where(
        and(
          eq(notes.walletId, walletId),
          eq(notes.token, token),
          eq(notes.spent, false)
        )
      )
      .all()

    const amount = result.reduce((sum, row) => sum + row.amount, 0n)
    db.insert(balances)
      .values({ walletId, token, amount })
      .onConflictDoUpdate({
        target: [balances.walletId, balances.token],
        set: { amount, updatedAt: sql`(unixepoch())` },
      })
      .run()

    return amount
  })
}

/**
 * Retrieve a stored balance for a wallet/token pair.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param token - Token identifier.
 * @returns The balance record or `undefined`.
 */
function getBalance (db: WalletDB, walletId: string, token: string) {
  return db
    .select()
    .from(balances)
    .where(and(eq(balances.walletId, walletId), eq(balances.token, token)))
    .get()
}

/**
 * Get all balance records for a wallet.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @returns Array of balance records.
 */
function getAllBalances (db: WalletDB, walletId: string) {
  return db.select().from(balances).where(eq(balances.walletId, walletId)).all()
}

/**
 * Recompute all token balances for a wallet by iterating over its notes.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 */
function recalculateAllBalances (db: WalletDB, walletId: string): void {
  const tokens = db
    .select({ token: notes.token })
    .from(notes)
    .where(eq(notes.walletId, walletId))
    .groupBy(notes.token)
    .all()

  for (const { token } of tokens) {
    recalculateBalance(db, walletId, token)
  }
}

/**
 * Retrieve the scan state for a wallet on a particular chain.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @returns - Scan state for given chain for given wallet.
 */
function getScanState (db: WalletDB, walletId: string, chainId: number) {
  return db
    .select()
    .from(scanState)
    .where(
      and(eq(scanState.walletId, walletId), eq(scanState.chainId, chainId))
    )
    .get()
}

/**
 * Update or insert the scan state record for a wallet/chain pair.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @param lastScannedBlock - Latest block height scanned.
 */
function updateScanState (
  db: WalletDB,
  walletId: string,
  chainId: number,
  lastScannedBlock: bigint
): void {
  db.insert(scanState)
    .values({ walletId, chainId, lastScannedBlock })
    .onConflictDoUpdate({
      target: [scanState.walletId, scanState.chainId],
      set: { lastScannedBlock, updatedAt: sql`(unixepoch())` },
    })
    .run()
}

/**
 * Add a transaction history entry, ignoring duplicates.
 * @param db - Wallet database instance.
 * @param tx - Transaction history record to insert.
 */
function insertTxHistory (db: WalletDB, tx: DBNewTxHistory): void {
  db.insert(txHistory).values(tx).onConflictDoNothing().run()
}

/**
 * Batch insert transaction history entries.
 * @param db - Wallet database instance.
 * @param txs - Array of transaction history records.
 * @returns Number of rows inserted.
 */
function insertTxHistoryBatch (db: WalletDB, txs: DBNewTxHistory[]): number {
  if (txs.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .insert(txHistory)
      .values(txs)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
}

/**
 * Retrieve recent transaction history for a wallet.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param limit - Maximum number of records to return (default 100).
 * @returns - Transaction history for given walletId with given limit.
 */
function getTxHistory (db: WalletDB, walletId: string, limit: number = 100) {
  return db
    .select()
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .orderBy(sql`${txHistory.blockNumber} DESC`)
    .limit(limit)
    .all()
}

/**
 * Fetch a transaction history entry by its ID.
 * @param db - Wallet database instance.
 * @param txId - Transaction ID to lookup.
 * @returns The history record or `undefined`.
 */
function getTxById (db: WalletDB, txId: string) {
  return db.select().from(txHistory).where(eq(txHistory.id, txId)).get()
}

/**
 * Compute basic statistics about a wallet database, such as note count.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @returns - Get walletDB statistics like total notes, unspent note count, tx history count ...
 */
function getWalletDBStats (db: WalletDB, walletId: string) {
  const notesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(eq(notes.walletId, walletId))
    .get()

  const unspentNotesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.spent, false)))
    .get()

  const balancesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(balances)
    .where(eq(balances.walletId, walletId))
    .get()

  const txHistoryCount = db
    .select({ count: sql<number>`count(*)` })
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .get()

  return {
    notes: notesCount?.count ?? 0,
    unspentNotes: unspentNotesCount?.count ?? 0,
    balances: balancesCount?.count ?? 0,
    transactions: txHistoryCount?.count ?? 0,
  }
}

export {
  createWallet,
  getWallet,
  listWallets,
  deleteWallet,
  insertNote,
  insertNotesBatch,
  getUnspentNotes,
  getUnspentNotesByToken,
  getNoteByCommitment,
  getNoteByNullifier,
  markNoteSpent,
  markNotesSpentBatch,
  getAllNotes,
  recalculateBalance,
  getBalance,
  getAllBalances,
  recalculateAllBalances,
  getScanState,
  updateScanState,
  insertTxHistory,
  insertTxHistoryBatch,
  getTxHistory,
  getTxById,
  getWalletDBStats
}
