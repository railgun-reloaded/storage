import assert from 'node:assert'
import { test } from 'node:test'

import type { DBNewRailgunTransaction } from '../../src'
import {
  getRailgunTransactionByTxid,
  getRailgunTransactionsByBlockRange,
  getRailgunTransactionsByTreeRange,
  getSyncState,
  getTxidSyncCursor,
  insertRailgunTransactions,
  setTxidSyncCursor,
  updateSyncState
} from '../../src'
import { createTestChainDB } from '../utils'

/**
 * Build deterministic fixed-length bytes for Railgun transaction fixtures.
 * @param value - Byte value.
 * @returns 32-byte array filled with value.
 */
function bytes32 (value: number): Uint8Array {
  return new Uint8Array(32).fill(value)
}

/**
 * Build a Railgun transaction row with stable defaults.
 * @param value - Byte value used for unique byte fields.
 * @param overrides - Optional row overrides.
 * @returns New Railgun transaction row.
 */
function railgunTransaction (
  value: number,
  overrides: Partial<DBNewRailgunTransaction> = {}
): DBNewRailgunTransaction {
  return {
    railgunTxid: bytes32(value),
    txidVersion: 2,
    chainTxid: bytes32(value + 1),
    graphID: null,
    blockNumber: 100n + BigInt(value),
    timestamp: 1000n + BigInt(value),
    nullifiers: [bytes32(value + 2)],
    commitments: [bytes32(value + 3), bytes32(value + 4)],
    boundParamsHash: bytes32(value + 5),
    hasUnshield: false,
    unshield: null,
    utxoTreeIn: 0,
    utxoTreeOut: 1,
    utxoBatchStartPositionOut: value,
    verificationHash: null,
    ...overrides,
  }
}

test('Railgun transactions: insert and query by txid and block range', async () => {
  const db = await createTestChainDB()
  const rows = [
    railgunTransaction(1, { blockNumber: 110n }),
    railgunTransaction(10, {
      blockNumber: 120n,
      hasUnshield: true,
      unshield: {
        to: bytes32(90),
        token: {
          id: bytes32(91),
          tokenType: 'ERC20',
          tokenSubID: new Uint8Array([0]),
          tokenAddress: bytes32(92),
        },
        value: 5n,
      },
    }),
  ]

  assert.equal(await insertRailgunTransactions(db, rows), 2)

  const byTxid = await getRailgunTransactionByTxid(db, rows[1]!.railgunTxid)
  const byBlock = await getRailgunTransactionsByBlockRange(db, 100n, 130n)

  assert.deepStrictEqual(byTxid, rows[1])
  assert.equal(byBlock.length, 2)
  assert.deepStrictEqual(
    byBlock.find(row => Buffer.from(row.railgunTxid).equals(Buffer.from(rows[1]!.railgunTxid))),
    byTxid
  )
})

test('Railgun transactions: query by output tree range', async () => {
  const db = await createTestChainDB()
  const rows = [
    railgunTransaction(1, { utxoTreeOut: 0, utxoBatchStartPositionOut: 2 }),
    railgunTransaction(2, { utxoTreeOut: 0, utxoBatchStartPositionOut: 8 }),
    railgunTransaction(3, { utxoTreeOut: 1, utxoBatchStartPositionOut: 4 }),
  ]

  await insertRailgunTransactions(db, rows)
  const result = await getRailgunTransactionsByTreeRange(db, 0, 1, 8)

  assert.equal(result.length, 2)
  assert.deepStrictEqual(result.map(row => row.railgunTxid), [
    rows[0]!.railgunTxid,
    rows[1]!.railgunTxid,
  ])
})

test('Railgun transactions: duplicate txid insert is ignored', async () => {
  const db = await createTestChainDB()
  const original = railgunTransaction(1, { blockNumber: 100n })
  const duplicate = railgunTransaction(1, { blockNumber: 999n, chainTxid: bytes32(99) })

  assert.equal(await insertRailgunTransactions(db, [original]), 1)
  assert.equal(await insertRailgunTransactions(db, [duplicate]), 0)

  const stored = await getRailgunTransactionByTxid(db, original.railgunTxid)
  assert.deepStrictEqual(stored, original)
})

test('Railgun transactions: txid cursor is independent from scan cursor', async () => {
  const db = await createTestChainDB()

  assert.equal(await getTxidSyncCursor(db, 11155111), 0n)
  assert.equal(await updateSyncState(db, 11155111, 200n), 1)
  assert.equal((await getSyncState(db, 11155111))?.lastBlockHeight, 200n)
  assert.equal(await getTxidSyncCursor(db, 11155111), 0n)

  assert.equal(await setTxidSyncCursor(db, 11155111, 150n), 1)
  assert.equal((await getSyncState(db, 11155111))?.lastBlockHeight, 200n)
  assert.equal(await getTxidSyncCursor(db, 11155111), 150n)
})
