/**
 * Chain database schema definitions.
 *
 * This file defines tables used to store public blockchain state, including
 * nullifiers, commitments, Merkle trees, and sync status.  Custom types are
 * provided to handle bigint and msgpack serialization.
 */
import { sql } from 'drizzle-orm'
import { blob, check, customType, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { pack, unpack } from 'msgpack'
/**
 * The default bigint support in SQLite does not handle range filtering
 * correctly. For example, querying for values between `1000n` and `2000n`
 * may perform lexicographical comparisons and miss some rows. To mitigate
 * this, we store big integers as hexadecimal-encoded text strings.
 */
const bigint = customType<{ data: bigint; driverData: string }>({
  /**
   * Define the underling database column as text
   * @returns - SQLite text type in string format
   */
  dataType () {
    return 'text'
  },
  /**
   * Convert a JavaScript bigint to a hex‑encoded string.
   * @param value - Input bigint value to convert.
   * @returns Serialized hex string representation of the value.
   */
  toDriver (value: bigint): string {
    return value.toString(16).padStart(64, '0')
  },
  /**
   * Convert a hex string back to a JavaScript bigint.
   * @param value - The hex string retrieved from the SQLite table.
   * @returns Deserialized bigint value.
   */
  fromDriver (value: string): bigint {
    return BigInt(`0x${value}`)
  },
})

const msgpackBlob = customType<{ data: any; driverData: Buffer }>({
/**
 * Defines the underlying database column type as a BLOB.
 * @returns - SQLite blob type in string format.
 */
  dataType () {
    return 'blob'
  },

  /**
   * Converts javascript value to a MessagePack-encoded Buffer.
   * @param value - Input application side value to serialize.
   * @returns - The serialized MessagePack binary data.
   */
  toDriver (value: any) {
    return pack(value)
  },
  /**
   * Converts the database BLOB back into its original JavaScript value.
   * @param value - The Buffer retrieved from the SQLite BLOB column.
   * @returns - The deserialized JavaScript object or value.
   */
  fromDriver (value: Buffer) {
    return unpack(value)
  }
})

/**
 * Stores spent nullifiers observed on the chain.
 */
const nullifiers = sqliteTable(
  'nullifiers',
  {
    nullifier: blob('nullifier').primaryKey().notNull(),
    // Optional
    transactionHash: blob('transaction_hash').notNull(),
    // Optional
    blockNumber: bigint('block_number').notNull(),
    treeNumber: integer('tree_number').notNull()
  },
  (table) => ({
    blockNumberIndex: index('nullifers_block_number_index').on(table.blockNumber),
    treeNumberIndex: index('nullifiers_tree_number_index').on(table.treeNumber),
    // Optional 32 bytes constraint on nullifier
    nullifierSizeCheck: check('nullifier_size_check', sql`length(${table.nullifier}) = 32`)
  })
)

/**
 * Records unshield events from the chain.
 */
const unshields = sqliteTable(
  'unshields',
  {
    id: text('id').primaryKey(),
    transactionHash: blob('transactionHash').notNull(),
    blockNumber: bigint('blockNumber').notNull(),
    timestamp: bigint('timestamp').notNull(),
    toAddress: blob('toAddress').notNull(),
    // token need reference to another table
    token: msgpackBlob('token'),
    amount: bigint('amount').notNull(),
    fee: bigint('fee').notNull(),
    eventLogIndex: integer('eventLogIndex').notNull()
  },
  (table) => ({
    // Max 20 byte check on address
    toAddressCheck: check('to_address_check', sql`length(${table.toAddress}) <= 20`)
  })
)

// We have two choices here, either we can store whole tree as a uint8Array, which
// should be roughly 4mb, it should be loaded directly into the memory and can
// be appended to tree without any issue. Only serialization of whole tree and
// deserialization. Application keep tracks of duplicate, we just use table to store
// it so that we can reconstruct it later.
//         OR
// We can store treePosition and treeIndex of all the commitments
// and reconstruct everytime.

/**
 * Stores serialized Merkle tree leaf data for each tree number.
 */
const merkleTrees = sqliteTable(
  'merkle_trees',
  {
    treeNumber: integer('treeNumber').primaryKey().notNull(),
    leaves: blob('leaves').notNull(),
    // We need to keep track of this to make sure we append at proper place, when new leaf is added
    leafCount: integer('leafCount').notNull()
  },
  (table) => ({
    // Total memory for leaves (bytes)= 65536 * 32 //
    leavesSizeCheck: check('hashes_size_check', sql`length(${table.leaves}) = 2097152`),
    leafCountCheck: check('leaf_count_check', sql`${table.leafCount} <= 65536`)
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
  }
)

/**
 * Stores commitment records indexed by hash.
 */
const commitments = sqliteTable(
  'commitments',
  {
    hash: blob('hash').primaryKey().notNull(),
    commitmentType: integer('commitmentType').notNull(),
    transactionHash: blob('transactionHash').notNull(),
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
type DBNewNulliifer = typeof nullifiers.$inferInsert
type DBMerkleTree = typeof merkleTrees.$inferSelect
type DBNewMerkleTree = typeof merkleTrees.$inferInsert
type DBUnshield = typeof unshields.$inferInsert
type DBNewUnshield = typeof unshields.$inferSelect
type DBCommitment = typeof commitments.$inferSelect
type DBNewCommitment = typeof commitments.$inferInsert

export type {
  DBNullifier,
  DBNewNulliifer,
  DBMerkleTree,
  DBNewMerkleTree,
  DBUnshield,
  DBNewUnshield,
  DBCommitment,
  DBNewCommitment,
}

export { commitments, nullifiers, merkleTrees, unshields, syncState, bigint }

// export type DBNewToken = typeof tokens.$inferInsert
// export type DBToken = typeof tokens.$inferSelect
