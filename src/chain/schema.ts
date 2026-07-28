/**
 * Chain database schema definitions.
 *
 * This file defines tables used to store public blockchain state, including
 * nullifiers, commitments, Merkle trees, and sync status.  Custom types are
 * provided to handle bigint and msgpack serialization.
 */
import { sql } from 'drizzle-orm'
import { check } from 'drizzle-orm/sqlite-core/checks'
import { integer } from 'drizzle-orm/sqlite-core/columns/integer'
import { text } from 'drizzle-orm/sqlite-core/columns/text'
import { index } from 'drizzle-orm/sqlite-core/indexes'
import { primaryKey } from 'drizzle-orm/sqlite-core/primary-keys'
import { sqliteTable } from 'drizzle-orm/sqlite-core/table'

import { bigint, msgpackBlob, uint8Array } from '../column-types.js'
/**
 * Stores spent nullifiers observed on the chain.
 */
const nullifiers = sqliteTable(
  'nullifiers',
  {
    nullifier: uint8Array('nullifier').notNull(),
    // Optional
    transactionHash: uint8Array('transaction_hash').notNull(),
    // Optional
    blockNumber: bigint('block_number').notNull(),
    treeNumber: integer('tree_number').notNull()
  },
  (table) => ({
    blockNumberIndex: index('nullifiers_block_number_index').on(table.blockNumber),
    treeNumberIndex: index('nullifiers_tree_number_index').on(table.treeNumber),
    // Optional 32 bytes constraint on nullifier
    nullifierSizeCheck: check('nullifier_size_check', sql`length(${table.nullifier}) = 32`),
    pk: primaryKey({ columns: [table.nullifier, table.treeNumber] }),
  })
)

/**
 * Records unshield events from the chain.
 */
const unshields = sqliteTable(
  'unshields',
  {
    transactionHash: uint8Array('transactionHash').notNull(),
    blockNumber: bigint('blockNumber').notNull(),
    timestamp: bigint('timestamp').notNull(),
    toAddress: uint8Array('toAddress').notNull(),
    // token need reference to another table
    token: msgpackBlob('token'),
    amount: bigint('amount').notNull(),
    fee: bigint('fee').notNull(),
    eventLogIndex: integer('eventLogIndex').notNull()
  },
  (table) => ({
    // Max 20 byte check on address
    toAddressCheck: check('to_address_check', sql`length(${table.toAddress}) <= 20`),
    pk: primaryKey({ columns: [table.transactionHash, table.eventLogIndex] })
  })
)

/**
 * Stores serialized Merkle tree for each tree number.
 */
const merkleTrees = sqliteTable(
  'merkle_trees',
  {
    treeNumber: integer('treeNumber').primaryKey().notNull(),
    leaves: uint8Array('leaves').notNull(),
    // We need to keep track of this to make sure we append at proper place, when new leaf is added
    leafCount: integer('leafCount').notNull()
  },
  (table) => ({
    // Total memory for merkleTree (bytes)= 65536 * 32 + 65535 * 32
    leavesSizeCheck: check('merkle_tree_element_byte_size_check', sql`length(${table.leaves}) = 4194272`),
    leafCountCheck: check('merkle_tree_leaf_count_check', sql`${table.leafCount} <= 65536`)
  })
)

// Chain Sync states
/**
 * Keeps track of the last processed block height for each chain ID.
 */
const syncState = sqliteTable(
  'sync_states',
  {
    chainID: integer('chain_id').primaryKey().notNull(),
    lastBlockHeight: bigint('last_block_height').notNull(),
    lastTxidSyncBlockHeight: bigint('last_txid_sync_block_height')
      .notNull()
      .default(sql.raw(`'${'0'.repeat(64)}'`)),
  }
)

type SnapshotCheckpointTree = {
  treeNumber: number
  leafCount: number
  root: Uint8Array
}

/**
 * Records a snapshot checkpoint only after its staged chain database has
 * passed external chain validation. The row travels with the staged database
 * when that database is promoted into the trusted chain.db location.
 */
const snapshotCheckpoints = sqliteTable(
  'snapshot_checkpoints',
  {
    chainID: integer('chain_id').primaryKey().notNull(),
    cid: text('cid').notNull(),
    blockHeight: bigint('block_height').notNull(),
    trees: msgpackBlob('trees').notNull(),
    validatedAt: integer('validated_at').notNull()
  }
)

const railgunTransactions = sqliteTable(
  'railgun_transactions',
  {
    railgunTxid: uint8Array('railgun_txid').primaryKey().notNull(),
    txidVersion: integer('txid_version').notNull(),
    chainTxid: uint8Array('chain_txid').notNull(),
    graphID: uint8Array('graph_id'),
    blockNumber: bigint('block_number').notNull(),
    timestamp: bigint('timestamp').notNull(),
    nullifiers: msgpackBlob('nullifiers').notNull(),
    commitments: msgpackBlob('commitments').notNull(),
    boundParamsHash: uint8Array('bound_params_hash').notNull(),
    hasUnshield: integer('has_unshield', { mode: 'boolean' }).notNull(),
    unshield: msgpackBlob('unshield'),
    utxoTreeIn: integer('utxo_tree_in').notNull(),
    utxoTreeOut: integer('utxo_tree_out').notNull(),
    utxoBatchStartPositionOut: integer('utxo_batch_start_position_out').notNull(),
    verificationHash: uint8Array('verification_hash')
  },
  (table) => ({
    blockTxIndex: index('railgun_transactions_block_tx_index').on(
      table.blockNumber,
      table.chainTxid
    ),
    treeRangeIndex: index('railgun_transactions_tree_range_index').on(
      table.utxoTreeOut,
      table.utxoBatchStartPositionOut
    ),
    railgunTxidSizeCheck: check(
      'railgun_transactions_txid_size_check',
      sql`length(${table.railgunTxid}) = 32`
    ),
    chainTxidSizeCheck: check(
      'railgun_transactions_chain_txid_size_check',
      sql`length(${table.chainTxid}) = 32`
    ),
    boundParamsHashSizeCheck: check(
      'railgun_transactions_bound_params_hash_size_check',
      sql`length(${table.boundParamsHash}) = 32`
    )
  })
)

/**
 * Stores commitment records indexed by hash.
 */
const commitments = sqliteTable(
  'commitments',
  {
    hash: uint8Array('hash').primaryKey().notNull(),
    commitmentType: integer('commitmentType').notNull(),
    transactionHash: uint8Array('transactionHash').notNull(),
    blockNumber: bigint('blockNumber').notNull(),
    treeNumber: integer('treeNumber').notNull(),
    treePosition: integer('treePosition').notNull(),
    // Commitment is a deeply nested object, which is hard to represent properly in sqlite, so we
    // fallback to jsonblob as we won't do any filtering by it
    commitment: msgpackBlob('commitment').notNull()
  },
  (table) => ({
    treePositionIndex: index('commitment_tree_data_index').on(
      table.treeNumber,
      table.treePosition
    ),
    transactionHashIndex: index('commitment_tx_hash_index').on(table.transactionHash),
    treePositionCheck: check('tree_position_check', sql`${table.treePosition} < 65536`)
  })
)

type DBNullifier = typeof nullifiers.$inferSelect
type DBNewNullifier = typeof nullifiers.$inferInsert
type DBMerkleTree = typeof merkleTrees.$inferSelect
type DBNewMerkleTree = typeof merkleTrees.$inferInsert
type DBUnshield = typeof unshields.$inferSelect
type DBNewUnshield = typeof unshields.$inferInsert
type DBCommitment = typeof commitments.$inferSelect
type DBNewCommitment = typeof commitments.$inferInsert
type DBRailgunTransaction = typeof railgunTransactions.$inferSelect
type DBNewRailgunTransaction = typeof railgunTransactions.$inferInsert
type DBSyncState = typeof syncState.$inferSelect
type DBNewSyncState = typeof syncState.$inferInsert
type DBSnapshotCheckpoint = typeof snapshotCheckpoints.$inferSelect
type DBNewSnapshotCheckpoint = typeof snapshotCheckpoints.$inferInsert

export type {
  DBNullifier,
  DBNewNullifier,
  DBMerkleTree,
  DBNewMerkleTree,
  DBUnshield,
  DBNewUnshield,
  DBCommitment,
  DBNewCommitment,
  DBRailgunTransaction,
  DBNewRailgunTransaction,
  DBSyncState,
  DBNewSyncState,
  DBSnapshotCheckpoint,
  DBNewSnapshotCheckpoint,
  SnapshotCheckpointTree,
}

export {
  commitments,
  nullifiers,
  merkleTrees,
  unshields,
  syncState,
  snapshotCheckpoints,
  railgunTransactions,
  bigint
}
