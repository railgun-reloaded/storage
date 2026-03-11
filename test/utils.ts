/**
 * Test utilities and helpers for storage tests.
 */

import crypto from 'crypto'

import type {
  ChainDB, DBNewCommitment, DBNewNulliifer, DBNewUnshield,
  WalletDB
} from '../src/index'
import {
  // type NewCommitment,
  // type NewMerkleNode,
  // type NewNote,
  // type NewNullifier,
  // type NewWallet,
  createChainDB,
  createWalletDB
} from '../src/index'

enum CommitmentType {
  ShieldCommitment = 0,
  TransactCommitment = 1
}

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

function randomBytes (byteSize: number) : Uint8Array {
  return Uint8Array.from(crypto.randomBytes(byteSize))
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
 * @returns - Array of generated test nullifiers
 */
export function createTestNullifiers (count: number, startBlock?: bigint): DBNewNulliifer[] {
  const result = []
  for (let i = 0; i < count; ++i) {
    result.push({
      nullifier: randomBytes(32),
      transactionHash: randomBytes(32),
      blockNumber: (startBlock ?? 1000n) + BigInt(i),
      treeNumber: 0,
    })
  }
  return result
}

export function createTestMerkleTreeLeaves () {
  const leaves = new Uint8Array(65536 * 32)
  for (let i = 0; i < 65536; ++i) {
    leaves.set(randomBytes(32), i * 32)
  }
  return leaves
}

/**
 * Creates a test commitment record.
 * @param count - Number of test commitments to generate
 * @param startBlock - Optional startBlock
 * @returns - Array of generated test commitments
 */
export function createTestShieldCommitments (count: number, startBlock? : bigint): DBNewCommitment[] {
  const shieldCommitments = new Array<DBNewCommitment>()
  for (let i = 0; i < count; ++i) {
    const tokenID = randomBytes(32)

    const token = {
      tokenID,
      tokenSubID: randomBytes(32),
      tokenType: 0
    }

    shieldCommitments.push({
      transactionHash: randomBytes(32),
      blockNumber: startBlock ?? (100n + BigInt(i)),
      treeNumber: 0,
      hash: randomBytes(32),
      commitmentType: CommitmentType.ShieldCommitment,
      treePosition: i,
      commitment: {
        encryptedBundle: [
          randomBytes(32),
          randomBytes(32),
          randomBytes(32)
        ],
        fee: null,
        preimage: {
          npk: randomBytes(32),
          value: '1000n',
          token,

        },
        from: randomBytes(32),
      }
    })
  }
  return shieldCommitments
}

export function createTestTransactCommitments (count: number, startBlock?: bigint) {
  const transactCommitments = new Array<DBNewCommitment>()
  for (let i = 0; i < count; ++i) {
    transactCommitments.push({
      transactionHash: randomBytes(32),
      blockNumber: startBlock ?? (100n + BigInt(i)),
      treeNumber: 0,
      hash: randomBytes(32),
      commitmentType: CommitmentType.TransactCommitment,
      treePosition: i,
      commitment: {
        annotationData: randomBytes(64),
        blindedReceiverViewingKey: randomBytes(32),
        blindedSenderViewingKey: randomBytes(32),
        ciphertext: {
          data: [
            randomBytes(32),
            randomBytes(32),
            randomBytes(32)
          ],
          iv: randomBytes(32),
          tag: randomBytes(32)
        },
        memo: [
          randomBytes(32)
        ]
      }
    })
  }
  return transactCommitments
}

export function createTestUnshields (count: number, startBlock?: bigint) : DBNewUnshield[] {
  const result = new Array<DBNewUnshield>()

  const transactionHash = randomBytes(32)
  for (let i = 0; i < count; ++i) {
    result.push({
      id: Buffer.from(transactionHash).toString('hex') + '-' + i,
      transactionHash,
      blockNumber: startBlock ?? (100n + BigInt(i)),
      timestamp: 0n,
      toAddress: randomBytes(20),
      token: {
        tokenID: randomBytes(32),
        tokenSubID: randomBytes(32),
        tokenType: 0,
      },
      amount: 10000n,
      fee: 1000n,
      eventLogIndex: i
    })
  }
  return result
}

export function shuffleArray (arr: any[]) {
  return arr
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
}

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
