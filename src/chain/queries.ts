import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import type { ChainDB } from './db.js';
import {
  nullifiers,
  merkleNodes,
  commitments,
  merkleRoots,
  syncState,
  type NewNullifier,
  type NewMerkleNode,
  type NewCommitment,
  type NewMerkleRoot,
} from './schema.js';

/**
 * Nullifier Operations
 */

/**
 * Checks if a nullifier exists (has been spent).
 *
 * @param db - Chain database instance
 * @param nullifier - Nullifier hash to check
 * @returns True if nullifier exists (note has been spent)
 */
export function nullifierExists(db: ChainDB, nullifier: string): boolean {
  const result = db
    .select({ nullifier: nullifiers.nullifier })
    .from(nullifiers)
    .where(eq(nullifiers.nullifier, nullifier))
    .get();

  return result !== undefined;
}

/**
 * Batch inserts nullifiers with transaction.
 * Uses INSERT OR IGNORE for idempotency.
 *
 * @param db - Chain database instance
 * @param records - Array of nullifiers to insert
 * @returns Number of rows inserted
 */
export function insertNullifiersBatch(db: ChainDB, records: NewNullifier[]): number {
  if (records.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .insert(nullifiers)
      .values(records)
      .onConflictDoNothing()
      .run();

    return result.changes;
  });
}

/**
 * Gets nullifiers in a block range (for reorg handling).
 *
 * @param db - Chain database instance
 * @param fromBlock - Start block (inclusive)
 * @param toBlock - End block (inclusive)
 * @returns Array of nullifiers in range
 */
export function getNullifiersByBlockRange(
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
    .all();
}

/**
 * Deletes nullifiers from a block onwards (for reorg).
 *
 * @param db - Chain database instance
 * @param fromBlock - Delete nullifiers from this block onwards
 * @returns Number of rows deleted
 */
export function deleteNullifiersFromBlock(db: ChainDB, fromBlock: bigint): number {
  return db.transaction(() => {
    const result = db
      .delete(nullifiers)
      .where(gte(nullifiers.blockNumber, fromBlock))
      .run();

    return result.changes;
  });
}

/**
 * Merkle Tree Operations
 */

/**
 * Gets a merkle node by its coordinates.
 *
 * @param db - Chain database instance
 * @param treeId - Tree ID
 * @param level - Tree level
 * @param index - Position at level
 * @returns Merkle node or undefined
 */
export function getMerkleNode(
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
    .get();
}

/**
 * Batch inserts merkle nodes with transaction.
 *
 * @param db - Chain database instance
 * @param nodes - Array of nodes to insert
 * @returns Number of rows inserted
 */
export function insertMerkleNodesBatch(db: ChainDB, nodes: NewMerkleNode[]): number {
  if (nodes.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .insert(merkleNodes)
      .values(nodes)
      .onConflictDoNothing()
      .run();

    return result.changes;
  });
}

/**
 * Gets all nodes at a specific level (for proof generation).
 *
 * @param db - Chain database instance
 * @param treeId - Tree ID
 * @param level - Tree level
 * @returns Array of nodes at level
 */
export function getNodesAtLevel(db: ChainDB, treeId: number, level: number) {
  return db
    .select()
    .from(merkleNodes)
    .where(and(eq(merkleNodes.treeId, treeId), eq(merkleNodes.level, level)))
    .orderBy(merkleNodes.index)
    .all();
}

/**
 * Gets sibling path for merkle proof generation.
 *
 * @param db - Chain database instance
 * @param treeId - Tree ID
 * @param leafIndex - Leaf index to get path for
 * @param depth - Tree depth
 * @returns Array of sibling hashes from leaf to root
 */
export function getMerkleSiblingPath(
  db: ChainDB,
  treeId: number,
  leafIndex: bigint,
  depth: number
): Uint8Array[] {
  const siblings: Uint8Array[] = [];
  let currentIndex = leafIndex;

  for (let level = 0; level < depth; level++) {
    // Calculate sibling index (XOR with 1 flips last bit)
    const siblingIndex = currentIndex ^ 1n;

    const sibling = getMerkleNode(db, treeId, level, siblingIndex);

    if (!sibling) {
      throw new Error(
        `Missing merkle node: tree=${treeId} level=${level} index=${siblingIndex}`
      );
    }

    siblings.push(sibling.hash);

    // Move to parent level
    currentIndex = currentIndex >> 1n;
  }

  return siblings;
}

/**
 * Commitment Operations
 */

/**
 * Batch inserts commitments with transaction.
 *
 * @param db - Chain database instance
 * @param records - Array of commitments to insert
 * @returns Number of rows inserted
 */
export function insertCommitmentsBatch(db: ChainDB, records: NewCommitment[]): number {
  if (records.length === 0) return 0;

  return db.transaction(() => {
    const result = db
      .insert(commitments)
      .values(records)
      .onConflictDoNothing()
      .run();

    return result.changes;
  });
}

/**
 * Gets commitments by leaf index range (for scanning).
 *
 * @param db - Chain database instance
 * @param treeId - Tree ID
 * @param fromIndex - Start leaf index (inclusive)
 * @param toIndex - End leaf index (inclusive)
 * @returns Array of commitments in range
 */
export function getCommitmentsByLeafRange(
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
    .all();
}

/**
 * Gets commitments by block range (for reorg handling).
 *
 * @param db - Chain database instance
 * @param fromBlock - Start block (inclusive)
 * @param toBlock - End block (inclusive)
 * @returns Array of commitments in range
 */
export function getCommitmentsByBlockRange(
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
    .all();
}

/**
 * Deletes commitments from a block onwards (for reorg).
 *
 * @param db - Chain database instance
 * @param fromBlock - Delete commitments from this block onwards
 * @returns Number of rows deleted
 */
export function deleteCommitmentsFromBlock(db: ChainDB, fromBlock: bigint): number {
  return db.transaction(() => {
    const result = db
      .delete(commitments)
      .where(gte(commitments.blockNumber, fromBlock))
      .run();

    return result.changes;
  });
}

/**
 * Gets commitments by hash array (batch lookup).
 *
 * @param db - Chain database instance
 * @param hashes - Array of commitment hashes
 * @returns Array of commitments
 */
export function getCommitmentsByHashes(db: ChainDB, hashes: string[]) {
  if (hashes.length === 0) return [];

  return db
    .select()
    .from(commitments)
    .where(inArray(commitments.hash, hashes))
    .all();
}

/**
 * Merkle Root Operations
 */

/**
 * Inserts or updates a merkle root.
 *
 * @param db - Chain database instance
 * @param root - Root to insert
 * @returns Number of rows inserted
 */
export function upsertMerkleRoot(db: ChainDB, root: NewMerkleRoot): number {
  const result = db
    .insert(merkleRoots)
    .values(root)
    .onConflictDoUpdate({
      target: [merkleRoots.treeId, merkleRoots.blockNumber],
      set: { root: root.root },
    })
    .run();

  return result.changes;
}

/**
 * Gets the latest merkle root for a tree.
 *
 * @param db - Chain database instance
 * @param treeId - Tree ID
 * @returns Latest root or undefined
 */
export function getLatestMerkleRoot(db: ChainDB, treeId: number) {
  return db
    .select()
    .from(merkleRoots)
    .where(eq(merkleRoots.treeId, treeId))
    .orderBy(sql`${merkleRoots.blockNumber} DESC`)
    .limit(1)
    .get();
}

/**
 * Sync State Operations
 */

/**
 * Gets the sync state for a chain.
 *
 * @param db - Chain database instance
 * @param chainId - Chain ID
 * @returns Sync state or undefined
 */
export function getSyncState(db: ChainDB, chainId: number) {
  return db
    .select()
    .from(syncState)
    .where(eq(syncState.chainId, chainId))
    .get();
}

/**
 * Updates the sync state for a chain.
 *
 * @param db - Chain database instance
 * @param chainId - Chain ID
 * @param lastBlock - Last indexed block
 */
export function updateSyncState(
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
    .run();
}

/**
 * Database Utilities
 */

/**
 * Gets total count of records in each table.
 *
 * @param db - Chain database instance
 * @returns Object with counts for each table
 */
export function getChainDBStats(db: ChainDB) {
  const nullifiersCount = db
    .select({ count: sql<number>`count(*)` })
    .from(nullifiers)
    .get();

  const nodesCount = db
    .select({ count: sql<number>`count(*)` })
    .from(merkleNodes)
    .get();

  const commitmentsCount = db
    .select({ count: sql<number>`count(*)` })
    .from(commitments)
    .get();

  const rootsCount = db
    .select({ count: sql<number>`count(*)` })
    .from(merkleRoots)
    .get();

  return {
    nullifiers: nullifiersCount?.count ?? 0,
    merkleNodes: nodesCount?.count ?? 0,
    commitments: commitmentsCount?.count ?? 0,
    merkleRoots: rootsCount?.count ?? 0,
  };
}
