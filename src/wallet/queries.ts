import { eq, and, inArray, sql } from 'drizzle-orm';
import type { WalletDB } from './db.js';
import {
  wallets,
  notes,
  balances,
  scanState,
  txHistory,
  type NewWallet,
  type NewNote,
  type NewBalance,
  type NewScanState,
  type NewTxHistory,
} from './schema.js';

/**
 * Wallet Operations
 */

/**
 * Creates a new wallet.
 *
 * @param db - Wallet database instance
 * @param wallet - Wallet data
 * @returns Wallet ID
 */
export function createWallet(db: WalletDB, wallet: NewWallet): string {
  db.insert(wallets).values(wallet).run();
  return wallet.id;
}

/**
 * Gets a wallet by ID.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @returns Wallet or undefined
 */
export function getWallet(db: WalletDB, walletId: string) {
  return db.select().from(wallets).where(eq(wallets.id, walletId)).get();
}

/**
 * Lists all wallets.
 *
 * @param db - Wallet database instance
 * @returns Array of wallets
 */
export function listWallets(db: WalletDB) {
  return db.select().from(wallets).all();
}

/**
 * Deletes a wallet and all associated data (CASCADE).
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID to delete
 * @returns Number of wallets deleted
 */
export function deleteWallet(db: WalletDB, walletId: string): number {
  return db.transaction(() => {
    const result = db.delete(wallets).where(eq(wallets.id, walletId)).run();
    return result.changes;
  });
}

/**
 * Note Operations
 */

/**
 * Inserts a new note.
 *
 * @param db - Wallet database instance
 * @param note - Note data
 */
export function insertNote(db: WalletDB, note: NewNote): void {
  db.insert(notes).values(note).onConflictDoNothing().run();
}

/**
 * Batch inserts notes with transaction.
 *
 * @param db - Wallet database instance
 * @param noteList - Array of notes to insert
 * @returns Number of rows inserted
 */
export function insertNotesBatch(db: WalletDB, noteList: NewNote[]): number {
  if (noteList.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .insert(notes)
      .values(noteList)
      .onConflictDoNothing()
      .run();

    return result.changes;
  });
}

/**
 * Gets all unspent notes for a wallet.
 * Hot path for balance calculation.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @returns Array of unspent notes
 */
export function getUnspentNotes(db: WalletDB, walletId: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.spent, false)))
    .all();
}

/**
 * Gets unspent notes for a specific token.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param token - Token address
 * @returns Array of unspent notes
 */
export function getUnspentNotesByToken(
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
    .all();
}

/**
 * Gets a note by commitment hash.
 *
 * @param db - Wallet database instance
 * @param commitment - Commitment hash
 * @returns Note or undefined
 */
export function getNoteByCommitment(db: WalletDB, commitment: string) {
  return db.select().from(notes).where(eq(notes.commitment, commitment)).get();
}

/**
 * Gets a note by nullifier.
 *
 * @param db - Wallet database instance
 * @param nullifier - Nullifier hash
 * @returns Note or undefined
 */
export function getNoteByNullifier(db: WalletDB, nullifier: string) {
  return db.select().from(notes).where(eq(notes.nullifier, nullifier)).get();
}

/**
 * Marks a note as spent.
 *
 * @param db - Wallet database instance
 * @param commitment - Commitment hash
 * @param spentTxid - Transaction ID where note was spent
 */
export function markNoteSpent(
  db: WalletDB,
  commitment: string,
  spentTxid: string
): void {
  db.update(notes)
    .set({ spent: true, spentTxid })
    .where(eq(notes.commitment, commitment))
    .run();
}

/**
 * Marks multiple notes as spent (batch operation).
 *
 * @param db - Wallet database instance
 * @param commitments - Array of commitment hashes
 * @param spentTxid - Transaction ID where notes were spent
 * @returns Number of notes updated
 */
export function markNotesSpentBatch(
  db: WalletDB,
  commitments: string[],
  spentTxid: string
): number {
  if (commitments.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .update(notes)
      .set({ spent: true, spentTxid })
      .where(inArray(notes.commitment, commitments))
      .run();

    return result.changes;
  });
}

/**
 * Gets all notes for a wallet (spent and unspent).
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @returns Array of all notes
 */
export function getAllNotes(db: WalletDB, walletId: string) {
  return db.select().from(notes).where(eq(notes.walletId, walletId)).all();
}

/**
 * Balance Operations
 */

/**
 * Recalculates and updates balance for a wallet and token.
 * Sums all unspent notes for the token.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param token - Token address
 * @returns Updated balance amount
 */
export function recalculateBalance(
  db: WalletDB,
  walletId: string,
  token: string
): bigint {
  return db.transaction(() => {
    // Sum unspent notes for this token
    const result = db
      .select({ total: sql<string>`COALESCE(SUM(${notes.amount}), '0')` })
      .from(notes)
      .where(
        and(
          eq(notes.walletId, walletId),
          eq(notes.token, token),
          eq(notes.spent, false)
        )
      )
      .get();

    const amount = BigInt(result?.total ?? '0');

    // Upsert balance
    db.insert(balances)
      .values({ walletId, token, amount })
      .onConflictDoUpdate({
        target: [balances.walletId, balances.token],
        set: { amount, updatedAt: sql`(unixepoch())` },
      })
      .run();

    return amount;
  });
}

/**
 * Gets balance for a wallet and token.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param token - Token address
 * @returns Balance or undefined
 */
export function getBalance(db: WalletDB, walletId: string, token: string) {
  return db
    .select()
    .from(balances)
    .where(and(eq(balances.walletId, walletId), eq(balances.token, token)))
    .get();
}

/**
 * Gets all balances for a wallet.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @returns Array of balances
 */
export function getAllBalances(db: WalletDB, walletId: string) {
  return db.select().from(balances).where(eq(balances.walletId, walletId)).all();
}

/**
 * Recalculates all balances for a wallet.
 * Should be called after batch note operations.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 */
export function recalculateAllBalances(db: WalletDB, walletId: string): void {
  db.transaction(() => {
    // Get distinct tokens for this wallet
    const tokens = db
      .select({ token: notes.token })
      .from(notes)
      .where(eq(notes.walletId, walletId))
      .groupBy(notes.token)
      .all();

    // Recalculate each token balance
    for (const { token } of tokens) {
      recalculateBalance(db, walletId, token);
    }
  });
}

/**
 * Scan State Operations
 */

/**
 * Gets scan state for a wallet and chain.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param chainId - Chain ID
 * @returns Scan state or undefined
 */
export function getScanState(db: WalletDB, walletId: string, chainId: number) {
  return db
    .select()
    .from(scanState)
    .where(
      and(eq(scanState.walletId, walletId), eq(scanState.chainId, chainId))
    )
    .get();
}

/**
 * Updates scan state for a wallet and chain.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param chainId - Chain ID
 * @param lastScannedBlock - Last scanned block number
 */
export function updateScanState(
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
    .run();
}

/**
 * Transaction History Operations
 */

/**
 * Inserts a transaction history entry.
 *
 * @param db - Wallet database instance
 * @param tx - Transaction data
 */
export function insertTxHistory(db: WalletDB, tx: NewTxHistory): void {
  db.insert(txHistory).values(tx).onConflictDoNothing().run();
}

/**
 * Batch inserts transaction history entries.
 *
 * @param db - Wallet database instance
 * @param txs - Array of transactions
 * @returns Number of rows inserted
 */
export function insertTxHistoryBatch(db: WalletDB, txs: NewTxHistory[]): number {
  if (txs.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .insert(txHistory)
      .values(txs)
      .onConflictDoNothing()
      .run();

    return result.changes;
  });
}

/**
 * Gets transaction history for a wallet.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @param limit - Maximum number of transactions to return
 * @returns Array of transactions (newest first)
 */
export function getTxHistory(db: WalletDB, walletId: string, limit: number = 100) {
  return db
    .select()
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .orderBy(sql`${txHistory.blockNumber} DESC`)
    .limit(limit)
    .all();
}

/**
 * Gets a transaction by ID.
 *
 * @param db - Wallet database instance
 * @param txId - Transaction ID
 * @returns Transaction or undefined
 */
export function getTxById(db: WalletDB, txId: string) {
  return db.select().from(txHistory).where(eq(txHistory.id, txId)).get();
}

/**
 * Database Utilities
 */

/**
 * Gets total count of records in each table for a wallet.
 *
 * @param db - Wallet database instance
 * @param walletId - Wallet ID
 * @returns Object with counts for each table
 */
export function getWalletDBStats(db: WalletDB, walletId: string) {
  const notesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(eq(notes.walletId, walletId))
    .get();

  const unspentNotesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.spent, false)))
    .get();

  const balancesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(balances)
    .where(eq(balances.walletId, walletId))
    .get();

  const txHistoryCount = db
    .select({ count: sql<number>`count(*)` })
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .get();

  return {
    notes: notesCount?.count ?? 0,
    unspentNotes: unspentNotesCount?.count ?? 0,
    balances: balancesCount?.count ?? 0,
    transactions: txHistoryCount?.count ?? 0,
  };
}
