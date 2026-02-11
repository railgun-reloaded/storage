import { and, eq, inArray, sql } from 'drizzle-orm'

import type { WalletDB } from './db'
import type { NewNote, NewTxHistory, NewWallet } from './schema'
import {

  balances,
  notes,
  scanState,
  txHistory,
  wallets
} from './schema'

export function createWallet (db: WalletDB, wallet: NewWallet): string {
  db.insert(wallets).values(wallet).run()
  return wallet.id
}

export function getWallet (db: WalletDB, walletId: string) {
  return db.select().from(wallets).where(eq(wallets.id, walletId)).get()
}

export function listWallets (db: WalletDB) {
  return db.select().from(wallets).all()
}

export function deleteWallet (db: WalletDB, walletId: string): number {
  return db.transaction(() => {
    const result = db.delete(wallets).where(eq(wallets.id, walletId)).run()
    return result.changes
  })
}

export function insertNote (db: WalletDB, note: NewNote): void {
  db.insert(notes).values(note).onConflictDoNothing().run()
}

export function insertNotesBatch (db: WalletDB, noteList: NewNote[]): number {
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

export function getUnspentNotes (db: WalletDB, walletId: string) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.spent, false)))
    .all()
}

export function getUnspentNotesByToken (
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

export function getNoteByCommitment (db: WalletDB, commitment: string) {
  return db.select().from(notes).where(eq(notes.commitment, commitment)).get()
}

export function getNoteByNullifier (db: WalletDB, nullifier: string) {
  return db.select().from(notes).where(eq(notes.nullifier, nullifier)).get()
}

export function markNoteSpent (
  db: WalletDB,
  commitment: string,
  spentTxid: string
): void {
  db.update(notes)
    .set({ spent: true, spentTxid })
    .where(eq(notes.commitment, commitment))
    .run()
}

export function markNotesSpentBatch (
  db: WalletDB,
  commitments: string[],
  spentTxid: string
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

export function getAllNotes (db: WalletDB, walletId: string) {
  return db.select().from(notes).where(eq(notes.walletId, walletId)).all()
}

export function recalculateBalance (
  db: WalletDB,
  walletId: string,
  token: string
): bigint {
  return db.transaction(() => {
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
      .get()

    const amount = BigInt(result?.total ?? '0')

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

export function getBalance (db: WalletDB, walletId: string, token: string) {
  return db
    .select()
    .from(balances)
    .where(and(eq(balances.walletId, walletId), eq(balances.token, token)))
    .get()
}

export function getAllBalances (db: WalletDB, walletId: string) {
  return db.select().from(balances).where(eq(balances.walletId, walletId)).all()
}

export function recalculateAllBalances (db: WalletDB, walletId: string): void {
  db.transaction(() => {
    const tokens = db
      .select({ token: notes.token })
      .from(notes)
      .where(eq(notes.walletId, walletId))
      .groupBy(notes.token)
      .all()

    for (const { token } of tokens) {
      recalculateBalance(db, walletId, token)
    }
  })
}

export function getScanState (db: WalletDB, walletId: string, chainId: number) {
  return db
    .select()
    .from(scanState)
    .where(
      and(eq(scanState.walletId, walletId), eq(scanState.chainId, chainId))
    )
    .get()
}

export function updateScanState (
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

export function insertTxHistory (db: WalletDB, tx: NewTxHistory): void {
  db.insert(txHistory).values(tx).onConflictDoNothing().run()
}

export function insertTxHistoryBatch (db: WalletDB, txs: NewTxHistory[]): number {
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

export function getTxHistory (db: WalletDB, walletId: string, limit: number = 100) {
  return db
    .select()
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .orderBy(sql`${txHistory.blockNumber} DESC`)
    .limit(limit)
    .all()
}

export function getTxById (db: WalletDB, txId: string) {
  return db.select().from(txHistory).where(eq(txHistory.id, txId)).get()
}

export function getWalletDBStats (db: WalletDB, walletId: string) {
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
