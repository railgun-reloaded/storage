/**
 * Wallet database schema definitions.
 *
 * This file declares all tables and types used by the wallet database.  The
 * schema is consumed by Drizzle ORM to provide type-safe queries.
 */
import { sql } from 'drizzle-orm'
import { integer } from 'drizzle-orm/sqlite-core/columns/integer'
import { text } from 'drizzle-orm/sqlite-core/columns/text'
import { index } from 'drizzle-orm/sqlite-core/indexes'
import { primaryKey } from 'drizzle-orm/sqlite-core/primary-keys'
import { sqliteTable } from 'drizzle-orm/sqlite-core/table'
import { unique } from 'drizzle-orm/sqlite-core/unique-constraint'

import { bigint, msgpackBlob, uint8Array } from '../column-types.js'

/**
 * Canonical 256-bit null sub-ID for ERC20 notes, expressed as a SQLite blob
 * literal (`x'00…00'`) so existing rows back-fill to the same byte pattern
 * upstream code uses when constructing an ERC20 TokenData.
 */
const ERC20_NULL_TOKEN_SUB_ID = sql.raw(`x'${'00'.repeat(32)}'`)

/**
 * Stores metadata and encrypted keys for each wallet.
 */
const wallets = sqliteTable('wallets', {
  id: text('id').primaryKey().notNull(),
  encryptedKeys: uint8Array('encrypted_keys').notNull(),
  name: text('name'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
})

/**
 * Stores decrypted notes owned by wallets.  Each entry records spend status
 * and associated commitment/nullifier values.
 */
const notes = sqliteTable(
  'notes',
  {
    commitment: uint8Array('commitment').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    nullifier: uint8Array('nullifier').notNull(),
    token: text('token').notNull(),
    amount: bigint('amount').notNull(),
    tokenType: integer('token_type').notNull().default(0),
    tokenSubID: uint8Array('token_sub_id').notNull().default(ERC20_NULL_TOKEN_SUB_ID),
    spent: integer('spent', { mode: 'boolean' }).notNull().default(false),
    spentTxid: uint8Array('spent_txid'),
    blockNumber: bigint('block_number').notNull(),
    treeNumber: integer('tree_id').notNull(),
    treePosition: integer('leaf_index').notNull(),
    commitmentType: integer('commitment_type').notNull(),
    outputType: integer('output_type'),
    npk: uint8Array('npk'),
    random: uint8Array('random'),
    blindedCommitment: uint8Array('blinded_commitment'),
    creationRailgunTxid: uint8Array('creation_railgun_txid'),
    creationTxid: uint8Array('creation_txid'),
    poisPerList: msgpackBlob('pois_per_list'),
    decryptedAt: integer('decrypted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    walletChainSpentIdx: index('notes_wallet_chain_spent_idx').on(
      table.walletId,
      table.chainId,
      table.spent
    ),
    walletChainTokenIdx: index('notes_wallet_chain_token_idx').on(
      table.walletId,
      table.chainId,
      table.token
    ),
    notePk: primaryKey({ columns: [table.walletId, table.chainId, table.commitment] }),
    nullifierIdx: index('notes_chain_nullifier_idx').on(table.chainId, table.nullifier),
    nullifierTreeUnique: unique('notes_chain_nullifier_tree_unique').on(
      table.chainId,
      table.nullifier,
      table.treeNumber
    ),
    treeLeafIdx: index('notes_chain_tree_leaf_idx').on(table.chainId, table.treeNumber, table.treePosition),
  })
)

/**
 * Records the last scanned block height for each wallet/chain pair.
 */
const scanState = sqliteTable(
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

/**
 * Records sender-side decryptions of outgoing commitments. Mirrors engine's
 * `<walletId>-spent:` LevelDB prefix. Independent of `notes`: a self-send
 * change output may have rows in both tables for the same `commitment` bytes,
 * a pure outgoing transfer to another wallet has only a `sentCommitments` row.
 * Used as input to future POI proof generation.
 */
const sentCommitments = sqliteTable(
  'sent_commitments',
  {
    commitment: uint8Array('commitment').notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
    treeNumber: integer('tree_id').notNull(),
    treePosition: integer('leaf_index').notNull(),
    token: text('token').notNull(),
    amount: bigint('amount').notNull(),
    npk: uint8Array('npk').notNull(),
    random: uint8Array('random'),
    blindedCommitment: uint8Array('blinded_commitment'),
    creationRailgunTxid: uint8Array('creation_railgun_txid'),
    outputType: integer('output_type'),
    recipientMpk: uint8Array('recipient_mpk').notNull(),
    blockNumber: bigint('block_number').notNull(),
    decryptedAt: integer('decrypted_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.walletId, table.chainId, table.commitment] }),
    walletChainIdx: index('sent_commitments_wallet_chain_idx').on(
      table.walletId,
      table.chainId
    ),
  })
)

/**
 * Persists transaction history events for a wallet.
 */
const txHistory = sqliteTable(
  'tx_history',
  {
    id: text('id').primaryKey().notNull(),
    walletId: text('wallet_id')
      .notNull()
      .references(() => wallets.id, { onDelete: 'cascade' }),
    chainId: integer('chain_id').notNull(),
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
    walletChainBlockIdx: index('tx_history_wallet_chain_block_idx').on(
      table.walletId,
      table.chainId,
      table.blockNumber
    ),
    txidIdx: index('tx_history_txid_idx').on(table.txid),
  })
)

type DBWallet = typeof wallets.$inferSelect
type DBNote = typeof notes.$inferSelect
type DBScanState = typeof scanState.$inferSelect
type DBTxHistory = typeof txHistory.$inferSelect
type DBSentCommitment = typeof sentCommitments.$inferSelect

type DBNewWallet = typeof wallets.$inferInsert
type DBNewNote = typeof notes.$inferInsert
type DBNewScanState = typeof scanState.$inferInsert
type DBNewTxHistory = typeof txHistory.$inferInsert
type DBNewSentCommitment = typeof sentCommitments.$inferInsert

export type {
  DBWallet, DBNote, DBScanState, DBTxHistory, DBSentCommitment,
  DBNewWallet, DBNewNote, DBNewScanState, DBNewTxHistory, DBNewSentCommitment
}
export { wallets, txHistory, scanState, notes, sentCommitments }
