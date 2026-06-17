/**
 * Test utilities and helpers for storage tests.
 */

import crypto from 'crypto'

import { hexToBytes } from '@railgun-reloaded/bytes'

import type {
  DBNewCommitment, DBNewNote, DBNewNullifier, DBNewUnshield,
  DBNewWallet,
} from '../src/index'
import type {
  ChainDB,
  WalletDB,
} from '../src/node'
import {
  createChainDB,
  createWalletDB,
} from '../src/node'

enum CommitmentType {
  ShieldCommitment = 0,
  TransactCommitment = 1
}

/**
 * Creates an in-memory chain database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 * @returns - ChainDB Instance
 */
async function createTestChainDB (): Promise<ChainDB> {
  // We still need to run db:generate command even though we are making in-memory database
  // This prevent us from manually writing query to generate the table and allow us to
  // directly migration from existing file.
  const db = await createChainDB({
    path: ':memory:',
    runMigrations: true,
    verbose: false,
  })
  return db
}

/**
 * Generate a random bytes of given byte size.
 * @param byteSize - Total number of random bytes to generate.
 * @returns - Uint8Array representation of random bytes of given byteSize.
 */
function randomBytes (byteSize: number) : Uint8Array {
  return Uint8Array.from(crypto.randomBytes(byteSize))
}

/**
 * Creates an in-memory wallet database for testing.
 * Initializes schema tables manually since migrations don't run for :memory:.
 * @returns - WalletDB Instane
 */
async function createTestWalletDB (): Promise<WalletDB> {
  const db = await createWalletDB({
    path: ':memory:',
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
 * @returns - Array of random generated test nullifiers
 */
function createTestNullifiers (count: number, startBlock?: bigint): DBNewNullifier[] {
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

/**
 * Create Test MerkleTree leaves. All the leaves of depth 16
 * are generated and kept in single Uint8Array
 * @returns - random merkleTree leaves stored in Uint8Array
 */
function createTestMerkleTree () {
  const totalNodes = 65536 + 65535
  const tree = new Uint8Array(totalNodes * 32)
  for (let i = 0; i < 65536; ++i) {
    tree.set(randomBytes(32), i * 32)
  }
  return tree
}

/**
 * Creates a test commitment record.
 * @param count - Number of test commitments to generate.
 * @param startBlock - Optional startBlock.
 * @returns - Array of generated test commitments.
 */
function createTestShieldCommitments (count: number, startBlock? : bigint): DBNewCommitment[] {
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
        fee: 1000n,
        preimage: {
          npk: randomBytes(32),
          value: 1000n,
          token,

        },
        from: randomBytes(32),
      }
    })
  }
  return shieldCommitments
}

/**
 * Generate a test Transact commitments.
 * @param count - Total number of random transact commitments to generate.
 * @param startBlock - Starting block which is incremented each time a new commitment is generated.
 * @returns - Array of random generated test commitments.
 */
function createTestTransactCommitments (count: number, startBlock?: bigint) {
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

/**
 * Create randomized unshields.
 * @param count - Total number of random unshields to generate.
 * @param startBlock - Starting block which is incremented each time a new commitment is generated.
 * @returns - Array of random generated test unshields.
 */
function createTestUnshields (count: number, startBlock?: bigint) : DBNewUnshield[] {
  const result = new Array<DBNewUnshield>()

  const transactionHash = randomBytes(32)
  for (let i = 0; i < count; ++i) {
    result.push({
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

/**
 * Randomly shuffle a given input array
 * @param arr - Input array to shuffle
 * @returns - Randomly shuffled input array
 */
function shuffleArray (arr: any[]) {
  return arr
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
}

let walletCounter = 0
/**
 * Creates a test wallet record.
 * @param overrides - Optional properties to override the default wallet fields.
 * @returns - A newly generated test wallet
 */
function createTestWallet (overrides?: Partial<DBNewWallet>): DBNewWallet {
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
 * @param overrides - Optional properties to override default note fields
 * @returns - Generated test note
 */
function createTestNote (overrides?: Partial<DBNewNote>): DBNewNote {
  noteCounter++
  return {
    commitment: hexToBytes(`0x${noteCounter.toString(16).padStart(64, '0')}`),
    walletId: 'wallet-1',
    chainId: 1,
    nullifier: hexToBytes(`0xee${noteCounter.toString(16).padStart(62, '0')}`),
    token: '0x0000000000000000000000000000000000000000', // ETH
    amount: 1000000000000000000n, // 1 ETH
    spent: false,
    blockNumber: 1000n + BigInt(noteCounter),
    treeNumber: 0,
    treePosition: noteCounter,
    commitmentType: CommitmentType.ShieldCommitment,
    ...overrides,
  }
}

/**
 * Resets test counters (for test isolation).
 */
function resetTestCounters (): void {
  walletCounter = 0
  noteCounter = 0
}

export {
  createTestChainDB,
  createTestWalletDB,
  createTestNullifiers,
  createTestMerkleTree,
  createTestShieldCommitments,
  createTestTransactCommitments,
  createTestUnshields,
  shuffleArray,
  createTestWallet,
  createTestNote,
  resetTestCounters,
  hexToBytes
}
