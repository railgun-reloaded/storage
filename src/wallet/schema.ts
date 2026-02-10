import { sqliteTable, text, integer, blob, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Wallets table - metadata for each RAILGUN wallet.
 * Stores encrypted key material and wallet configuration.
 *
 * Expected size: 1-10 entries (most users have 1-2 wallets)
 */
export const wallets = sqliteTable('wallets', {
  /** Wallet identifier (derived from viewing public key or user-defined) */
  id: text('id').primaryKey().notNull(),

  /** Encrypted key bundle (spending key, viewing key, nullifying key) */
  encryptedKeys: blob('encrypted_keys', { mode: 'buffer' }).notNull(),

  /** Optional wallet name for UI display */
  name: text('name'),

  /** Creation timestamp */
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Notes table - decrypted UTXOs belonging to this wallet.
 * Represents private balances that can be spent.
 *
 * Expected size: 1000-10000 per active wallet
 * Hot path: unspent notes query for balance display
 */
export const notes = sqliteTable(
  'notes',
  {
    /** Commitment hash - unique identifier for this note */
    commitment: text('commitment').primaryKey().notNull(),

    /** Wallet that owns this note */
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),

    /** Computed nullifier for this note (for spending) */
    nullifier: text('nullifier').notNull().unique(),

    /** Token contract address (or native token identifier) */
    token: text('token').notNull(),

    /** Note amount (as bigint for arbitrary precision) */
    amount: text('amount', { mode: 'bigint' }).notNull(),

    /** Whether this note has been spent */
    spent: integer('spent', { mode: 'boolean' }).notNull().default(false),

    /** Transaction ID where note was spent (if spent) */
    spentTxid: text('spent_txid'),

    /** Block number where note was created */
    blockNumber: text('block_number', { mode: 'bigint' }).notNull(),

    /** Merkle tree ID where commitment is stored */
    treeId: integer('tree_id').notNull(),

    /** Leaf index in the merkle tree */
    leafIndex: text('leaf_index', { mode: 'bigint' }).notNull(),

    /** Timestamp when note was decrypted and added to wallet */
    decryptedAt: integer('decrypted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Index for fast unspent notes queries (hot path for balance calculation) */
    walletSpentIdx: index('notes_wallet_spent_idx').on(table.walletId, table.spent),

    /** Index for token-specific queries */
    walletTokenIdx: index('notes_wallet_token_idx').on(table.walletId, table.token),

    /** Index for nullifier lookups */
    nullifierIdx: index('notes_nullifier_idx').on(table.nullifier),

    /** Index for tree/leaf lookups */
    treeLeafIdx: index('notes_tree_leaf_idx').on(table.treeId, table.leafIndex),
  })
);

/**
 * Balances table - cached balance per wallet per token.
 * Recomputed from unspent notes, but cached for performance.
 *
 * Expected size: 10-100 per wallet (one per token held)
 */
export const balances = sqliteTable(
  'balances',
  {
    /** Wallet ID */
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),

    /** Token contract address */
    token: text('token').notNull(),

    /** Total balance (sum of unspent notes) */
    amount: text('amount', { mode: 'bigint' }).notNull(),

    /** Last update timestamp */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Composite PK - one balance per wallet per token */
    pk: primaryKey({ columns: [table.walletId, table.token] }),
  })
);

/**
 * Scan state table - tracks wallet scanning progress per chain.
 * Each wallet independently tracks how far it has scanned the chain.
 *
 * Expected size: 1 entry per wallet per chain
 */
export const scanState = sqliteTable(
  'scan_state',
  {
    /** Wallet ID */
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),

    /** Chain ID (1 = Ethereum mainnet, 137 = Polygon, etc.) */
    chainId: integer('chain_id').notNull(),

    /** Last block number scanned by this wallet */
    lastScannedBlock: text('last_scanned_block', { mode: 'bigint' }).notNull(),

    /** Last update timestamp */
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Composite PK - one scan state per wallet per chain */
    pk: primaryKey({ columns: [table.walletId, table.chainId] }),
  })
);

/**
 * Transaction history table - records all wallet transactions.
 * Used for UI display and transaction tracking.
 *
 * Expected size: 100-1000 per active wallet
 */
export const txHistory = sqliteTable(
  'tx_history',
  {
    /** Transaction history entry ID (UUID or hash-based) */
    id: text('id').primaryKey().notNull(),

    /** Wallet ID */
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),

    /** Transaction type */
    type: text('type', { enum: ['shield', 'transfer', 'unshield'] }).notNull(),

    /** On-chain transaction hash */
    txid: text('txid').notNull(),

    /** Block number where transaction was included */
    blockNumber: text('block_number', { mode: 'bigint' }).notNull(),

    /** Transaction timestamp (block timestamp) */
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),

    /** Flexible metadata (inputs, outputs, fees, etc. as JSON) */
    metadata: text('metadata', { mode: 'json' }),

    /** When this entry was created */
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    /** Index for chronological queries per wallet */
    walletBlockIdx: index('tx_history_wallet_block_idx').on(table.walletId, table.blockNumber),

    /** Index for txid lookups */
    txidIdx: index('tx_history_txid_idx').on(table.txid),
  })
);

/**
 * Type inference for SELECT operations
 */
export type Wallet = typeof wallets.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Balance = typeof balances.$inferSelect;
export type ScanState = typeof scanState.$inferSelect;
export type TxHistory = typeof txHistory.$inferSelect;

/**
 * Type inference for INSERT operations
 */
export type NewWallet = typeof wallets.$inferInsert;
export type NewNote = typeof notes.$inferInsert;
export type NewBalance = typeof balances.$inferInsert;
export type NewScanState = typeof scanState.$inferInsert;
export type NewTxHistory = typeof txHistory.$inferInsert;
