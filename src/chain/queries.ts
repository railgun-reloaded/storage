import { and, asc, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'

import type { ChainDB } from './db.js'
import type {
  DBNewCommitment,
  DBNewMerkleTree,
  DBNewNullifier,
  DBNewRailgunTransaction,
  DBNewSnapshotCheckpoint,
  DBNewUnshield,
  SnapshotCheckpointTree
} from './schema.js'
import {
  commitments,
  merkleTrees,
  nullifiers,
  railgunTransactions,
  snapshotCheckpoints,
  syncState,
  unshields,
} from './schema.js'

type DBContext = ChainDB | SQLiteTransaction<any, any, any, any>

/**
 * Atomic unit of chain data produced by one scan batch. All members are
 * persisted in a single transaction by `insertScanBatch`.
 */
type ScanBatch = {
  chainID: number
  blockNumber: bigint
  nullifiers?: DBNewNullifier[]
  commitments?: DBNewCommitment[]
  unshields?: DBNewUnshield[]
  railgunTransactions?: DBNewRailgunTransaction[]
  merkleTrees?: DBNewMerkleTree[]
}

/**
 * Insert new entry or update existing entry in the table by overriding it
 * @param db - Input database instance
 * @param table - Target table name to upsert at
 * @param target - Target primary key of the table to upsert at
 * @param values - Input values to insert/update in the table
 * @returns - Number of total changed entries in the table
 */
function upsertRow<T extends Record<string, unknown>> (
  db: DBContext,
  table: any,
  target: any,
  values: T | T[]
) {
  const columns = getTableColumns(table)

  const firstValue = Array.isArray(values) ? values[0] : values
  if (firstValue === undefined) {
    throw new Error('Cannot upsert empty values')
  }

  const set = Object.fromEntries(
    Object.entries(columns)
      .filter(([key]) => Object.hasOwn(firstValue, key))
      .map(([key, col]) => [
        key,
        sql.raw(`excluded."${(col as any).name}"`),
      ])
  )

  return db.insert(table)
    .values(values)
    .onConflictDoUpdate({ target, set }).run()
}

// Nullifiers
/**
 * Determine whether a given nullifier exists in the table.
 * @param db - Chain database instance.
 * @param nullifier - The nullifier value to look up.
 * @param treeNumber - Tree Number of nullifier
 * @returns `true` if the nullifier is present, otherwise `false`.
 */
async function nullifierExists (db: ChainDB, nullifier: Uint8Array, treeNumber: number): Promise<boolean> {
  const result = db
    .select()
    .from(nullifiers)
    .where(and(
      eq(nullifiers.nullifier, nullifier),
      eq(nullifiers.treeNumber, treeNumber)
    ))
    .get()
  return result !== undefined
}

/**
 * Insert a batch of nullifiers, updating existing records if necessary.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param nullifierBatch - Array of nullifiers to insert.
 * @returns The number of rows changed.
 */
function insertNullifiersBatchSync (db: DBContext, nullifierBatch: DBNewNullifier[]): number {
  if (nullifierBatch.length === 0) return 0
  const { changes } = upsertRow<DBNewNullifier>(db, nullifiers, [nullifiers.nullifier, nullifiers.treeNumber], nullifierBatch)
  return changes
}

/**
 * Insert a batch of nullifiers, updating existing records if necessary.
 * @param db - Chain database instance.
 * @param nullifierBatch - Array of nullifiers to insert.
 * @returns The number of rows changed.
 */
async function insertNullifiersBatch (db: ChainDB, nullifierBatch: DBNewNullifier[]): Promise<number> {
  return insertNullifiersBatchSync(db, nullifierBatch)
}

/**
 * Retrieve nullifiers whose block numbers fall within a specified range.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @param toBlock - Ending block height (inclusive).
 * @returns Array of nullifiers sorted by block number.
 */
async function getNullifiersByBlockRange (
  db: ChainDB,
  fromBlock: bigint,
  toBlock: bigint
) {
  return db
    .select()
    .from(nullifiers)
    .where(
      and(
        gte(nullifiers.blockNumber, fromBlock),
        lte(nullifiers.blockNumber, toBlock)
      )
    )
    .orderBy(asc(nullifiers.blockNumber))
    .all()
}

/**
 * Remove nullifiers at or after a given block number. Used during chain
 * reorg to discard invalidated data.
 * @param db - Chain database instance.
 * @param fromBlock - Block number from which to delete (inclusive).
 * @returns Number of rows deleted.
 */
async function deleteNullifiersFromBlock (db: ChainDB, fromBlock: bigint): Promise<number> {
  const { changes } = db
    .delete(nullifiers)
    .where(gte(nullifiers.blockNumber, fromBlock))
    .run()
  return changes
}

/**
 * Retrieve all nullifiers from the database.
 * @param db - Chain database instance.
 * @returns Array of all nullifier records sorted by block number.
 */
async function getAllNullifiers (db: ChainDB) {
  return db
    .select()
    .from(nullifiers)
    .orderBy(asc(nullifiers.blockNumber))
    .all()
}

/**
 * Retrieve nullifiers at or after a given block number.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @returns Array of nullifier records sorted by block number.
 */
async function getNullifiersFromBlock (db: ChainDB, fromBlock: bigint) {
  return db
    .select()
    .from(nullifiers)
    .where(gte(nullifiers.blockNumber, fromBlock))
    .orderBy(asc(nullifiers.blockNumber))
    .all()
}

// Commitments

/**
 * Insert or update a batch of commitments in the table.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param commitmentBatch - Array of commitment records to upsert.
 * @returns Number of rows changed.
 */
function insertCommitmentBatchSync (db: DBContext, commitmentBatch: DBNewCommitment[]): number {
  if (commitmentBatch.length === 0) return 0
  const { changes } = upsertRow(db, commitments, commitments.hash, commitmentBatch)
  return changes
}

/**
 * Insert or update a batch of commitments in the table.
 * @param db - Chain database instance.
 * @param commitmentBatch - Array of commitment records to upsert.
 * @returns Number of rows changed.
 */
async function insertCommitmentBatch (db: ChainDB, commitmentBatch: DBNewCommitment[]): Promise<number> {
  return insertCommitmentBatchSync(db, commitmentBatch)
}

/**
 * Get commitments within a specific leaf range of a Merkle tree.
 * @param db - Chain database instance.
 * @param treeNumber - Tree identifier.
 * @param startLeafIndex - Starting leaf index (inclusive).
 * @param endLeafIndex - Ending leaf index (inclusive).
 * @returns Array of commitments ordered by leaf index.
 */
async function getCommitmentsByLeafRange (
  db: ChainDB,
  treeNumber: number,
  startLeafIndex: number,
  endLeafIndex:number
) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.treeNumber, treeNumber),
        gte(commitments.treePosition, startLeafIndex),
        lte(commitments.treePosition, endLeafIndex)
      )
    )
    .orderBy(asc(commitments.treePosition))
    .all()
}

/**
 * Retrieve commitments whose block numbers fall within a given range,
 * sorted in ascending order.
 * @param db - Chain database instance.
 * @param fromBlock - Start block height (inclusive).
 * @param toBlock - End block height (inclusive).
 * @returns Array of commitments sorted by block number.
 */
async function getCommitmentsByBlockRange (
  db: ChainDB,
  fromBlock: bigint,
  toBlock: bigint
) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        gte(commitments.blockNumber, fromBlock),
        lte(commitments.blockNumber, toBlock)
      )
    )
    .orderBy(asc(commitments.blockNumber))
    .all()
}

/**
 * Delete commitments from a given block height onwards, useful for
 * handling reorgs.
 * @param db - Chain database instance.
 * @param fromBlock - Block height from which to start deletion (inclusive).
 * @returns Number of rows deleted.
 */
async function deleteCommitmentsFromBlock (db: ChainDB, fromBlock: bigint): Promise<number> {
  const { changes } = db
    .delete(commitments)
    .where(gte(commitments.blockNumber, fromBlock))
    .run()
  return changes
}

/**
 * Fetch the Merkle tree leaf data for a given tree number.
 * @param db - Chain database instance.
 * @param treeNumber - Identifier of the Merkle tree.
 * @returns The leaf data (as a Uint8Array) for the specified tree.
 */
async function getMerkleTree (db: ChainDB, treeNumber: number) {
  return db
    .select()
    .from(merkleTrees)
    .where(eq(merkleTrees.treeNumber, treeNumber))
    .get()
}

/**
 * Fetch all Merkle trees from the database, ordered by tree number.
 * @param db - Chain database instance.
 * @returns Array of all Merkle tree records sorted by tree number.
 */
async function getAllMerkleTrees (db: ChainDB) {
  return db
    .select()
    .from(merkleTrees)
    .orderBy(asc(merkleTrees.treeNumber))
    .all()
}

/**
 * Insert or update a Merkle tree record.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param tree - Merkle tree data to persist.
 * @returns Number of rows affected (should always be 1).
 */
function setMerkleTreeSync (db: DBContext, tree: DBNewMerkleTree): number {
  const { changes } = upsertRow(db, merkleTrees, merkleTrees.treeNumber, tree)
  return changes
}

/**
 * Insert or update a Merkle tree record.
 * @param db - Chain database instance.
 * @param tree - Merkle tree data to persist.
 * @returns Number of rows affected (should always be 1).
 */
async function setMerkleTree (db: ChainDB, tree: DBNewMerkleTree): Promise<number> {
  return setMerkleTreeSync(db, tree)
}

/**
 * Retrieve the synchronization state for a specific chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @returns Sync state containing the last synced block height.
 */
async function getSyncState (db: ChainDB, chainID: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
}

/**
 * Update the synchronization state for a chain.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param chainID - Identifier of the chain.
 * @param lastBlockHeight - Last synced block height for the chain.
 * @returns Number of rows affected (should be 1).
 */
function updateSyncStateSync (
  db: DBContext,
  chainID: number,
  lastBlockHeight: bigint
): number {
  const { changes } = upsertRow(db, syncState, syncState.chainID, { chainID, lastBlockHeight })
  return changes
}

/**
 * Update the synchronization state for a chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @param lastBlockHeight - Last synced block height for the chain.
 * @returns Number of rows affected (should be 1).
 */
async function updateSyncState (
  db: ChainDB,
  chainID: number,
  lastBlockHeight: bigint
): Promise<number> {
  return updateSyncStateSync(db, chainID, lastBlockHeight)
}

/**
 * Read the validated snapshot checkpoint promoted with a chain database.
 * @param db - Chain database instance.
 * @param chainID - Chain identifier.
 * @returns Validated checkpoint row, when one exists.
 */
async function getSnapshotCheckpoint (db: ChainDB, chainID: number) {
  return db
    .select()
    .from(snapshotCheckpoints)
    .where(eq(snapshotCheckpoints.chainID, chainID))
    .get()
}

/**
 * Record a validated checkpoint in the staged chain database. The checkpoint
 * and scan cursor are checked in one transaction so a database cannot be
 * promoted with a checkpoint that claims coverage beyond its persisted state.
 * @param db - Staged chain database.
 * @param checkpoint - Validated checkpoint metadata.
 * @param checkpoint.chainID - Chain identifier.
 * @param checkpoint.cid - Content identifier of the validated artifact.
 * @param checkpoint.blockHeight - Exact validated snapshot end height.
 * @param checkpoint.trees - Validated commitment-tree states.
 * @param checkpoint.validatedAt - Optional validation timestamp in milliseconds.
 */
async function recordSnapshotCheckpoint (
  db: ChainDB,
  checkpoint: {
    chainID: number
    cid: string
    blockHeight: bigint
    trees: SnapshotCheckpointTree[]
    validatedAt?: number
  }
): Promise<void> {
  db.transaction((tx) => {
    const state = tx
      .select()
      .from(syncState)
      .where(eq(syncState.chainID, checkpoint.chainID))
      .get()

    if (state?.lastBlockHeight !== checkpoint.blockHeight) {
      throw new Error(
        `Cannot record snapshot checkpoint at ${checkpoint.blockHeight}: ` +
        `persisted sync cursor is ${state?.lastBlockHeight ?? 'missing'}`
      )
    }

    const row: DBNewSnapshotCheckpoint = {
      chainID: checkpoint.chainID,
      cid: checkpoint.cid,
      blockHeight: checkpoint.blockHeight,
      trees: checkpoint.trees,
      validatedAt: checkpoint.validatedAt ?? Date.now()
    }
    upsertRow(tx, snapshotCheckpoints, snapshotCheckpoints.chainID, row)
  })
}

/**
 * Read the independent Railgun TXID sync cursor for a chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @returns Last block height whose Railgun TXID rows were persisted.
 */
async function getTxidSyncCursor (db: ChainDB, chainID: number): Promise<bigint> {
  return (await getSyncState(db, chainID))?.lastTxidSyncBlockHeight ?? 0n
}

/**
 * Update the independent Railgun TXID sync cursor for a chain without
 * changing the regular commitment sync cursor.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param chainID - Identifier of the chain.
 * @param blockHeight - Last PPOI-complete block persisted for TXID state.
 * @returns Number of rows affected.
 */
function setTxidSyncCursorSync (
  db: DBContext,
  chainID: number,
  blockHeight: bigint
): number {
  const existing = db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
  const { changes } = upsertRow(db, syncState, syncState.chainID, {
    chainID,
    lastBlockHeight: existing?.lastBlockHeight ?? 0n,
    lastTxidSyncBlockHeight: blockHeight
  })
  return changes
}

/**
 * Update the independent Railgun TXID sync cursor for a chain without
 * changing the regular commitment sync cursor.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @param blockHeight - Last PPOI-complete block persisted for TXID state.
 * @returns Number of rows affected.
 */
async function setTxidSyncCursor (
  db: ChainDB,
  chainID: number,
  blockHeight: bigint
): Promise<number> {
  return setTxidSyncCursorSync(db, chainID, blockHeight)
}

/**
 * Insert Railgun transactions, ignoring already-seen Railgun TXIDs.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param rows - Railgun transaction rows to insert.
 * @returns Number of inserted rows.
 */
function insertRailgunTransactionsSync (
  db: DBContext,
  rows: DBNewRailgunTransaction[]
): number {
  if (rows.length === 0) return 0
  const { changes } = db
    .insert(railgunTransactions)
    .values(rows)
    .onConflictDoNothing({ target: railgunTransactions.railgunTxid })
    .run()
  return changes
}

/**
 * Insert Railgun transactions, ignoring already-seen Railgun TXIDs.
 * @param db - Chain database instance.
 * @param rows - Railgun transaction rows to insert.
 * @returns Number of inserted rows.
 */
async function insertRailgunTransactions (
  db: ChainDB,
  rows: DBNewRailgunTransaction[]
): Promise<number> {
  return insertRailgunTransactionsSync(db, rows)
}

/**
 * Fetch one Railgun transaction by its canonical Railgun TXID.
 * @param db - Chain database instance.
 * @param railgunTxid - Canonical Railgun transaction ID.
 * @returns Matching transaction row, when present.
 */
async function getRailgunTransactionByTxid (
  db: ChainDB,
  railgunTxid: Uint8Array
) {
  return db
    .select()
    .from(railgunTransactions)
    .where(eq(railgunTransactions.railgunTxid, railgunTxid))
    .get()
}

/**
 * Fetch Railgun transactions by block range.
 * @param db - Chain database instance.
 * @param fromBlock - Start block height, inclusive.
 * @param toBlock - End block height, inclusive.
 * @returns Transactions ordered by block number.
 */
async function getRailgunTransactionsByBlockRange (
  db: ChainDB,
  fromBlock: bigint,
  toBlock: bigint
) {
  return db
    .select()
    .from(railgunTransactions)
    .where(
      and(
        gte(railgunTransactions.blockNumber, fromBlock),
        lte(railgunTransactions.blockNumber, toBlock)
      )
    )
    .orderBy(asc(railgunTransactions.blockNumber))
    .all()
}

/**
 * Fetch Railgun transactions whose output batch starts in a tree range.
 * @param db - Chain database instance.
 * @param utxoTreeOut - Output UTXO tree number.
 * @param startPosition - Inclusive output start position.
 * @param endPosition - Inclusive output end position.
 * @returns Transactions ordered by output batch start position.
 */
async function getRailgunTransactionsByTreeRange (
  db: ChainDB,
  utxoTreeOut: number,
  startPosition: number,
  endPosition: number
) {
  return db
    .select()
    .from(railgunTransactions)
    .where(
      and(
        eq(railgunTransactions.utxoTreeOut, utxoTreeOut),
        gte(railgunTransactions.utxoBatchStartPositionOut, startPosition),
        lte(railgunTransactions.utxoBatchStartPositionOut, endPosition)
      )
    )
    .orderBy(asc(railgunTransactions.utxoBatchStartPositionOut))
    .all()
}

/**
 * Insert or update a batch of unshield events.
 * Synchronous core shared by the public function and `insertScanBatch`.
 * @param db - Chain database or transaction context.
 * @param unshieldsBatch - Array of unshield records to upsert.
 * @returns Number of rows changed.
 */
function insertUnshieldBatchSync (db: DBContext, unshieldsBatch: DBNewUnshield[]): number {
  if (unshieldsBatch.length === 0) return 0
  const { changes } = upsertRow(db, unshields, [unshields.transactionHash, unshields.eventLogIndex], unshieldsBatch)
  return changes
}

/**
 * Insert or update a batch of unshield events.
 * @param db - Chain database instance.
 * @param unshieldsBatch - Array of unshield records to upsert.
 * @returns Number of rows changed.
 */
async function insertUnshieldBatch (db: ChainDB, unshieldsBatch: DBNewUnshield[]): Promise<number> {
  return insertUnshieldBatchSync(db, unshieldsBatch)
}

/**
 * Retrieve unshield records within a block range, sorted ascending by
 * block number.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @param toBlock - Ending block height (inclusive).
 * @returns Array of unshield records sorted by block number.
 */
async function getUnshieldsByBlockRange (
  db: ChainDB,
  fromBlock: bigint,
  toBlock: bigint
) {
  return db
    .select()
    .from(unshields)
    .where(
      and(
        gte(unshields.blockNumber, fromBlock),
        lte(unshields.blockNumber, toBlock)
      )
    )
    .orderBy(asc(unshields.blockNumber))
    .all()
}

/**
 * Find the Railgun transaction whose output batch contains a given commitment
 * at (treeNumber, treePosition). Returns the row whose
 * `utxoBatchStartPositionOut <= treePosition < utxoBatchStartPositionOut + commitments.length`,
 * or `undefined` if no Railgun transaction in storage covers that slot
 * (e.g. RPC-only data sources that don't populate `railgun_transactions`).
 *
 * Walks candidates ordered by descending start position so we hit the
 * matching row on the first iteration in the typical case.
 * @param db - Chain database instance.
 * @param treeNumber - Output UTXO tree.
 * @param treePosition - Position of the commitment within that tree.
 * @returns The row that produced the commitment, or `undefined`.
 */
async function findRailgunTransactionForLeaf (
  db: ChainDB,
  treeNumber: number,
  treePosition: number
) {
  const candidates = db
    .select()
    .from(railgunTransactions)
    .where(
      and(
        eq(railgunTransactions.utxoTreeOut, treeNumber),
        lte(railgunTransactions.utxoBatchStartPositionOut, treePosition)
      )
    )
    .orderBy(desc(railgunTransactions.utxoBatchStartPositionOut))
    .all()

  for (const row of candidates) {
    const batchCommitments = row.commitments as unknown as Uint8Array[]
    const start = row.utxoBatchStartPositionOut
    if (treePosition < start + batchCommitments.length) {
      return row
    }
  }
  return undefined
}

/**
 * Persist one scan batch atomically: nullifiers, commitments, unshields,
 * Railgun transactions, serialized Merkle trees, and the sync cursors are
 * written in a single transaction. The Railgun TXID cursor advances only
 * when at least one new Railgun transaction row was inserted.
 * @param db - Chain database instance.
 * @param batch - Scan batch to persist.
 */
async function insertScanBatch (db: ChainDB, batch: ScanBatch): Promise<void> {
  db.transaction((tx) => {
    if (batch.nullifiers && batch.nullifiers.length > 0) {
      insertNullifiersBatchSync(tx, batch.nullifiers)
    }
    if (batch.commitments && batch.commitments.length > 0) {
      insertCommitmentBatchSync(tx, batch.commitments)
    }
    if (batch.unshields && batch.unshields.length > 0) {
      insertUnshieldBatchSync(tx, batch.unshields)
    }
    if (batch.railgunTransactions && batch.railgunTransactions.length > 0) {
      const inserted = insertRailgunTransactionsSync(tx, batch.railgunTransactions)
      if (inserted > 0) {
        setTxidSyncCursorSync(tx, batch.chainID, batch.blockNumber)
      }
    }

    updateSyncStateSync(tx, batch.chainID, batch.blockNumber)

    for (const tree of batch.merkleTrees ?? []) {
      setMerkleTreeSync(tx, tree)
    }
  })
}

export {
  nullifierExists,
  insertNullifiersBatch,
  getNullifiersByBlockRange,
  deleteNullifiersFromBlock,
  getAllNullifiers,
  getNullifiersFromBlock,
  insertCommitmentBatch,
  getCommitmentsByLeafRange,
  getCommitmentsByBlockRange,
  deleteCommitmentsFromBlock,
  getMerkleTree,
  getAllMerkleTrees,
  setMerkleTree,
  getSyncState,
  updateSyncState,
  getSnapshotCheckpoint,
  recordSnapshotCheckpoint,
  getTxidSyncCursor,
  setTxidSyncCursor,
  insertRailgunTransactions,
  getRailgunTransactionByTxid,
  getRailgunTransactionsByBlockRange,
  getRailgunTransactionsByTreeRange,
  findRailgunTransactionForLeaf,
  insertUnshieldBatch,
  getUnshieldsByBlockRange,
  insertScanBatch
}
export type { ScanBatch }
