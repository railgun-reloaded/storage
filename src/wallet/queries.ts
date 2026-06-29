import { encode } from '@msgpack/msgpack'
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'

import type { WalletDB } from './db.js'
import type { DBNewNote, DBNewTxHistory, DBNewWallet, DBNote } from './schema.js'
import {
  notes,
  scanState,
  txHistory,
  wallets
} from './schema.js'

type NoteIdentity = {
  walletId: string
  chainId: number
  commitment: Uint8Array
}

type NoteNullifierIdentity = {
  chainId: number
  nullifier: Uint8Array
  treeNumber: number
}

type NotePoiStatusUpdate = NoteIdentity & {
  blindedCommitment: Uint8Array
  poisPerList: Record<string, string> | null
}

type DBContext = WalletDB | SQLiteTransaction<any, any, any, any>

const POI_STATUS_VALID = 'Valid'
const POI_STATUS_NON_VALID_MARKERS = [
  'Missing',
  'ShieldBlocked',
  'ProofSubmitted',
] as const

/**
 * Canonical form for ERC-20 token addresses stored in or queried against the
 * wallet database. All comparisons rely on a single lowercase form so that
 * callers passing mixed-case (e.g. EIP-55 checksummed) addresses do not miss
 * rows written in a different case.
 * @param token - Token address in any case.
 * @returns Lowercase token address.
 */
function normalizeToken (token: string): string {
  return token.toLowerCase()
}

/**
 * Build the `WHERE` clause that uniquely identifies a note by its composite
 * primary key. Notes are scoped per wallet and chain, so a commitment alone is
 * not unique across chains.
 * @param identity - Wallet, chain, and commitment identifying the note.
 * @returns Drizzle condition matching the single note row.
 */
function noteIdentityWhere (identity: NoteIdentity) {
  return and(
    eq(notes.walletId, identity.walletId),
    eq(notes.chainId, identity.chainId),
    eq(notes.commitment, identity.commitment)
  )
}

/**
 * Build the `WHERE` clause that identifies a note by its chain-scoped nullifier
 * and tree position. The same nullifier/tree pair can recur across chains, so
 * `chainId` is required to disambiguate.
 * @param identity - Chain, nullifier, and tree number identifying the note.
 * @returns Drizzle condition matching the single note row.
 */
function noteNullifierIdentityWhere (identity: NoteNullifierIdentity) {
  return and(
    eq(notes.chainId, identity.chainId),
    eq(notes.nullifier, identity.nullifier),
    eq(notes.treeNumber, identity.treeNumber)
  )
}

/**
 * Encode a string exactly as it appears inside the msgpack `poisPerList` blob.
 * @param value - String key or status value to search for.
 * @returns Msgpack-encoded string bytes.
 */
function msgpackString (value: string): Uint8Array {
  return Uint8Array.from(encode(value))
}

/**
 * Build a coarse SQL predicate for rows that may need a PPOI refresh.
 * SQLite cannot express exact key/value checks inside the msgpack blob, so this
 * predicate selects a cheap superset: pending rows, rows containing a known
 * non-Valid status marker, or rows missing any required list key token.
 * @param requiredListKeys - PPOI list keys that must all be `Valid`.
 * @returns SQL predicate selecting possible refresh candidates.
 */
function poiRefreshCandidateWhere (requiredListKeys: readonly string[]) {
  const predicates = [isNull(notes.poisPerList)]

  if (requiredListKeys.length > 0) {
    predicates.push(
      ...POI_STATUS_NON_VALID_MARKERS.map((status) => (
        sql`instr(${notes.poisPerList}, ${msgpackString(status)}) > 0`
      )),
      ...requiredListKeys.map((key) => (
        sql`instr(${notes.poisPerList}, ${msgpackString(key)}) = 0`
      ))
    )
  }

  return or(...predicates)
}

/**
 * Decide whether a decoded note row needs an exact PPOI refresh.
 * @param note - Stored note row.
 * @param requiredListKeys - PPOI list keys that must all be `Valid`.
 * @returns True when status is absent or any required list is not `Valid`.
 */
function shouldRefreshPoiStatus (
  note: Pick<DBNote, 'poisPerList'>,
  requiredListKeys: readonly string[]
): boolean {
  if (note.poisPerList == null) {
    return true
  }
  if (requiredListKeys.length === 0) {
    return false
  }

  const poisPerList = note.poisPerList as Record<string, string | undefined>
  return requiredListKeys.some((key) => poisPerList[key] !== POI_STATUS_VALID)
}

/**
 * Insert a new wallet record and return its ID.
 * @param db - Wallet database instance.
 * @param wallet - Data for the new wallet.
 * @returns The `id` of the created wallet.
 */
async function createWallet (db: WalletDB, wallet: DBNewWallet): Promise<string> {
  db.insert(wallets).values(wallet).run()
  return wallet.id
}

/**
 * Retrieve a wallet record by its ID.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet to fetch.
 * @returns The wallet record or `undefined` if not found.
 */
async function getWallet (db: WalletDB, walletId: string) {
  return db.select().from(wallets).where(eq(wallets.id, walletId)).get()
}

/**
 * List all wallet records in the database.
 * @param db - Wallet database instance.
 * @returns An array of wallet records.
 */
async function listWallets (db: WalletDB) {
  return db.select().from(wallets).all()
}

/**
 * Delete a wallet by ID, wrapped in a transaction.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet to delete.
 * @returns Number of rows deleted (should be 0 or 1).
 */
async function deleteWallet (db: WalletDB, walletId: string): Promise<number> {
  return db.transaction((tx) => {
    const result = tx.delete(wallets).where(eq(wallets.id, walletId)).run()
    return result.changes
  })
}

/**
 * Insert a note into the database ignoring conflicts.
 * @param db - Wallet database instance.
 * @param note - Note data to insert.
 */
async function insertNote (db: WalletDB, note: DBNewNote): Promise<void> {
  db.insert(notes)
    .values({ ...note, token: normalizeToken(note.token) })
    .onConflictDoNothing({
      target: [notes.walletId, notes.chainId, notes.commitment],
    })
    .run()
}

/**
 * Batch-insert notes, ignoring conflicts.
 * @param db - Wallet database instance.
 * @param noteList - Array of notes to insert.
 * @returns Number of rows inserted or updated.
 */
async function insertNotesBatch (db: WalletDB, noteList: DBNewNote[]): Promise<number> {
  if (noteList.length === 0) return 0

  const normalizedNotes = noteList.map((note) => ({
    ...note,
    token: normalizeToken(note.token),
  }))

  return db.transaction((tx) => {
    const result = tx
      .insert(notes)
      .values(normalizedNotes)
      .onConflictDoUpdate({
        target: [notes.walletId, notes.chainId, notes.commitment],
        set: {
          outputType: sql`coalesce(${notes.outputType}, excluded.output_type)`,
          npk: sql`coalesce(${notes.npk}, excluded.npk)`,
          random: sql`coalesce(${notes.random}, excluded.random)`,
          blindedCommitment: sql`coalesce(${notes.blindedCommitment}, excluded.blinded_commitment)`,
          creationRailgunTxid: sql`coalesce(${notes.creationRailgunTxid}, excluded.creation_railgun_txid)`,
          creationTxid: sql`coalesce(${notes.creationTxid}, excluded.creation_txid)`,
        },
        where: sql`
          (${notes.outputType} IS NULL AND excluded.output_type IS NOT NULL) OR
          (${notes.npk} IS NULL AND excluded.npk IS NOT NULL) OR
          (${notes.random} IS NULL AND excluded.random IS NOT NULL) OR
          (${notes.blindedCommitment} IS NULL AND excluded.blinded_commitment IS NOT NULL) OR
          (${notes.creationRailgunTxid} IS NULL AND excluded.creation_railgun_txid IS NOT NULL) OR
          (${notes.creationTxid} IS NULL AND excluded.creation_txid IS NOT NULL)
        `,
      })
      .run()

    return result.changes
  })
}

/**
 * Retrieve all unspent notes for a wallet/chain pair.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @returns - All the unspent notes for given walletID on the given chain.
 */
async function getUnspentNotes (db: WalletDB, walletId: string, chainId: number) {
  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.walletId, walletId),
        eq(notes.chainId, chainId),
        eq(notes.spent, false)
      )
    )
    .all()
}

/**
 * Retrieve unspent notes filtered by token for a wallet/chain pair.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @param token - Token identifier to filter by.
 * @returns - Unspent notes for the wallet/chain/token.
 */
async function getUnspentNotesByToken (
  db: WalletDB,
  walletId: string,
  chainId: number,
  token: string
) {
  return db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.walletId, walletId),
        eq(notes.chainId, chainId),
        eq(notes.token, normalizeToken(token)),
        eq(notes.spent, false)
      )
    )
    .all()
}

/**
 * Fetch a note by its wallet/chain/commitment identity.
 * @param db - Wallet database instance.
 * @param identity - Wallet, chain, and commitment to search for.
 * @returns The note record or `undefined`.
 */
async function getNoteByCommitment (db: WalletDB, identity: NoteIdentity) {
  return db.select().from(notes).where(noteIdentityWhere(identity)).get()
}

/**
 * Fetch a note by its chain/nullifier/tree identity.
 * @param db - Wallet database instance.
 * @param identity - Chain, nullifier, and tree number to search for.
 * @returns The note record or `undefined`.
 */
async function getNoteByNullifier (db: WalletDB, identity: NoteNullifierIdentity) {
  return db.select().from(notes).where(noteNullifierIdentityWhere(identity)).get()
}

/**
 * Mark a note as spent and record the transaction ID that spent it.
 * Synchronous core shared by the public function and the batch variant.
 * @param db - Wallet database instance.
 * @param identity - Wallet, chain, and commitment of the note to update.
 * @param spentTxid - Transaction ID that spent the note.
 * @returns Number of rows updated.
 */
function markNoteSpentSync (
  db: DBContext,
  identity: NoteIdentity,
  spentTxid: Uint8Array
): number {
  const result = db.update(notes)
    .set({ spent: true, spentTxid })
    .where(noteIdentityWhere(identity))
    .run()

  return result.changes
}

/**
 * Mark a note as spent and record the transaction ID that spent it.
 * @param db - Wallet database instance.
 * @param identity - Wallet, chain, and commitment of the note to update.
 * @param spentTxid - Transaction ID that spent the note.
 * @returns Number of rows updated.
 */
async function markNoteSpent (
  db: WalletDB,
  identity: NoteIdentity,
  spentTxid: Uint8Array
): Promise<number> {
  return markNoteSpentSync(db, identity, spentTxid)
}

/**
 * Mark multiple notes as spent in a single transaction.
 * @param db - Wallet database instance.
 * @param identities - Array of wallet/chain/commitment note identities to update.
 * @param spentTxid - Transaction ID that spent the notes.
 * @returns Number of rows updated.
 */
async function markNotesSpentBatch (
  db: WalletDB,
  identities: NoteIdentity[],
  spentTxid: Uint8Array
): Promise<number> {
  if (identities.length === 0) return 0

  return db.transaction((tx) => {
    let updated = 0
    for (const identity of identities) {
      updated += markNoteSpentSync(tx, identity, spentTxid)
    }
    return updated
  })
}

/**
 * Return all notes belonging to a wallet on a given chain.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @returns Array of note records.
 */
async function getAllNotes (db: WalletDB, walletId: string, chainId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.walletId, walletId), eq(notes.chainId, chainId)))
    .all()
}

/**
 * Return notes whose persisted PPOI status needs another refresh.
 *
 * The SQL predicate is a cheap msgpack-byte prefilter for rows that are pending,
 * contain a known non-Valid PPOI status, or are missing a required list key.
 * Because `poisPerList` is msgpack-encoded, the final required-list check is
 * refined after decoding so callers receive only notes with no status or at
 * least one required list whose status is not `Valid`.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @param requiredListKeys - PPOI list keys that must all be `Valid`.
 * @returns Notes with no PPOI status or a non-Valid required-list status.
 */
async function getNotesNeedingPoiRefresh (
  db: WalletDB,
  walletId: string,
  chainId: number,
  requiredListKeys: readonly string[] = []
) {
  const candidates = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.walletId, walletId),
        eq(notes.chainId, chainId),
        poiRefreshCandidateWhere(requiredListKeys)
      )
    )
    .all()

  return candidates.filter((note) => shouldRefreshPoiStatus(note, requiredListKeys))
}

/**
 * Persist a note's blinded commitment and PPOI status together.
 * Synchronous core shared by the public function and the batch variant.
 * @param db - Wallet database instance.
 * @param identity - Wallet, chain, and commitment of the note to update.
 * @param blindedCommitment - Derived PPOI lookup key.
 * @param poisPerList - PPOI statuses by list key, or null to leave status pending.
 * @returns Number of rows updated.
 */
function updateNotePoiStatusSync (
  db: DBContext,
  identity: NoteIdentity,
  blindedCommitment: Uint8Array,
  poisPerList: Record<string, string> | null
): number {
  const result = db
    .update(notes)
    .set({ blindedCommitment, poisPerList })
    .where(noteIdentityWhere(identity))
    .run()

  return result.changes
}

/**
 * Persist a note's blinded commitment and PPOI status together.
 * @param db - Wallet database instance.
 * @param identity - Wallet, chain, and commitment of the note to update.
 * @param blindedCommitment - Derived PPOI lookup key.
 * @param poisPerList - PPOI statuses by list key, or null to leave status pending.
 * @returns Number of rows updated.
 */
async function updateNotePoiStatus (
  db: WalletDB,
  identity: NoteIdentity,
  blindedCommitment: Uint8Array,
  poisPerList: Record<string, string> | null
): Promise<number> {
  return updateNotePoiStatusSync(db, identity, blindedCommitment, poisPerList)
}

/**
 * Persist PPOI status updates for multiple notes in one transaction.
 * @param db - Wallet database instance.
 * @param updates - Note PPOI updates.
 * @returns Number of rows updated.
 */
async function updateNotePoiStatusBatch (
  db: WalletDB,
  updates: NotePoiStatusUpdate[]
): Promise<number> {
  if (updates.length === 0) return 0

  return db.transaction((tx) => {
    let updated = 0
    for (const update of updates) {
      updated += updateNotePoiStatusSync(
        tx,
        update,
        update.blindedCommitment,
        update.poisPerList
      )
    }
    return updated
  })
}

/**
 * Retrieve the scan state for a wallet on a particular chain.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @returns - Scan state for given chain for given wallet.
 */
async function getScanState (db: WalletDB, walletId: string, chainId: number) {
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
async function updateScanState (
  db: WalletDB,
  walletId: string,
  chainId: number,
  lastScannedBlock: bigint
): Promise<void> {
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
async function insertTxHistory (db: WalletDB, tx: DBNewTxHistory): Promise<void> {
  db.insert(txHistory).values(tx).onConflictDoNothing().run()
}

/**
 * Batch insert transaction history entries.
 * @param db - Wallet database instance.
 * @param txs - Array of transaction history records.
 * @returns Number of rows inserted.
 */
async function insertTxHistoryBatch (db: WalletDB, txs: DBNewTxHistory[]): Promise<number> {
  if (txs.length === 0) return 0

  return db.transaction((tx) => {
    const result = tx
      .insert(txHistory)
      .values(txs)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
}

/**
 * Retrieve recent transaction history for a wallet on a given chain.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @param chainId - Chain identifier.
 * @param limit - Maximum number of records to return (default 100).
 * @returns - Transaction history rows ordered by block desc.
 */
async function getTxHistory (
  db: WalletDB,
  walletId: string,
  chainId: number,
  limit: number = 100
) {
  return db
    .select()
    .from(txHistory)
    .where(and(eq(txHistory.walletId, walletId), eq(txHistory.chainId, chainId)))
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
async function getTxById (db: WalletDB, txId: string) {
  return db.select().from(txHistory).where(eq(txHistory.id, txId)).get()
}

/**
 * Compute basic statistics about a wallet database, such as note count.
 * @param db - Wallet database instance.
 * @param walletId - Identifier of the wallet.
 * @returns - Get walletDB statistics like total notes, unspent note count, tx history count ...
 */
async function getWalletDBStats (db: WalletDB, walletId: string) {
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

  const txHistoryCount = db
    .select({ count: sql<number>`count(*)` })
    .from(txHistory)
    .where(eq(txHistory.walletId, walletId))
    .get()

  return {
    notes: notesCount?.count ?? 0,
    unspentNotes: unspentNotesCount?.count ?? 0,
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
  getNotesNeedingPoiRefresh,
  updateNotePoiStatus,
  updateNotePoiStatusBatch,
  getScanState,
  updateScanState,
  insertTxHistory,
  insertTxHistoryBatch,
  getTxHistory,
  getTxById,
  getWalletDBStats
}
export type { NoteIdentity, NoteNullifierIdentity, NotePoiStatusUpdate }
