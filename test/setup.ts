/**
 * Test utilities and helpers for storage tests.
 */

import { createChainDB, createWalletDB, type ChainDB, type WalletDB } from '../src/index';
import type {
  NewNullifier,
  NewMerkleNode,
  NewCommitment,
  NewWallet,
  NewNote,
} from '../src/index';

/**
 * Creates an in-memory chain database for testing.
 */
export function createTestChainDB(): ChainDB {
  return createChainDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: false, // In-memory doesn't need migrations
  });
}

/**
 * Creates an in-memory wallet database for testing.
 */
export function createTestWalletDB(): WalletDB {
  return createWalletDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: false, // In-memory doesn't need migrations
  });
}

/**
 * Test data factories
 */

let nullifierCounter = 0;

/**
 * Creates a test nullifier record.
 */
export function createTestNullifier(overrides?: Partial<NewNullifier>): NewNullifier {
  nullifierCounter++;
  return {
    nullifier: `0x${nullifierCounter.toString(16).padStart(64, '0')}`,
    txid: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    blockNumber: 1000n + BigInt(nullifierCounter),
    treeId: 0,
    ...overrides,
  };
}

let nodeCounter = 0;

/**
 * Creates a test merkle node record.
 */
export function createTestMerkleNode(overrides?: Partial<NewMerkleNode>): NewMerkleNode {
  nodeCounter++;
  return {
    treeId: 0,
    level: 0,
    index: BigInt(nodeCounter),
    hash: Buffer.from(nodeCounter.toString(16).padStart(64, '0'), 'hex'),
    ...overrides,
  };
}

let commitmentCounter = 0;

/**
 * Creates a test commitment record.
 */
export function createTestCommitment(
  overrides?: Partial<NewCommitment>
): NewCommitment {
  commitmentCounter++;
  return {
    hash: `0x${commitmentCounter.toString(16).padStart(64, '0')}`,
    treeId: 0,
    leafIndex: BigInt(commitmentCounter),
    blockNumber: 1000n + BigInt(commitmentCounter),
    txid: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
    ...overrides,
  };
}

let walletCounter = 0;

/**
 * Creates a test wallet record.
 */
export function createTestWallet(overrides?: Partial<NewWallet>): NewWallet {
  walletCounter++;
  return {
    id: `wallet-${walletCounter}`,
    encryptedKeys: Buffer.from('encrypted-keys-placeholder'),
    name: `Test Wallet ${walletCounter}`,
    ...overrides,
  };
}

let noteCounter = 0;

/**
 * Creates a test note record.
 */
export function createTestNote(overrides?: Partial<NewNote>): NewNote {
  noteCounter++;
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
  };
}

/**
 * Populates a chain database with test data.
 */
export function populateChainDB(db: ChainDB, count: number = 10): void {
  const nullifiersList = Array.from({ length: count }, () => createTestNullifier());
  const nodesList = Array.from({ length: count }, () => createTestMerkleNode());
  const commitmentsList = Array.from({ length: count }, () => createTestCommitment());

  db.transaction(() => {
    for (const nullifier of nullifiersList) {
      db.insert(db._.schema!.nullifiers).values(nullifier).run();
    }
    for (const node of nodesList) {
      db.insert(db._.schema!.merkleNodes).values(node).run();
    }
    for (const commitment of commitmentsList) {
      db.insert(db._.schema!.commitments).values(commitment).run();
    }
  });
}

/**
 * Populates a wallet database with test data.
 */
export function populateWalletDB(db: WalletDB, walletId: string, noteCount: number = 10): void {
  const wallet = createTestWallet({ id: walletId });
  const notesList = Array.from({ length: noteCount }, () =>
    createTestNote({ walletId })
  );

  db.transaction(() => {
    db.insert(db._.schema!.wallets).values(wallet).run();
    for (const note of notesList) {
      db.insert(db._.schema!.notes).values(note).run();
    }
  });
}

/**
 * Resets test counters (for test isolation).
 */
export function resetTestCounters(): void {
  nullifierCounter = 0;
  nodeCounter = 0;
  commitmentCounter = 0;
  walletCounter = 0;
  noteCounter = 0;
}
