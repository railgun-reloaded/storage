import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm'

import type { ChainDB } from './db'
import type { NewCommitment, NewMerkleNode, NewMerkleRoot, NewNullifier } from './schema'
import {

  commitments,
  merkleNodes,
  merkleRoots,
  nullifiers,
  syncState
} from './schema'

export function nullifierExists (db: ChainDB, nullifier: string): boolean {
  const result = db
    .select({ nullifier: nullifiers.nullifier })
    .from(nullifiers)
    .where(eq(nullifiers.nullifier, nullifier))
    .get()

  return result !== undefined
}

export function insertNullifiersBatch (db: ChainDB, records: NewNullifier[]): number {
  if (records.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .insert(nullifiers)
      .values(records)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
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

export function deleteNullifiersFromBlock (db: ChainDB, fromBlock: bigint): number {
  return db.transaction(() => {
    const result = db
      .delete(nullifiers)
      .where(gte(nullifiers.blockNumber, fromBlock))
      .run()

    return result.changes
  })
}

export function getMerkleNode (
  db: ChainDB,
  treeId: number,
  level: number,
  index: bigint
) {
  return db
    .select()
    .from(merkleNodes)
    .where(
      and(
        eq(merkleNodes.treeId, treeId),
        eq(merkleNodes.level, level),
        eq(merkleNodes.index, index)
      )
    )
    .get()
}

export function insertMerkleNodesBatch (db: ChainDB, nodes: NewMerkleNode[]): number {
  if (nodes.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .insert(merkleNodes)
      .values(nodes)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
}

export function getNodesAtLevel (db: ChainDB, treeId: number, level: number) {
  return db
    .select()
    .from(merkleNodes)
    .where(and(eq(merkleNodes.treeId, treeId), eq(merkleNodes.level, level)))
    .orderBy(merkleNodes.index)
    .all()
}

export function getMerkleSiblingPath (
  db: ChainDB,
  treeId: number,
  leafIndex: bigint,
  depth: number
): Uint8Array[] {
  const siblings: Uint8Array[] = []
  let currentIndex = leafIndex

  for (let level = 0; level < depth; level++) {
    const siblingIndex = currentIndex ^ 1n

    const sibling = getMerkleNode(db, treeId, level, siblingIndex)

    if (!sibling) {
      throw new Error(
        `Missing merkle node: tree=${treeId} level=${level} index=${siblingIndex}`
      )
    }

    siblings.push(sibling.hash)
    currentIndex = currentIndex >> 1n
  }

  return siblings
}

export function insertCommitmentsBatch (db: ChainDB, records: NewCommitment[]): number {
  if (records.length === 0) return 0

  return db.transaction(() => {
    const result = db
      .insert(commitments)
      .values(records)
      .onConflictDoNothing()
      .run()

    return result.changes
  })
}

export function getCommitmentsByLeafRange (
  db: ChainDB,
  treeId: number,
  fromIndex: bigint,
  toIndex: bigint
) {
  return db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.treeId, treeId),
        gte(commitments.leafIndex, fromIndex),
        lte(commitments.leafIndex, toIndex)
      )
    )
    .orderBy(commitments.leafIndex)
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
    .all()
}

/**
 * Deletes commitments from a block onwards (for reorg).
 * @param db - Chain database instance
 * @param fromBlock - Delete commitments from this block onwards
 * @returns Number of rows deleted
 */
export function deleteCommitmentsFromBlock (db: ChainDB, fromBlock: bigint): number {
  return db.transaction(() => {
    const result = db
      .delete(commitments)
      .where(gte(commitments.blockNumber, fromBlock))
      .run()

    return result.changes
  })
}

export function getCommitmentsByHashes (db: ChainDB, hashes: string[]) {
  if (hashes.length === 0) return []

  return db
    .select()
    .from(commitments)
    .where(inArray(commitments.hash, hashes))
    .all()
}

export function upsertMerkleRoot (db: ChainDB, root: NewMerkleRoot): number {
  const result = db
    .insert(merkleRoots)
    .values(root)
    .onConflictDoUpdate({
      target: [merkleRoots.treeId, merkleRoots.blockNumber],
      set: { root: root.root },
    })
    .run()

  return result.changes
}

export function getLatestMerkleRoot (db: ChainDB, treeId: number) {
  return db
    .select()
    .from(merkleRoots)
    .where(eq(merkleRoots.treeId, treeId))
    .orderBy(sql`${merkleRoots.blockNumber} DESC`)
    .limit(1)
    .get()
}

export function getSyncState (db: ChainDB, chainId: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainId, chainId))
    .get()
}

export function updateSyncState (
  db: ChainDB,
  chainId: number,
  lastBlock: bigint
): void {
  db.insert(syncState)
    .values({ chainId, lastBlock })
    .onConflictDoUpdate({
      target: syncState.chainId,
      set: { lastBlock, updatedAt: sql`(unixepoch())` },
    })
    .run()
}

export function getChainDBStats (db: ChainDB) {
  const nullifiersCount = db
    .select({ count: sql<number>`count(*)` })
    .from(nullifiers)
    .get()

  const nodesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(merkleNodes)
    .get()

  const commitmentsCount = db
    .select({ count: sql<number>`count(*)` })
    .from(commitments)
    .get()

  const rootsCount = db
    .select({ count: sql<number>`count(*)` })
    .from(merkleRoots)
    .get()

  return {
    nullifiers: nullifiersCount?.count ?? 0,
    merkleNodes: nodesCount?.count ?? 0,
    commitments: commitmentsCount?.count ?? 0,
    merkleRoots: rootsCount?.count ?? 0,
  }
}
