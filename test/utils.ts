/**
 * Test utilities and helpers for storage tests.
 */

import {
  type ChainDB,
  type NewCommitment,
  type NewMerkleNode,
  type NewNote,
  type NewNullifier,
  type NewWallet,
  type WalletDB,
  createChainDB,
  createWalletDB
} from '../src/index'

/**
 * Creates an in-memory chain database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 */
export function createTestChainDB (): ChainDB {
  const db = createChainDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: false, // In-memory doesn't need migrations
  })

  // Initialize schema tables for in-memory database
  const sqlite = db.$client

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS nullifiers (
      nullifier TEXT PRIMARY KEY NOT NULL,
      txid TEXT NOT NULL,
      block_number TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS nullifiers_block_number_idx ON nullifiers(block_number);
    CREATE INDEX IF NOT EXISTS nullifiers_tree_id_idx ON nullifiers(tree_id);

    CREATE TABLE IF NOT EXISTS merkle_nodes (
      tree_id INTEGER NOT NULL,
      level INTEGER NOT NULL,
      "index" TEXT NOT NULL,
      hash BLOB NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (tree_id, level, "index")
    );
    CREATE INDEX IF NOT EXISTS merkle_nodes_tree_level_idx ON merkle_nodes(tree_id, level);

    CREATE TABLE IF NOT EXISTS commitments (
      hash TEXT PRIMARY KEY NOT NULL,
      tree_id INTEGER NOT NULL,
      leaf_index TEXT NOT NULL,
      block_number TEXT NOT NULL,
      txid TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS commitments_tree_leaf_idx ON commitments(tree_id, leaf_index);
    CREATE INDEX IF NOT EXISTS commitments_block_number_idx ON commitments(block_number);

    CREATE TABLE IF NOT EXISTS merkle_roots (
      tree_id INTEGER NOT NULL,
      block_number TEXT NOT NULL,
      root BLOB NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (tree_id, block_number)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      chain_id INTEGER PRIMARY KEY NOT NULL,
      last_block TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `)

  return db
}

/**
 * Creates an in-memory wallet database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 */
export function createTestWalletDB (): WalletDB {
  const db = createWalletDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: false, // In-memory doesn't need migrations
  })

  // Initialize schema tables for in-memory database
  const sqlite = db.$client

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      id TEXT PRIMARY KEY NOT NULL,
      encrypted_keys BLOB NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS notes (
      commitment TEXT PRIMARY KEY NOT NULL,
      wallet_id TEXT NOT NULL,
      nullifier TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      spent INTEGER NOT NULL DEFAULT 0,
      spent_txid TEXT,
      block_number TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      leaf_index TEXT NOT NULL,
      commitment_type TEXT NOT NULL DEFAULT 'TransactCommitmentV2',
      output_type INTEGER,
      pois_per_list TEXT,
      decrypted_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS notes_wallet_spent_idx ON notes(wallet_id, spent);
    CREATE INDEX IF NOT EXISTS notes_wallet_token_idx ON notes(wallet_id, token);
    CREATE INDEX IF NOT EXISTS notes_nullifier_idx ON notes(nullifier);
    CREATE INDEX IF NOT EXISTS notes_tree_leaf_idx ON notes(tree_id, leaf_index);

    CREATE TABLE IF NOT EXISTS sent_notes (
      commitment TEXT PRIMARY KEY NOT NULL,
      wallet_id TEXT NOT NULL,
      txid TEXT NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      output_type INTEGER,
      wallet_source TEXT,
      recipient_address TEXT NOT NULL,
      commitment_type TEXT NOT NULL,
      block_number TEXT NOT NULL,
      tree_id INTEGER NOT NULL,
      leaf_index TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS sent_notes_wallet_idx ON sent_notes(wallet_id);
    CREATE INDEX IF NOT EXISTS sent_notes_txid_idx ON sent_notes(txid);

    CREATE TABLE IF NOT EXISTS balances (
      wallet_id TEXT NOT NULL,
      token TEXT NOT NULL,
      amount TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (wallet_id, token),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scan_state (
      wallet_id TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      last_scanned_block TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (wallet_id, chain_id),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tx_history (
      id TEXT PRIMARY KEY NOT NULL,
      wallet_id TEXT NOT NULL,
      type TEXT NOT NULL,
      txid TEXT NOT NULL,
      block_number TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS tx_history_wallet_block_idx ON tx_history(wallet_id, block_number);
    CREATE INDEX IF NOT EXISTS tx_history_txid_idx ON tx_history(txid);
  `)

  return db
}

/**
 * Test data factories
 */

let nullifierCounter = 0

/**
 * Creates a test nullifier record.
 * @param overrides
 */
export function createTestNullifier (overrides?: Partial<NewNullifier>): NewNullifier {
  nullifierCounter++
  return {
    nullifier: `0x${nullifierCounter.toString(16).padStart(64, '0')}`,
    txid: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    blockNumber: 1000n + BigInt(nullifierCounter),
    treeId: 0,
    ...overrides,
  }
}

let nodeCounter = 0

/**
 * Creates a test merkle node record.
 * @param overrides
 */
export function createTestMerkleNode (overrides?: Partial<NewMerkleNode>): NewMerkleNode {
  nodeCounter++
  return {
    treeId: 0,
    level: 0,
    index: BigInt(nodeCounter),
    hash: Buffer.from(nodeCounter.toString(16).padStart(64, '0'), 'hex'),
    ...overrides,
  }
}

let commitmentCounter = 0

/**
 * Creates a test commitment record.
 * @param overrides
 */
export function createTestCommitment (
  overrides?: Partial<NewCommitment>
): NewCommitment {
  commitmentCounter++
  return {
    hash: `0x${commitmentCounter.toString(16).padStart(64, '0')}`,
    treeId: 0,
    leafIndex: BigInt(commitmentCounter),
    blockNumber: 1000n + BigInt(commitmentCounter),
    txid: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    ...overrides,
  }
}

let walletCounter = 0

/**
 * Creates a test wallet record.
 * @param overrides
 */
export function createTestWallet (overrides?: Partial<NewWallet>): NewWallet {
  walletCounter++
  return {
    id: `wallet-${walletCounter}`,
    encryptedKeys: Buffer.from('encrypted-keys-placeholder'),
    name: `Test Wallet ${walletCounter}`,
    ...overrides,
  }
}

let noteCounter = 0

/**
 * Creates a test note record.
 * @param overrides
 */
export function createTestNote (overrides?: Partial<NewNote>): NewNote {
  noteCounter++
  return {
    commitment: `0x${noteCounter.toString(16).padStart(64, '0')}`,
    walletId: 'wallet-1',
    nullifier: `0xn${noteCounter.toString(16).padStart(63, '0')}`,
    token: '0x0000000000000000000000000000000000000000', // ETH
    amount: 1000000000000000000n, // 1 ETH
    spent: false,
    blockNumber: 1000n + BigInt(noteCounter),
    treeId: 0,
    leafIndex: BigInt(noteCounter),
    ...overrides,
  }
}

/**
 * Resets test counters (for test isolation).
 */
export function resetTestCounters (): void {
  nullifierCounter = 0
  nodeCounter = 0
  commitmentCounter = 0
  walletCounter = 0
  noteCounter = 0
}
