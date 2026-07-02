import { and, asc, desc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'

import { normalizeMutationCount } from '../core/batch.js'
import type { ChainDatabase } from '../core/database.js'
import type { ScanBatch } from '../core/types.js'

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

/**
 * Validated snapshot checkpoint metadata to persist for a chain.
 */
type SnapshotCheckpointInput = {
  chainID: number
  cid: string
  blockHeight: bigint
  trees: SnapshotCheckpointTree[]
  validatedAt?: number
}

/**
 * Insert new entry or update existing entry in the table by overriding it
 * @param db - Input database instance
 * @param table - Target table name to upsert at
 * @param target - Target primary key of the table to upsert at
 * @param values - Input values to insert/update in the table
 * @returns - Number of total changed entries in the table
 */
async function upsertRow<T extends Record<string, unknown>> (
  db: ChainDatabase,
  table: any,
  target: any,
  values: T | T[]
): Promise<number> {
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

  const result = await db.insert(table)
    .values(values)
    .onConflictDoUpdate({ target, set }).run()
  return normalizeMutationCount(result)
}

/**
 * Determine whether a given nullifier exists in the table.
 * @param db - Chain database instance.
 * @param nullifier - The nullifier value to look up.
 * @param treeNumber - Tree Number of nullifier
 * @returns `true` if the nullifier is present, otherwise `false`.
 */
async function nullifierExists (db: ChainDatabase, nullifier: Uint8Array, treeNumber: number): Promise<boolean> {
  const result = await db
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
 * @param db - Chain database instance.
 * @param nullifierBatch - Array of nullifiers to insert.
 * @returns The number of rows changed.
 */
async function insertNullifiersBatch (db: ChainDatabase, nullifierBatch: DBNewNullifier[]): Promise<number> {
  if (nullifierBatch.length === 0) return 0
  return upsertRow<DBNewNullifier>(db, nullifiers, [nullifiers.nullifier, nullifiers.treeNumber], nullifierBatch)
}

/**
 * Retrieve nullifiers whose block numbers fall within a specified range.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @param toBlock - Ending block height (inclusive).
 * @returns Array of nullifiers sorted by block number.
 */
async function getNullifiersByBlockRange (
  db: ChainDatabase,
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
async function deleteNullifiersFromBlock (db: ChainDatabase, fromBlock: bigint): Promise<number> {
  const result = await db
    .delete(nullifiers)
    .where(gte(nullifiers.blockNumber, fromBlock))
    .run()
  return normalizeMutationCount(result)
}

/**
 * Retrieve all nullifiers from the database.
 * @param db - Chain database instance.
 * @returns Array of all nullifier records sorted by block number.
 */
async function getAllNullifiers (db: ChainDatabase) {
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
async function getNullifiersFromBlock (db: ChainDatabase, fromBlock: bigint) {
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
 * @param db - Chain database instance.
 * @param commitmentBatch - Array of commitment records to upsert.
 * @returns Number of rows changed.
 */
async function insertCommitmentBatch (db: ChainDatabase, commitmentBatch: DBNewCommitment[]): Promise<number> {
  if (commitmentBatch.length === 0) return 0
  return upsertRow(db, commitments, commitments.hash, commitmentBatch)
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
  db: ChainDatabase,
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
  db: ChainDatabase,
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
async function deleteCommitmentsFromBlock (db: ChainDatabase, fromBlock: bigint): Promise<number> {
  const result = await db
    .delete(commitments)
    .where(gte(commitments.blockNumber, fromBlock))
    .run()
  return normalizeMutationCount(result)
}

/**
 * Fetch the Merkle tree leaf data for a given tree number.
 * @param db - Chain database instance.
 * @param treeNumber - Identifier of the Merkle tree.
 * @returns The leaf data (as a Uint8Array) for the specified tree.
 */
async function getMerkleTree (db: ChainDatabase, treeNumber: number) {
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
async function getAllMerkleTrees (db: ChainDatabase) {
  return db
    .select()
    .from(merkleTrees)
    .orderBy(asc(merkleTrees.treeNumber))
    .all()
}

/**
 * Insert or update a Merkle tree record.
 * @param db - Chain database instance.
 * @param tree - Merkle tree data to persist.
 * @returns Number of rows affected (should always be 1).
 */
async function setMerkleTree (db: ChainDatabase, tree: DBNewMerkleTree): Promise<number> {
  return upsertRow(db, merkleTrees, merkleTrees.treeNumber, tree)
}

/**
 * Retrieve the synchronization state for a specific chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @returns Sync state containing the last synced block height.
 */
async function getSyncState (db: ChainDatabase, chainID: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
}

/**
 * Update the synchronization state for a chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @param lastBlockHeight - Last synced block height for the chain.
 * @returns Number of rows affected (should be 1).
 */
async function updateSyncState (
  db: ChainDatabase,
  chainID: number,
  lastBlockHeight: bigint
): Promise<number> {
  return upsertRow(db, syncState, syncState.chainID, { chainID, lastBlockHeight })
}

/**
 * Read the validated snapshot checkpoint promoted with a chain database.
 * @param db - Chain database instance.
 * @param chainID - Chain identifier.
 * @returns Validated checkpoint row, when one exists.
 */
async function getSnapshotCheckpoint (db: ChainDatabase, chainID: number) {
  return db
    .select()
    .from(snapshotCheckpoints)
    .where(eq(snapshotCheckpoints.chainID, chainID))
    .get()
}

/**
 * Record a validated checkpoint in a staged chain database. The checkpoint is
 * only written when the persisted scan cursor matches the checkpoint height,
 * so a database cannot claim coverage beyond its persisted state. The check
 * and the write must be atomic: run this inside a transaction context.
 * @param db - Chain database or transaction context.
 * @param checkpoint - Validated checkpoint metadata.
 */
async function applySnapshotCheckpoint (
  db: ChainDatabase,
  checkpoint: SnapshotCheckpointInput
): Promise<void> {
  const state = await db
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
  await upsertRow(db, snapshotCheckpoints, snapshotCheckpoints.chainID, row)
}

/**
 * Read the independent Railgun TXID sync cursor for a chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @returns Last block height whose Railgun TXID rows were persisted.
 */
async function getTxidSyncCursor (db: ChainDatabase, chainID: number): Promise<bigint> {
  return (await getSyncState(db, chainID))?.lastTxidSyncBlockHeight ?? 0n
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
  db: ChainDatabase,
  chainID: number,
  blockHeight: bigint
): Promise<number> {
  const existing = await db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
  return upsertRow(db, syncState, syncState.chainID, {
    chainID,
    lastBlockHeight: existing?.lastBlockHeight ?? 0n,
    lastTxidSyncBlockHeight: blockHeight
  })
}

/**
 * Insert Railgun transactions, ignoring already-seen Railgun TXIDs.
 * @param db - Chain database instance.
 * @param rows - Railgun transaction rows to insert.
 * @returns Number of inserted rows.
 */
async function insertRailgunTransactions (
  db: ChainDatabase,
  rows: DBNewRailgunTransaction[]
): Promise<number> {
  if (rows.length === 0) return 0
  const result = await db
    .insert(railgunTransactions)
    .values(rows)
    .onConflictDoNothing({ target: railgunTransactions.railgunTxid })
    .run()
  return normalizeMutationCount(result)
}

/**
 * Fetch one Railgun transaction by its canonical Railgun TXID.
 * @param db - Chain database instance.
 * @param railgunTxid - Canonical Railgun transaction ID.
 * @returns Matching transaction row, when present.
 */
async function getRailgunTransactionByTxid (
  db: ChainDatabase,
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
  db: ChainDatabase,
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
  db: ChainDatabase,
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
 * @param db - Chain database instance.
 * @param unshieldsBatch - Array of unshield records to upsert.
 * @returns Number of rows changed.
 */
async function insertUnshieldBatch (db: ChainDatabase, unshieldsBatch: DBNewUnshield[]): Promise<number> {
  if (unshieldsBatch.length === 0) return 0
  return upsertRow(db, unshields, [unshields.transactionHash, unshields.eventLogIndex], unshieldsBatch)
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
  db: ChainDatabase,
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
  db: ChainDatabase,
  treeNumber: number,
  treePosition: number
) {
  const candidates = await db
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
 * Apply one scan batch: nullifiers, commitments, unshields, Railgun
 * transactions, serialized Merkle trees, and the sync cursors. The Railgun
 * TXID cursor advances only when at least one new Railgun transaction row was
 * inserted. The writes must land together: run this inside a transaction
 * context so the batch persists atomically.
 * @param db - Chain database or transaction context.
 * @param batch - Scan batch to persist.
 */
async function applyScanBatch (db: ChainDatabase, batch: ScanBatch): Promise<void> {
  if (batch.nullifiers && batch.nullifiers.length > 0) {
    await insertNullifiersBatch(db, batch.nullifiers)
  }
  if (batch.commitments && batch.commitments.length > 0) {
    await insertCommitmentBatch(db, batch.commitments)
  }
  if (batch.unshields && batch.unshields.length > 0) {
    await insertUnshieldBatch(db, batch.unshields)
  }
  if (batch.railgunTransactions && batch.railgunTransactions.length > 0) {
    const inserted = await insertRailgunTransactions(db, batch.railgunTransactions)
    if (inserted > 0) {
      await setTxidSyncCursor(db, batch.chainID, batch.blockNumber)
    }
  }

  await updateSyncState(db, batch.chainID, batch.blockNumber)

  for (const tree of batch.merkleTrees ?? []) {
    await setMerkleTree(db, tree)
  }
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
  applySnapshotCheckpoint,
  getTxidSyncCursor,
  setTxidSyncCursor,
  insertRailgunTransactions,
  getRailgunTransactionByTxid,
  getRailgunTransactionsByBlockRange,
  getRailgunTransactionsByTreeRange,
  findRailgunTransactionForLeaf,
  insertUnshieldBatch,
  getUnshieldsByBlockRange,
  applyScanBatch
}
export type { ScanBatch, SnapshotCheckpointInput }
