import { sql } from 'drizzle-orm'
import { blob, customType, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const bigint = customType<{ data: bigint; driverData: string }>({
  dataType () {
    return 'text'
  },
  toDriver (value: bigint): string {
    return value.toString()
  },
  fromDriver (value: string): bigint {
    return BigInt(value)
  },
})

export const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey().notNull(),
  encryptedKeys: blob('encrypted_keys', { mode: 'buffer' }).notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

export const notes = sqliteTable(
  'notes',
  {
    commitment: text('commitment').primaryKey().notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    nullifier: text('nullifier').notNull().unique(),
    token: text('token').notNull(),
    amount: bigint('amount').notNull(),
    spent: integer('spent', { mode: 'boolean' }).notNull().default(false),
    spentTxid: text('spent_txid'),
    blockNumber: bigint('block_number').notNull(),
    treeId: integer('tree_id').notNull(),
    leafIndex: bigint('leaf_index').notNull(),
    decryptedAt: integer('decrypted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    walletSpentIdx: index('notes_wallet_spent_idx').on(table.walletId, table.spent),
    walletTokenIdx: index('notes_wallet_token_idx').on(table.walletId, table.token),
    nullifierIdx: index('notes_nullifier_idx').on(table.nullifier),
    treeLeafIdx: index('notes_tree_leaf_idx').on(table.treeId, table.leafIndex),
  })
)

export const balances = sqliteTable(
  'balances',
  {
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    amount: bigint('amount').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.walletId, table.token] }),
  })
)

export const scanState = sqliteTable(
  'scan_state',
  {
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    lastScannedBlock: bigint('last_scanned_block').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.walletId, table.chainId] }),
  })
)

export const txHistory = sqliteTable(
  'tx_history',
  {
    id: text('id').primaryKey().notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['shield', 'transfer', 'unshield'] }).notNull(),
    txid: text('txid').notNull(),
    blockNumber: bigint('block_number').notNull(),
    timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
    metadata: text('metadata', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    walletBlockIdx: index('tx_history_wallet_block_idx').on(table.walletId, table.blockNumber),
    txidIdx: index('tx_history_txid_idx').on(table.txid),
  })
)

export type Wallet = typeof wallets.$inferSelect
export type Note = typeof notes.$inferSelect
export type Balance = typeof balances.$inferSelect
export type ScanState = typeof scanState.$inferSelect
export type TxHistory = typeof txHistory.$inferSelect

export type NewWallet = typeof wallets.$inferInsert
export type NewNote = typeof notes.$inferInsert
export type NewBalance = typeof balances.$inferInsert
export type NewScanState = typeof scanState.$inferInsert
export type NewTxHistory = typeof txHistory.$inferInsert
