import { relations, sql } from 'drizzle-orm'
import { blob, check, customType, index, integer, sqliteTable } from 'drizzle-orm/sqlite-core'

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

export const tokens = sqliteTable(
  'tokens',
  {
    tokenID: blob('tokenID').notNull().primaryKey(),
    tokenSubID: blob('tokenSubID').notNull(),
    tokenType: integer('tokenType').notNull()
  }
)

export const unshields = sqliteTable(
  'unshields',
  {
    transactionHash: blob('transactionHash').notNull(),
    blockNumber: bigint('blockNumber').notNull(),
    timestamp: bigint('timestamp'),
    toAddress: blob('toAddress').notNull(),
    // token need reference to another table
    tokenID: blob('tokenID').references(() => tokens.tokenID),
    amount: bigint('amount').notNull(),
    fee: bigint('fee').notNull(),
    eventLogIndex: integer('eventLogIndex')
  },
  (table) => ({
    // Max 20 byte check on address
    toAddressCheck: check('to_address_check', sql`length(${table.toAddress}) <= 20`)
  })
)

/**
 * Creating a relation help us to recursively fetch the data without additional process from
 * our side. For e.g
 * db.query.unshields.findMany({with: {token: true}})
 */
export const unshieldsRelation = relations(unshields, ({ one }) => ({
  token: one(tokens, {
    fields: [unshields.tokenID],
    references: [tokens.tokenID]
  })
}))

// We have two choices here, either we can store whole tree as a blob, which
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
    treeNumber: integer('treeNumber').notNull(),
    leaves: blob('leaves').notNull(),
    // We need to keep track of this to make sure we append at proper place, when new leaf is added
    leafCount: integer('leafCount').notNull()
  },
  (table) => ({
    // Total memory for leaves (bytes)= 65536 * 32 //
    leavesSizeCheck: check('hashes_size_check', sql`length(${table.leaves}) = 2097152`),
    leafCountCheck: check('leaf_count_check', sql`${table.leafCount} < 65536`)
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
    treePosition: integer('treePosition').notNull()
  },
  (table) => ({
    treePositionIndex: index('commitment_tree_data_index').on(
      table.treeNumber,
      table.treePosition
    ),
    transactionHashIndex: index('commitment_tx_hash_index').on(table.transactionHash)
  })
)

export const shieldCommitments = sqliteTable('shield_commitments', {
  hash: blob('hash').primaryKey().references(() => commitments.hash, { onDelete: 'cascade' }),
  npk: blob('npk').notNull(),
  tokenID: blob('tokenID').references(() => tokens.tokenID),
  value: bigint('value').notNull(),
  fee: bigint('fee'),
  from: blob('from').notNull()
  // @TODO add encrypted bundle
})

export const transactCommitments = sqliteTable('transact_commitments', {
  hash: blob('hash').primaryKey().references(() => commitments.hash, { onDelete: 'cascade' })
})

/**
 * Create a relation between commitment table and shield/transact commitments
 * so that we can query the commitment table to fetch data from both of the table (some kind of union?)
 * E.g. query
 *  db.query.commitments.findMany({
 *      where: eq(commitments.treeNumber, 3),
 *      with: {
 *          shield: true,
 *          transact: true
 *      }
 *  })
 */
export const commitmentsRelations = relations(commitments, ({ one }) => ({
  shield: one(shieldCommitments, {
    fields: [commitments.hash],
    references: [shieldCommitments.hash]
  }),
  transact: one(transactCommitments, {
    fields: [commitments.hash],
    references: [transactCommitments.hash]
  })
}))

export type DBNullifier = typeof nullifiers.$inferSelect
export type DBNewNulliifer = typeof nullifiers.$inferInsert
export type DBMerkleTree = typeof merkleTrees.$inferSelect
export type DBNewMerkleTree = typeof merkleTrees.$inferInsert
export type DBUnshield = typeof unshields.$inferInsert
export type DBNewUnshield = typeof unshields.$inferSelect
export type DBCommitment = typeof commitments.$inferSelect
export type DBNewCommitment = typeof commitments.$inferInsert
