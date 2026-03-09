/**
 * Test utilities and helpers for storage tests.
 */

import crypto from 'crypto'

import type { ChainDB, DBNewNulliifer, WalletDB } from '../src/index'
import {
  // type NewCommitment,
  // type NewMerkleNode,
  // type NewNote,
  // type NewNullifier,
  // type NewWallet,
  createChainDB,
  createWalletDB
} from '../src/index'

/**
 * Creates an in-memory chain database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 */
export function createTestChainDB (): ChainDB {
  // We still need to run db:generate command even though we are making in-memory database
  // This prevent us from manually writing query to generate the table and allow us to
  // directly migration from existing file
  const db = createChainDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: true,
    verbose: false,
  })
  return db
}

function randomHex (byteSize: number) : Uint8Array {
  return crypto.randomBytes(byteSize)
}

/**
 * Creates an in-memory wallet database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 */
export function createTestWalletDB (): WalletDB {
  const db = createWalletDB({
    path: ':memory:',
    enableWAL: false,
    runMigrations: true,
  })

  return db
}

/**
 * Test data factories
 */

/**
 * Creates a test nullifier record.
 * @param count - Number of test nullifiers to create
 * @param startBlock - Optionally specify the starting block of nullifiers
 */
export function createTestNullifiers (count: number, startBlock?: bigint): DBNewNulliifer[] {
  const result = []
  for (let i = 0; i < count; ++i) {
    result.push({
      nullifier: randomHex(32),
      transactionHash: randomHex(32),
      blockNumber: (startBlock ?? 1000n) + BigInt(i),
      treeNumber: 0,
    })
  }
  return result
}

export function createTestMerkleTreeLeaves () {
  const leaves = new Uint8Array(65536 * 32)
  for (let i = 0; i < 65536; ++i) {
    leaves.set(randomHex(32), i * 32)
  }
  return leaves
}

// let nodeCounter = 0

// /**
//  * Creates a test merkle node record.
//  * @param overrides
//  */
// export function createTestMerkleNode (overrides?: Partial<NewMerkleNode>): NewMerkleNode {
//   nodeCounter++
//   return {
//     treeId: 0,
//     level: 0,
//     index: BigInt(nodeCounter),
//     hash: Buffer.from(nodeCounter.toString(16).padStart(64, '0'), 'hex'),
//     ...overrides,
//   }
// }

// let commitmentCounter = 0

// /**
//  * Creates a test commitment record.
//  * @param overrides
//  */
// export function createTestCommitment (
//   overrides?: Partial<NewCommitment>
// ): NewCommitment {
//   commitmentCounter++
//   return {
//     hash: `0x${commitmentCounter.toString(16).padStart(64, '0')}`,
//     treeId: 0,
//     leafIndex: BigInt(commitmentCounter),
//     blockNumber: 1000n + BigInt(commitmentCounter),
//     txid: `0x${Math.random().toString(16).slice(2).padStart(64, '0')}`,
//     ...overrides,
//   }
// }

// let walletCounter = 0

// /**
//  * Creates a test wallet record.
//  * @param overrides
//  */
// export function createTestWallet (overrides?: Partial<NewWallet>): NewWallet {
//   walletCounter++
//   return {
//     id: `wallet-${walletCounter}`,
//     encryptedKeys: Buffer.from('encrypted-keys-placeholder'),
//     name: `Test Wallet ${walletCounter}`,
//     ...overrides,
//   }
// }

// let noteCounter = 0

// /**
//  * Creates a test note record.
//  * @param overrides
//  */
// export function createTestNote (overrides?: Partial<NewNote>): NewNote {
//   noteCounter++
//   return {
//     commitment: `0x${noteCounter.toString(16).padStart(64, '0')}`,
//     walletId: 'wallet-1',
//     nullifier: `0xn${noteCounter.toString(16).padStart(63, '0')}`,
//     token: '0x0000000000000000000000000000000000000000', // ETH
//     amount: 1000000000000000000n, // 1 ETH
//     spent: false,
//     blockNumber: 1000n + BigInt(noteCounter),
//     treeId: 0,
//     leafIndex: BigInt(noteCounter),
//     ...overrides,
//   }
// }

// /**
//  * Resets test counters (for test isolation).
//  */
// export function resetTestCounters (): void {
//   nullifierCounter = 0
//   nodeCounter = 0
//   commitmentCounter = 0
//   walletCounter = 0
//   noteCounter = 0
// }
