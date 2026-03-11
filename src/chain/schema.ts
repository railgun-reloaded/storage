import { sql } from 'drizzle-orm'
import { blob, check, customType, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { pack, unpack } from 'msgpack'

const bigint = customType<{ data: bigint; driverData: string }>({
  dataType () {
    return 'text'
  },
  toDriver (value: bigint): string {
    return value.toString(16).padStart(64, '0')
  },
  fromDriver (value: string): bigint {
    return BigInt(`0x${value}`)
  },
})

const msgpackBlob = customType<{ data: any; driverData: Buffer }>({
  dataType () {
    return 'blob'
  },

  toDriver (value: any) {
    return pack(value)
  },
  fromDriver (value: Buffer) {
    return unpack(value)
  }
})

export const nullifiers = sqliteTable(
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

export const unshields = sqliteTable(
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
// it so that we can reconstruct it later
//         OR
// We can store treePosition and treeIndex of all the commitments
// and reconstruct everytime.
// Going with first option for now, open to argument

export const merkleTrees = sqliteTable(
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
export const syncState = sqliteTable(
  'sync_states',
  {
    chainID: integer('chain_id').primaryKey().notNull(),
    lastBlockHeight: bigint('last_block_height').notNull(),
  }
)

export const commitments = sqliteTable(
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

export type DBNullifier = typeof nullifiers.$inferSelect
export type DBNewNulliifer = typeof nullifiers.$inferInsert
export type DBMerkleTree = typeof merkleTrees.$inferSelect
export type DBNewMerkleTree = typeof merkleTrees.$inferInsert
export type DBUnshield = typeof unshields.$inferInsert
export type DBNewUnshield = typeof unshields.$inferSelect
export type DBCommitment = typeof commitments.$inferSelect
export type DBNewCommitment = typeof commitments.$inferInsert
export type DBShieldCommitment = typeof commitments.$inferSelect

// export type DBNewToken = typeof tokens.$inferInsert
// export type DBToken = typeof tokens.$inferSelect
