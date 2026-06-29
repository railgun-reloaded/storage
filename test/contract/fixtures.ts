import type {
  DBNewCommitment,
  DBNewNote,
  DBNewNullifier,
  DBNewRailgunTransaction,
  DBNewUnshield,
  DBNewWallet,
} from '../../src/index.js'

const MERKLE_TREE_BYTE_LENGTH = (65536 + 65535) * 32

/**
 * Generate random bytes using the Web Crypto API available in Node and browsers.
 * @param byteSize - Number of random bytes to generate.
 * @returns A Uint8Array of the requested length.
 */
function randomBytes (byteSize: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(byteSize))
}

/**
 * Build a batch of test nullifiers with ascending block numbers.
 * @param count - Number of nullifiers to create.
 * @param startBlock - Starting block height (default `1000n`).
 * @returns Array of new nullifier records.
 */
function createTestNullifiers (count: number, startBlock: bigint = 1000n): DBNewNullifier[] {
  const result: DBNewNullifier[] = []
  for (let i = 0; i < count; ++i) {
    result.push({
      nullifier: randomBytes(32),
      transactionHash: randomBytes(32),
      blockNumber: startBlock + BigInt(i),
      treeNumber: 0,
    })
  }
  return result
}

/**
 * Build a batch of test shield commitments with ascending tree positions.
 * @param count - Number of commitments to create.
 * @param startBlock - Starting block height (default `100n`).
 * @returns Array of new commitment records.
 */
function createTestCommitments (count: number, startBlock: bigint = 100n): DBNewCommitment[] {
  const result: DBNewCommitment[] = []
  for (let i = 0; i < count; ++i) {
    result.push({
      transactionHash: randomBytes(32),
      blockNumber: startBlock + BigInt(i),
      treeNumber: 0,
      hash: randomBytes(32),
      commitmentType: 0,
      treePosition: i,
      commitment: {
        encryptedBundle: [randomBytes(32), randomBytes(32), randomBytes(32)],
        fee: 1000n,
        preimage: {
          npk: randomBytes(32),
          value: 1000n,
          token: { tokenID: randomBytes(32), tokenSubID: randomBytes(32), tokenType: 0 },
        },
        from: randomBytes(32),
      },
    })
  }
  return result
}

/**
 * Build a batch of test unshield events sharing one transaction hash.
 * @param count - Number of unshields to create.
 * @param startBlock - Starting block height (default `100n`).
 * @returns Array of new unshield records.
 */
function createTestUnshields (count: number, startBlock: bigint = 100n): DBNewUnshield[] {
  const transactionHash = randomBytes(32)
  const result: DBNewUnshield[] = []
  for (let i = 0; i < count; ++i) {
    result.push({
      transactionHash,
      blockNumber: startBlock + BigInt(i),
      timestamp: 0n,
      toAddress: randomBytes(20),
      token: { tokenID: randomBytes(32), tokenSubID: randomBytes(32), tokenType: 0 },
      amount: 10000n,
      fee: 1000n,
      eventLogIndex: i,
    })
  }
  return result
}

/**
 * Build serialized Merkle tree leaves of the exact byte length the schema check
 * constraint requires.
 * @returns A Uint8Array of valid Merkle tree leaf bytes.
 */
function createTestMerkleTreeLeaves (): Uint8Array {
  const tree = new Uint8Array(MERKLE_TREE_BYTE_LENGTH)
  for (let i = 0; i < 65536; ++i) {
    tree.set(randomBytes(32), i * 32)
  }
  return tree
}

/**
 * Build a single test Railgun transaction whose output batch covers a span of
 * commitment positions.
 * @param overrides - Optional fields to override on the generated record.
 * @returns A new Railgun transaction record.
 */
function createTestRailgunTransaction (overrides?: Partial<DBNewRailgunTransaction>): DBNewRailgunTransaction {
  return {
    railgunTxid: randomBytes(32),
    txidVersion: 0,
    chainTxid: randomBytes(32),
    blockNumber: 100n,
    timestamp: 0n,
    nullifiers: [randomBytes(32)],
    commitments: [randomBytes(32), randomBytes(32)],
    boundParamsHash: randomBytes(32),
    hasUnshield: false,
    utxoTreeIn: 0,
    utxoTreeOut: 0,
    utxoBatchStartPositionOut: 0,
    ...overrides,
  }
}

let walletCounter = 0

/**
 * Build a test wallet record with a unique id.
 * @param overrides - Optional fields to override on the generated record.
 * @returns A new wallet record.
 */
function createTestWallet (overrides?: Partial<DBNewWallet>): DBNewWallet {
  walletCounter++
  return {
    id: `wallet-${walletCounter}`,
    encryptedKeys: randomBytes(32),
    name: `Test Wallet ${walletCounter}`,
    ...overrides,
  }
}

let noteCounter = 0

/**
 * Build a test note record with a unique commitment and nullifier.
 * @param overrides - Optional fields to override on the generated record.
 * @returns A new note record.
 */
function createTestNote (overrides?: Partial<DBNewNote>): DBNewNote {
  noteCounter++
  const commitment = new Uint8Array(32)
  const nullifier = new Uint8Array(32)
  const tag = noteCounter
  commitment[31] = tag & 0xff
  commitment[30] = (tag >> 8) & 0xff
  nullifier[31] = tag & 0xff
  nullifier[30] = (tag >> 8) & 0xff
  nullifier[0] = 0xee
  return {
    commitment,
    walletId: 'wallet-1',
    chainId: 1,
    nullifier,
    token: '0x0000000000000000000000000000000000000000',
    amount: 1000000000000000000n,
    spent: false,
    blockNumber: 1000n + BigInt(noteCounter),
    treeNumber: 0,
    treePosition: noteCounter,
    commitmentType: 0,
    ...overrides,
  }
}

/**
 * Reset the wallet and note counters so independent tests stay isolated.
 */
function resetFixtureCounters (): void {
  walletCounter = 0
  noteCounter = 0
}

export {
  randomBytes,
  createTestNullifiers,
  createTestCommitments,
  createTestUnshields,
  createTestMerkleTreeLeaves,
  createTestRailgunTransaction,
  createTestWallet,
  createTestNote,
  resetFixtureCounters,
}
