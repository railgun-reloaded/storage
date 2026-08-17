import type {
  DBNewNote,
  DBNewTxHistory,
  DBNewWallet,
  DBNote,
  DBScanState,
  DBTxHistory,
  DBWallet,
} from '../wallet/schema.js'

import type {
  NoteIdentity,
  NoteNullifierIdentity,
  NotePoiStatusUpdate,
  WalletDBStats,
} from './types.js'

/**
 * Wallet-specific storage operations.
 */
type WalletStorage = {
  /**
   * Insert a new wallet record, leaving any existing row for the same id
   * untouched.
   * @param wallet - Data for the new wallet.
   * @returns True when a row was inserted, false when the id already existed.
   */
  createWallet (wallet: DBNewWallet): Promise<boolean>

  /**
   * Retrieve a wallet by its ID.
   * @param walletId - Identifier of the wallet to fetch.
   * @returns The wallet record, or `undefined` when absent.
   */
  getWallet (walletId: string): Promise<DBWallet | undefined>

  /**
   * List all wallet records.
   * @returns An array of wallet records.
   */
  listWallets (): Promise<DBWallet[]>

  /**
   * Delete a wallet by ID, cascading to its dependent rows.
   * @param walletId - Identifier of the wallet to delete.
   * @returns Normalized count of deleted wallet rows (`0` or `1`).
   */
  deleteWallet (walletId: string): Promise<number>

  /**
   * Insert a note, normalizing its token and ignoring conflicts on an existing
   * note identity.
   * @param note - Note data to insert.
   */
  insertNote (note: DBNewNote): Promise<void>

  /**
   * Batch-insert notes, normalizing tokens and enriching existing rows with
   * previously-null optional fields on conflict. An empty batch is a no-op and
   * returns `0`.
   * @param noteList - Array of notes to insert.
   * @returns Normalized count of affected rows.
   */
  insertNotesBatch (noteList: DBNewNote[]): Promise<number>

  /**
   * Retrieve all unspent notes for a wallet/chain pair.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @returns Unspent notes for the wallet on the chain.
   */
  getUnspentNotes (walletId: string, chainId: number): Promise<DBNote[]>

  /**
   * Retrieve unspent notes filtered by normalized token for a wallet/chain pair.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @param token - Token identifier to filter by, in any case.
   * @returns Unspent notes for the wallet/chain/token.
   */
  getUnspentNotesByToken (walletId: string, chainId: number, token: string): Promise<DBNote[]>

  /**
   * Fetch a note by its wallet/chain/commitment identity.
   * @param identity - Wallet, chain, and commitment to search for.
   * @returns The note record, or `undefined`.
   */
  getNoteByCommitment (identity: NoteIdentity): Promise<DBNote | undefined>

  /**
   * Fetch a note by its chain/nullifier/tree identity.
   * @param identity - Chain, nullifier, and tree number to search for.
   * @returns The note record, or `undefined`.
   */
  getNoteByNullifier (identity: NoteNullifierIdentity): Promise<DBNote | undefined>

  /**
   * Mark a note as spent and record its spending transaction provenance.
   * @param identity - Wallet, chain, and commitment of the note to update.
   * @param spentTxid - Transaction ID that spent the note.
   * @param spentBlockNumber - Block containing the spending transaction.
   * @param spentTimestamp - Timestamp of the spending block, or `null` when the
   * data source does not carry one for this transaction.
   * @returns Normalized count of updated rows.
   */
  markNoteSpent (
    identity: NoteIdentity,
    spentTxid: Uint8Array,
    spentBlockNumber: bigint,
    spentTimestamp: Date | null
  ): Promise<number>

  /**
   * Mark multiple notes as spent atomically. An empty list is a no-op and
   * returns `0`.
   * @param identities - Note identities to update.
   * @param spentTxid - Transaction ID that spent the notes.
   * @param spentBlockNumber - Block containing the spending transaction.
   * @param spentTimestamp - Timestamp of the spending block, or `null` when the
   * data source does not carry one for this transaction.
   * @returns Normalized count of updated rows.
   */
  markNotesSpentBatch (
    identities: NoteIdentity[],
    spentTxid: Uint8Array,
    spentBlockNumber: bigint,
    spentTimestamp: Date | null
  ): Promise<number>

  /**
   * Return all notes belonging to a wallet on a given chain.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @returns Note records for the wallet on the chain.
   */
  getAllNotes (walletId: string, chainId: number): Promise<DBNote[]>

  /**
   * Return received notes whose PPOI status needs refreshing: notes with no
   * persisted status, or with at least one required list whose status is not
   * `Valid`.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @param requiredListKeys - PPOI list keys that must all be `Valid`.
   * @returns Notes with no PPOI status or a non-Valid required-list status.
   */
  getNotesNeedingPoiRefresh (walletId: string, chainId: number, requiredListKeys?: readonly string[]): Promise<DBNote[]>

  /**
   * Persist a note's blinded commitment and PPOI status together.
   * @param identity - Wallet, chain, and commitment of the note to update.
   * @param blindedCommitment - Derived PPOI lookup key.
   * @param poisPerList - PPOI statuses by list key, or `null` to leave pending.
   * @returns Normalized count of updated rows.
   */
  updateNotePoiStatus (identity: NoteIdentity, blindedCommitment: Uint8Array, poisPerList: Record<string, string> | null): Promise<number>

  /**
   * Persist PPOI status updates for multiple notes atomically. An empty list is
   * a no-op and returns `0`.
   * @param updates - Note PPOI updates.
   * @returns Normalized count of updated rows.
   */
  updateNotePoiStatusBatch (updates: NotePoiStatusUpdate[]): Promise<number>

  /**
   * Retrieve the scan state for a wallet on a particular chain.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @returns The scan state, or `undefined` when absent.
   */
  getScanState (walletId: string, chainId: number): Promise<DBScanState | undefined>

  /**
   * Insert or update the scan state for a wallet/chain pair.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @param lastScannedBlock - Latest block height scanned.
   */
  updateScanState (walletId: string, chainId: number, lastScannedBlock: bigint): Promise<void>

  /**
   * Add a transaction history entry, ignoring duplicates.
   * @param tx - Transaction history record to insert.
   */
  insertTxHistory (tx: DBNewTxHistory): Promise<void>

  /**
   * Batch-insert transaction history entries, ignoring duplicates. An empty
   * batch is a no-op and returns `0`.
   * @param txs - Transaction history records.
   * @returns Normalized count of inserted rows.
   */
  insertTxHistoryBatch (txs: DBNewTxHistory[]): Promise<number>

  /**
   * Retrieve recent transaction history for a wallet on a chain, ordered
   * descending by block number.
   * @param walletId - Identifier of the wallet.
   * @param chainId - Chain identifier.
   * @param limit - Maximum number of rows to return. Omit for all of them.
   * @returns Transaction history rows ordered by block descending.
   */
  getTxHistory (walletId: string, chainId: number, limit?: number): Promise<DBTxHistory[]>

  /**
   * Fetch a transaction history entry by its ID.
   * @param txId - Transaction ID to look up.
   * @returns The history record, or `undefined`.
   */
  getTxById (txId: string): Promise<DBTxHistory | undefined>

  /**
   * Compute aggregate statistics for a wallet.
   * @param walletId - Identifier of the wallet.
   * @returns Total notes, unspent note count, and transaction count.
   */
  getWalletDBStats (walletId: string): Promise<WalletDBStats>
}

export type { WalletStorage }
