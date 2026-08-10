import assert from 'node:assert'
import { test } from 'node:test'

import {
  getRailgunTransactionByTxid,
  getRailgunTransactionsByBlockRange,
  insertRailgunTransactions,
} from '../../src/chain/queries.js'
import type { DBNewRailgunTransaction } from '../../src/chain/schema.js'
import { createTestChainDB } from '../utils.js'

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

test('Railgun transaction payloads survive a database round-trip', async () => {
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

  await insertRailgunTransactions(db, rows)

  const byTxid = await getRailgunTransactionByTxid(db, rows[1]!.railgunTxid)
  const byBlock = await getRailgunTransactionsByBlockRange(db, 100n, 130n)
  assert.deepStrictEqual(byTxid, rows[1])
  assert.deepStrictEqual(byBlock, rows)
})
