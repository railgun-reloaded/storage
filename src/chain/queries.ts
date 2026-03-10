import { and, eq, getTableColumns, gte, lte, sql } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'

import type { ChainDB } from './db'
import type { DBNewCommitment, DBNewMerkleTree, DBNewNulliifer } from './schema'
import {
  commitments,
  merkleTrees,
  nullifiers,
  syncState,
} from './schema'

type DBContext = ChainDB | SQLiteTransaction<any, any, any, any>

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
export function nullifierExists (db: ChainDB, nullifier: Uint8Array): boolean {
  const result = db
    .select()
    .from(nullifiers)
    .where(eq(nullifiers.nullifier, nullifier))
    .get()
  return result !== undefined
}

export function insertNullifiersBatch (db: DBContext, nullifierBatch: DBNewNulliifer[]): number {
  if (nullifierBatch.length === 0) return 0
  const { changes } = upsertRow<DBNewNulliifer>(db, nullifiers, nullifiers.nullifier, nullifierBatch)
  return changes
}

export function getNullifiersByBlockRange (
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
    .all()
}

export function deleteNullifiersFromBlock (db: DBContext, fromBlock: bigint): number {
  const { changes } = db
    .delete(nullifiers)
    .where(gte(nullifiers.blockNumber, fromBlock))
    .run()
  return changes
}

// Commitments

export function insertCommitmentBatch (db: DBContext, commitmentBatch: DBNewCommitment[]) : number {
  if (commitmentBatch.length === 0) return 0
  const { changes } = upsertRow(db, commitments, commitments.hash, commitmentBatch)
  return changes
}

export function getCommitmentsByLeafRange (
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
    .orderBy(commitments.treePosition)
    .all()
}

/**
 * Gets commitments by block range (for reorg handling).
 * @param db - Chain database instance
 * @param fromBlock - Start block (inclusive)
 * @param toBlock - End block (inclusive)
 * @returns Array of commitments in range
 */
export function getCommitmentsByBlockRange (
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
    .orderBy(commitments.blockNumber)
    .all()
}

/**
 * Deletes commitments from a block onwards (for reorg).
 * @param db - Chain database instance
 * @param fromBlock - Delete commitments from this block onwards
 * @returns Number of rows deleted
 */
export function deleteCommitmentsFromBlock (db: DBContext, fromBlock: bigint): number {
  const { changes } = db
    .delete(commitments)
    .where(gte(commitments.blockNumber, fromBlock))
    .run()
  return changes
}
/*
export function getCommitmentsByHashes (db: ChainDB, hashes: Uint8Array[]) {
  if (hashes.length === 0) return []

  return db
    .select()
    .from(commitments)
    .where(inArray(commitments.hash, hashes))
    .all()
}
*/
export function getMerkleTree (db: ChainDB, treeNumber: number) {
  return db
    .select()
    .from(merkleTrees)
    .where(eq(merkleTrees.treeNumber, treeNumber))
    .get()
}

export function setMerkleTree (db: DBContext, leaves: DBNewMerkleTree) {
  const { changes } = upsertRow(db, merkleTrees, merkleTrees.treeNumber, leaves)
  return changes
}

export function getSyncState (db: ChainDB, chainID: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainID, chainID))
    .get()
}

export function updateSyncState (
  db: DBContext,
  chainID: number,
  lastBlockHeight: bigint
): void {
  const { changes } = upsertRow(db, syncState, syncState.chainID, { chainID, lastBlockHeight })
  return changes
}

export function runDBTransaction (db: ChainDB, callback: (tx: SQLiteTransaction<any, any, any, any>) => any): any {
  return db.transaction(callback)
}
