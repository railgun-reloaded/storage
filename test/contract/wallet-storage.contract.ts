import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { DBNewTxHistory } from '../../src/index.js'

import { createTestNote, createTestWallet, randomBytes } from './fixtures.js'
import type { WalletHarnessFactory, WalletStorageHarness } from './harness.js'

const WALLET_ID = 'wallet-1'

/**
 * Build a transaction history record for the seeded wallet.
 * @param overrides - Optional fields to override on the generated record.
 * @returns A new transaction history record.
 */
function createTestTxHistory (overrides?: Partial<DBNewTxHistory>): DBNewTxHistory {
  return {
    id: `tx-${Math.trunc(Number(overrides?.blockNumber ?? 0n))}`,
    walletId: WALLET_ID,
    chainId: 1,
    type: 'shield',
    txid: '0xabc',
    blockNumber: 0n,
    timestamp: new Date(0),
    ...overrides,
  }
}

/**
 * Register the full `WalletStorage` contract suite against an adapter.
 * @param name - Human-readable name of the adapter under test.
 * @param makeHarness - Factory producing a fresh, isolated wallet store.
 */
function runWalletStorageContract (name: string, makeHarness: WalletHarnessFactory): void {
  /**
   * Run a test body against a fresh harness, seed the default wallet, and always
   * close the store afterwards.
   * @param body - Test body receiving the harness.
   * @returns A function suitable for passing to `test`.
   */
  const withWallet = (body: (harness: WalletStorageHarness) => Promise<void>) => async () => {
    const harness = await makeHarness()
    try {
      await harness.storage.createWallet(createTestWallet({ id: WALLET_ID }))
      await body(harness)
    } finally {
      await harness.close()
    }
  }

  describe(`WalletStorage contract: ${name}`, () => {
    test('wallets create, fetch, list, and cascade-delete', withWallet(async ({ storage }) => {
      assert.ok(await storage.getWallet(WALLET_ID))
      await storage.insertNote(createTestNote({ walletId: WALLET_ID }))
      assert.equal((await storage.listWallets()).length, 1)

      assert.equal(await storage.deleteWallet(WALLET_ID), 1)
      assert.equal(await storage.getWallet(WALLET_ID), undefined)
      assert.deepEqual(await storage.getAllNotes(WALLET_ID, 1), [])
    }))

    test('createWallet reports a duplicate id instead of throwing', withWallet(async ({ storage }) => {
      const first = createTestWallet({ id: 'duplicate' })
      assert.equal(await storage.createWallet(first), true)

      const second = createTestWallet({ id: 'duplicate' })
      assert.equal(await storage.createWallet(second), false)

      // The original row survives: a rejected insert must not overwrite the
      // key material of the wallet already stored under that id.
      const stored = await storage.getWallet('duplicate')
      assert.deepEqual(stored?.encryptedKeys, first.encryptedKeys)
      assert.equal((await storage.listWallets()).filter((w) => w.id === 'duplicate').length, 1)
    }))

    test('createWallet still raises a failure that is not an id collision', withWallet(async ({ storage }) => {
      // A false return has to mean "this id is taken" and nothing else, so a
      // row that violates a different constraint must still surface.
      const invalid = createTestWallet({ encryptedKeys: undefined as unknown as Uint8Array })
      await assert.rejects(storage.createWallet(invalid))
    }))

    test('insertNote normalizes the token and ignores conflicts', withWallet(async ({ storage }) => {
      const note = createTestNote({ walletId: WALLET_ID, token: '0x000000000000000000000000000000000000ABCD' })
      await storage.insertNote(note)
      await storage.insertNote({ ...note, amount: 5n })

      const all = await storage.getAllNotes(WALLET_ID, 1)
      assert.equal(all.length, 1)
      assert.equal(all[0]!.token, '0x000000000000000000000000000000000000abcd')
      assert.equal(all[0]!.amount, 1000000000000000000n)

      const byToken = await storage.getUnspentNotesByToken(WALLET_ID, 1, '0x000000000000000000000000000000000000AbCd')
      assert.equal(byToken.length, 1)
    }))

    test('insertNotesBatch is empty-safe and enriches null fields on conflict', withWallet(async ({ storage }) => {
      assert.equal(await storage.insertNotesBatch([]), 0)

      const note = createTestNote({ walletId: WALLET_ID })
      await storage.insertNotesBatch([note])
      const npk = randomBytes(32)
      await storage.insertNotesBatch([{ ...note, npk }])

      const stored = await storage.getNoteByCommitment({ walletId: WALLET_ID, chainId: 1, commitment: note.commitment })
      assert.deepEqual(stored?.npk, npk)
    }))

    test('spend updates remove notes from the unspent set', withWallet(async ({ storage }) => {
      const a = createTestNote({ walletId: WALLET_ID })
      const b = createTestNote({ walletId: WALLET_ID })
      await storage.insertNotesBatch([a, b])
      assert.equal((await storage.getUnspentNotes(WALLET_ID, 1)).length, 2)

      const spentTxid = randomBytes(32)
      const spentBlockNumber = 123n
      const spentTimestamp = new Date('2025-01-02T03:04:05.000Z')
      assert.equal(await storage.markNoteSpent(
        { walletId: WALLET_ID, chainId: 1, commitment: a.commitment },
        spentTxid,
        spentBlockNumber,
        spentTimestamp
      ), 1)
      assert.equal((await storage.getUnspentNotes(WALLET_ID, 1)).length, 1)

      assert.equal(await storage.markNotesSpentBatch(
        [{ walletId: WALLET_ID, chainId: 1, commitment: b.commitment }],
        spentTxid,
        spentBlockNumber,
        spentTimestamp
      ), 1)
      assert.equal((await storage.getUnspentNotes(WALLET_ID, 1)).length, 0)

      const stored = await storage.getAllNotes(WALLET_ID, 1)
      assert.ok(stored.every((note) => note.spentBlockNumber === spentBlockNumber))
      assert.ok(stored.every((note) => note.spentTimestamp?.getTime() === spentTimestamp.getTime()))
    }))

    test('notes are addressable by commitment and by nullifier', withWallet(async ({ storage }) => {
      const note = createTestNote({ walletId: WALLET_ID })
      await storage.insertNote(note)
      assert.ok(await storage.getNoteByCommitment({ walletId: WALLET_ID, chainId: 1, commitment: note.commitment }))
      assert.ok(await storage.getNoteByNullifier({ chainId: 1, nullifier: note.nullifier, treeNumber: note.treeNumber }))
    }))

    test('PPOI metadata refresh resolves notes needing status', withWallet(async ({ storage }) => {
      const note = createTestNote({ walletId: WALLET_ID })
      await storage.insertNote(note)
      assert.equal((await storage.getNotesNeedingPoiRefresh(WALLET_ID, 1)).length, 1)

      const blinded = randomBytes(32)
      await storage.updateNotePoiStatus({ walletId: WALLET_ID, chainId: 1, commitment: note.commitment }, blinded, { listA: 'Valid' })
      assert.equal((await storage.getNotesNeedingPoiRefresh(WALLET_ID, 1)).length, 0)

      const note2 = createTestNote({ walletId: WALLET_ID })
      await storage.insertNote(note2)
      const updated = await storage.updateNotePoiStatusBatch([
        { walletId: WALLET_ID, chainId: 1, commitment: note2.commitment, blindedCommitment: randomBytes(32), poisPerList: { listA: 'Valid' } },
      ])
      assert.equal(updated, 1)
    }))

    test('PPOI refresh gates on required list keys', withWallet(async ({ storage }) => {
      const valid = createTestNote({ walletId: WALLET_ID })
      const missing = createTestNote({ walletId: WALLET_ID })
      await storage.insertNotesBatch([valid, missing])
      await storage.updateNotePoiStatus({ walletId: WALLET_ID, chainId: 1, commitment: valid.commitment }, randomBytes(32), { listA: 'Valid' })
      await storage.updateNotePoiStatus({ walletId: WALLET_ID, chainId: 1, commitment: missing.commitment }, randomBytes(32), { listA: 'Missing' })

      const needing = await storage.getNotesNeedingPoiRefresh(WALLET_ID, 1, ['listA'])
      assert.equal(needing.length, 1)
      assert.deepEqual(needing[0]!.commitment, missing.commitment)
    }))

    test('scan state upserts per wallet/chain', withWallet(async ({ storage }) => {
      assert.equal(await storage.getScanState(WALLET_ID, 1), undefined)
      await storage.updateScanState(WALLET_ID, 1, 250n)
      assert.equal((await storage.getScanState(WALLET_ID, 1))?.lastScannedBlock, 250n)
      await storage.updateScanState(WALLET_ID, 1, 300n)
      assert.equal((await storage.getScanState(WALLET_ID, 1))?.lastScannedBlock, 300n)
    }))

    test('transaction history dedupes and returns newest first', withWallet(async ({ storage }) => {
      assert.equal(await storage.insertTxHistoryBatch([]), 0)
      await storage.insertTxHistory(createTestTxHistory({ id: 'tx-1', blockNumber: 10n }))
      await storage.insertTxHistory(createTestTxHistory({ id: 'tx-1', blockNumber: 99n }))
      await storage.insertTxHistoryBatch([
        createTestTxHistory({ id: 'tx-2', blockNumber: 20n }),
        createTestTxHistory({ id: 'tx-3', blockNumber: 5n }),
      ])

      const history = await storage.getTxHistory(WALLET_ID, 1)
      assert.deepEqual(history.map((h) => h.blockNumber), [20n, 10n, 5n])
      assert.equal((await storage.getTxById('tx-1'))?.blockNumber, 10n)
    }))

    test('wallet statistics count notes and transactions', withWallet(async ({ storage }) => {
      const a = createTestNote({ walletId: WALLET_ID })
      const b = createTestNote({ walletId: WALLET_ID })
      await storage.insertNotesBatch([a, b])
      await storage.markNoteSpent(
        { walletId: WALLET_ID, chainId: 1, commitment: a.commitment },
        randomBytes(32),
        1n,
        new Date(0)
      )
      await storage.insertTxHistory(createTestTxHistory({ id: 'tx-1', blockNumber: 1n }))

      const stats = await storage.getWalletDBStats(WALLET_ID)
      assert.deepEqual(stats, { notes: 2, unspentNotes: 1, transactions: 1 })
    }))

    test('written wallet state survives close and reopen', withWallet(async (harness) => {
      await harness.storage.insertNote(createTestNote({ walletId: WALLET_ID }))
      await harness.storage.updateScanState(WALLET_ID, 1, 42n)
      const reopened = await harness.reopen()
      assert.equal((await reopened.getAllNotes(WALLET_ID, 1)).length, 1)
      assert.equal((await reopened.getScanState(WALLET_ID, 1))?.lastScannedBlock, 42n)
    }))
  })
}

export { runWalletStorageContract }
