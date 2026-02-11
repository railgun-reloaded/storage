import { sqliteTable, text, integer, blob, index, primaryKey, customType } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const bigint = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'text';
  },
  toDriver(value: bigint): string {
    return value.toString();
  },
  fromDriver(value: string): bigint {
    return BigInt(value);
  },
});

export const nullifiers = sqliteTable(
  'nullifiers',
  {
    nullifier: text('nullifier').primaryKey().notNull(),
    txid: text('txid').notNull(),
    blockNumber: bigint('block_number').notNull(),
    treeId: integer('tree_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    blockNumberIdx: index('nullifiers_block_number_idx').on(table.blockNumber),
    treeIdIdx: index('nullifiers_tree_id_idx').on(table.treeId),
  })
);

export const merkleNodes = sqliteTable(
  'merkle_nodes',
  {
    treeId: integer('tree_id').notNull(),
    level: integer('level').notNull(),
    index: bigint('index').notNull(),
    hash: blob('hash', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.treeId, table.level, table.index] }),
    treeIdLevelIdx: index('merkle_nodes_tree_level_idx').on(table.treeId, table.level),
  })
);

export const commitments = sqliteTable(
  'commitments',
  {
    hash: text('hash').primaryKey().notNull(),
    treeId: integer('tree_id').notNull(),
    leafIndex: bigint('leaf_index').notNull(),
    blockNumber: bigint('block_number').notNull(),
    txid: text('txid').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    treeLeafIdx: index('commitments_tree_leaf_idx').on(table.treeId, table.leafIndex),
    blockNumberIdx: index('commitments_block_number_idx').on(table.blockNumber),
  })
);

export const merkleRoots = sqliteTable(
  'merkle_roots',
  {
    treeId: integer('tree_id').notNull(),
    blockNumber: bigint('block_number').notNull(),
    root: blob('root', { mode: 'buffer' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.treeId, table.blockNumber] }),
  })
);

export const syncState = sqliteTable(
  'sync_state',
  {
    chainId: integer('chain_id').primaryKey().notNull(),
    lastBlock: bigint('last_block').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  }
);

export type Nullifier = typeof nullifiers.$inferSelect;
export type MerkleNode = typeof merkleNodes.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type MerkleRoot = typeof merkleRoots.$inferSelect;
export type SyncState = typeof syncState.$inferSelect;

export type NewNullifier = typeof nullifiers.$inferInsert;
export type NewMerkleNode = typeof merkleNodes.$inferInsert;
export type NewCommitment = typeof commitments.$inferInsert;
export type NewMerkleRoot = typeof merkleRoots.$inferInsert;
export type NewSyncState = typeof syncState.$inferInsert;
