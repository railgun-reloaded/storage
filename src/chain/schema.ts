import { sqliteTable, text, integer, blob, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Nullifiers table - tracks spent notes in the RAILGUN privacy system.
 * Each nullifier represents a consumed UTXO and prevents double-spending.
 *
 * Expected size: ~1M entries per year per chain
 * Hot path: existence checks during proof generation
 */
export const nullifiers = sqliteTable(
  'nullifiers',
  {
    /** 32-byte nullifier hash as hex string (0x-prefixed) */
    nullifier: text('nullifier').primaryKey().notNull(),

    /** Transaction hash where this nullifier was published */
    txid: text('txid').notNull(),

    /** Block number where this nullifier was included */
    blockNumber: text('block_number', { mode: 'bigint' }).notNull(),

    /** Merkle tree ID (0, 1, 2, ...) */
    treeId: integer('tree_id').notNull(),

    /** Timestamp when this nullifier was indexed */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Index for reorg handling and pruning */
    blockNumberIdx: index('nullifiers_block_number_idx').on(table.blockNumber),

    /** Index for tree-specific queries */
    treeIdIdx: index('nullifiers_tree_id_idx').on(table.treeId),
  })
);

/**
 * Merkle tree nodes - sparse representation of the RAILGUN commitment tree.
 * Only stores nodes needed for proof generation.
 *
 * Tree structure:
 * - Level 0: leaves (commitments)
 * - Level 1-N: intermediate nodes
 * - Level N: root
 *
 * Expected size: ~2M entries per full tree (depth 20)
 */
export const merkleNodes = sqliteTable(
  'merkle_nodes',
  {
    /** Merkle tree ID (supports multiple trees) */
    treeId: integer('tree_id').notNull(),

    /** Tree level (0 = leaves, increases toward root) */
    level: integer('level').notNull(),

    /** Position at this level (0-indexed) */
    index: text('index', { mode: 'bigint' }).notNull(),

    /** 32-byte node hash */
    hash: blob('hash', { mode: 'buffer' }).notNull(),

    /** Timestamp when this node was computed */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Composite PK ensures unique nodes */
    pk: primaryKey({ columns: [table.treeId, table.level, table.index] }),

    /** Index for sibling lookups during proof generation */
    treeIdLevelIdx: index('merkle_nodes_tree_level_idx').on(table.treeId, table.level),
  })
);

/**
 * Commitments table - tracks all UTXO commitments on-chain.
 * Used for scanning and identifying notes belonging to wallets.
 *
 * Note: Ciphertexts are NOT stored locally - fetched from node/IPFS during recovery.
 *
 * Expected size: ~1M entries per year per chain
 */
export const commitments = sqliteTable(
  'commitments',
  {
    /** Commitment hash (32-byte hex string, 0x-prefixed) - unique UTXO identifier */
    hash: text('hash').primaryKey().notNull(),

    /** Merkle tree ID where this commitment is stored */
    treeId: integer('tree_id').notNull(),

    /** Leaf index in the merkle tree */
    leafIndex: text('leaf_index', { mode: 'bigint' }).notNull(),

    /** Block number where this commitment was created */
    blockNumber: text('block_number', { mode: 'bigint' }).notNull(),

    /** Transaction hash where this commitment was published */
    txid: text('txid').notNull(),

    /** Timestamp when this commitment was indexed */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Index for range scans during sync (get commitments from leafIndex X to Y) */
    treeLeafIdx: index('commitments_tree_leaf_idx').on(table.treeId, table.leafIndex),

    /** Index for reorg handling */
    blockNumberIdx: index('commitments_block_number_idx').on(table.blockNumber),
  })
);

/**
 * Merkle roots table - caches computed tree roots for fast verification.
 * Roots are recomputed from tree nodes, but caching improves performance.
 *
 * Expected size: Small (~1000 entries per tree)
 */
export const merkleRoots = sqliteTable(
  'merkle_roots',
  {
    /** Merkle tree ID */
    treeId: integer('tree_id').notNull(),

    /** Block number when this root was current */
    blockNumber: text('block_number', { mode: 'bigint' }).notNull(),

    /** 32-byte root hash */
    root: blob('root', { mode: 'buffer' }).notNull(),

    /** Timestamp when this root was computed */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Composite PK - one root per tree per block */
    pk: primaryKey({ columns: [table.treeId, table.blockNumber] }),
  })
);

/**
 * Sync state table - tracks blockchain indexing progress per chain.
 * Used to resume syncing after restart.
 *
 * Expected size: 1 entry per chain
 */
export const syncState = sqliteTable(
  'sync_state',
  {
    /** Chain ID (1 = Ethereum mainnet, 137 = Polygon, etc.) */
    chainId: integer('chain_id').primaryKey().notNull(),

    /** Last fully indexed block number */
    lastBlock: text('last_block', { mode: 'bigint' }).notNull(),

    /** Last update timestamp */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  }
);

/**
 * Type inference for SELECT operations
 */
export type Nullifier = typeof nullifiers.$inferSelect;
export type MerkleNode = typeof merkleNodes.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type MerkleRoot = typeof merkleRoots.$inferSelect;
export type SyncState = typeof syncState.$inferSelect;

/**
 * Type inference for INSERT operations
 */
export type NewNullifier = typeof nullifiers.$inferInsert;
export type NewMerkleNode = typeof merkleNodes.$inferInsert;
export type NewCommitment = typeof commitments.$inferInsert;
export type NewMerkleRoot = typeof merkleRoots.$inferInsert;
export type NewSyncState = typeof syncState.$inferInsert;
