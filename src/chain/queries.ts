import { and, asc, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'

import type { ChainDB } from './db'
import type { DBNewCommitment, DBNewMerkleTree, DBNewNullifier, DBNewUnshield } from './schema'
import {
  commitments,
  merkleTrees,
  nullifiers,
  syncState,
  unshields,
} from './schema'

type DBContext = ChainDB | SQLiteTransaction<any, any, any, any>

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

  const set = Object.fromEntries(
    Object.entries(columns).map(([key, col]) => [
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
function nullifierExists (db: ChainDB, nullifier: Uint8Array, treeNumber: number): boolean {
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
 * @param db - Chain database or transaction context.
 * @param nullifierBatch - Array of nullifiers to insert.
 * @returns The number of rows changed.
 */
function insertNullifiersBatch (db: DBContext, nullifierBatch: DBNewNullifier[]): number {
  if (nullifierBatch.length === 0) return 0
  const { changes } = upsertRow<DBNewNullifier>(db, nullifiers, [nullifiers.nullifier, nullifiers.treeNumber], nullifierBatch)
  return changes
}

/**
 * Retrieve nullifiers whose block numbers fall within a specified range.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @param toBlock - Ending block height (inclusive).
 * @returns Array of nullifiers sorted by block number.
 */
function getNullifiersByBlockRange (
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
 * @param db - Chain database or transaction context.
 * @param fromBlock - Block number from which to delete (inclusive).
 * @returns Number of rows deleted.
 */
function deleteNullifiersFromBlock (db: DBContext, fromBlock: bigint): number {
  const { changes } = db
    .delete(nullifiers)
    .where(gte(nullifiers.blockNumber, fromBlock))
    .run()
  return changes
}

// Commitments

/**
 * Insert or update a batch of commitments in the table.
 * @param db - Chain database or transaction context.
 * @param commitmentBatch - Array of commitment records to upsert.
 * @returns Number of rows changed.
 */
function insertCommitmentBatch (db: DBContext, commitmentBatch: DBNewCommitment[]) : number {
  if (commitmentBatch.length === 0) return 0
  const { changes } = upsertRow(db, commitments, commitments.hash, commitmentBatch)
  return changes
}

/**
 * Get commitments within a specific leaf range of a Merkle tree.
 * @param db - Chain database instance.
 * @param treeNumber - Tree identifier.
 * @param startLeafIndex - Starting leaf index (inclusive).
 * @param endLeafIndex - Ending leaf index (inclusive).
 * @returns Array of commitments ordered by leaf index.
 */
function getCommitmentsByLeafRange (
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
function getCommitmentsByBlockRange (
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
 * @param db - Chain database or transaction context.
 * @param fromBlock - Block height from which to start deletion (inclusive).
 * @returns Number of rows deleted.
 */
function deleteCommitmentsFromBlock (db: DBContext, fromBlock: bigint): number {
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
function getMerkleTree (db: ChainDB, treeNumber: number) {
  return db
    .select()
    .from(merkleTrees)
    .where(eq(merkleTrees.treeNumber, treeNumber))
    .get()
}

/**
 * Insert or update a Merkle tree record.
 * @param db - Chain database or transaction context.
 * @param tree - Merkle tree data to persist.
 * @returns Number of rows affected (should always be 1).
 */
function setMerkleTree (db: DBContext, tree: DBNewMerkleTree) {
  const { changes } = upsertRow(db, merkleTrees, merkleTrees.treeNumber, tree)
  return changes
}

/**
 * Retrieve the synchronization state for a specific chain.
 * @param db - Chain database instance.
 * @param chainID - Identifier of the chain.
 * @returns Sync state containing the last synced block height.
 */
function getSyncState (db: ChainDB, chainID: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
}

/**
 * Update the synchronization state for a chain.
 * @param db - Chain database or transaction context.
 * @param chainID - Identifier of the chain.
 * @param lastBlockHeight - Last synced block height for the chain.
 * @returns Number of rows affected (should be 1).
 */
function updateSyncState (
  db: DBContext,
  chainID: number,
  lastBlockHeight: bigint
) {
  const { changes } = upsertRow(db, syncState, syncState.chainID, { chainID, lastBlockHeight })
  return changes
}

/**
 * Insert or update a batch of unshield events.
 * @param db - Chain database or transaction context.
 * @param unshieldsBatch - Array of unshield records to upsert.
 * @returns Number of rows changed.
 */
function insertUnshieldBatch (db: DBContext, unshieldsBatch: DBNewUnshield[]) {
  const { changes } = upsertRow(db, unshields, [unshields.transactionHash, unshields.eventLogIndex], unshieldsBatch)
  return changes
}

/**
 * Retrieve unshield records within a block range, sorted ascending by
 * block number.
 * @param db - Chain database instance.
 * @param fromBlock - Starting block height (inclusive).
 * @param toBlock - Ending block height (inclusive).
 * @returns Array of unshield records sorted by block number.
 */
function getUnshieldsByBlockRange (
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
 * Execute a series of database operations inside a transaction.
 * The provided callback receives a transaction object that should be used for
 * any write operations, ensuring atomicity.
 * @param db - Chain database instance.
 * @param callback - Function that performs queries using the transaction.
 * @returns The value returned by the callback.
 */
function runDBTransaction (db: ChainDB, callback: (tx: SQLiteTransaction<any, any, any, any>) => any): any {
  return db.transaction(callback)
}

export {
  nullifierExists,
  insertNullifiersBatch,
  getNullifiersByBlockRange,
  deleteNullifiersFromBlock,
  insertCommitmentBatch,
  getCommitmentsByLeafRange,
  getCommitmentsByBlockRange,
  deleteCommitmentsFromBlock,
  getMerkleTree,
  setMerkleTree,
  getSyncState,
  updateSyncState,
  insertUnshieldBatch,
  getUnshieldsByBlockRange,
  runDBTransaction
}
