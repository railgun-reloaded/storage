import assert from 'node:assert'
import { test } from 'node:test'

import type { NoteIdentity } from '../../src/wallet/queries.js'
import {
  createWallet,
  getNoteByCommitment,
  getNotesNeedingPoiRefresh,
  getScanState,
  insertNotesBatch,
  markNoteSpent,
  updateNotePoiStatus,
  updateScanState,
} from '../../src/wallet/queries.js'
import type { DBNewNote, DBNewSentCommitment } from '../../src/wallet/schema.js'
import { sentCommitments } from '../../src/wallet/schema.js'
import {
  createTestNote,
  createTestWallet,
  createTestWalletDB,
  hexToBytes,
  resetTestCounters,
} from '../utils.js'

/**
 * Build a note identity (wallet, chain, commitment) from a DB note row for use
 * in commitment-scoped lookups.
 * @param note - Note row to derive the identity from.
 * @returns The note's composite identity.
 */
function noteIdentity (note: DBNewNote): NoteIdentity {
  return {
    walletId: note.walletId,
    chainId: note.chainId,
    commitment: note.commitment,
  }
}

/**
 * Build a sent-commitment fixture with sensible defaults, overridable per field.
 * @param overrides - Partial fields to override on the default fixture.
 * @returns A complete sent-commitment row for insertion.
 */
function sentCommitmentFixture (
  overrides: Partial<DBNewSentCommitment> = {}
): DBNewSentCommitment {
  return {
    commitment: hexToBytes(`0x${'ab'.repeat(32)}`),
    walletId: 'wallet-1',
    chainId: 1,
    treeNumber: 0,
    treePosition: 1,
    token: '0x0000000000000000000000000000000000000000',
    amount: 1n,
    npk: hexToBytes(`0x${'cd'.repeat(32)}`),
    recipientMpk: hexToBytes(`0x${'ef'.repeat(32)}`),
    blockNumber: 1n,
    ...overrides,
  }
}

test('Wallet Database - Notes: commitment identity is wallet and chain scoped', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet1 = createTestWallet()
  const wallet2 = createTestWallet()
  const sharedCommitment = hexToBytes(`0x${'aa'.repeat(32)}`)
  const spentTxid = hexToBytes(`0x${'fe'.repeat(32)}`)
  const blindedCommitment = hexToBytes(`0x${'be'.repeat(32)}`)
  const poisPerList = { list: 'valid' }
  const wallet1Chain1 = createTestNote({
    walletId: wallet1.id,
    chainId: 1,
    commitment: sharedCommitment,
    amount: 1n,
  })
  const wallet2Chain1 = createTestNote({
    walletId: wallet2.id,
    chainId: 1,
    commitment: sharedCommitment,
    amount: 2n,
  })
  const wallet1Chain137 = createTestNote({
    walletId: wallet1.id,
    chainId: 137,
    commitment: sharedCommitment,
    amount: 3n,
  })

  await createWallet(db, wallet1)
  await createWallet(db, wallet2)
  await insertNotesBatch(db, [wallet1Chain1, wallet2Chain1, wallet1Chain137])

  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain1)))?.amount, 1n)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet2Chain1)))?.amount, 2n)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain137)))?.amount, 3n)

  await markNoteSpent(db, noteIdentity(wallet1Chain1), spentTxid, 100n, new Date(1_000))
  await updateNotePoiStatus(db, noteIdentity(wallet1Chain137), blindedCommitment, poisPerList)

  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain1)))?.spent, true)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet2Chain1)))?.spent, false)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain137)))?.spent, false)
  assert.deepEqual((await getNoteByCommitment(db, noteIdentity(wallet1Chain137)))?.blindedCommitment, blindedCommitment)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain1)))?.blindedCommitment, null)
})

test('Wallet Database - Sent commitments: commitment identity is wallet and chain scoped', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const sharedCommitment = hexToBytes(`0x${'ac'.repeat(32)}`)

  await createWallet(db, wallet)

  const first = sentCommitmentFixture({
    walletId: wallet.id,
    chainId: 1,
    commitment: sharedCommitment,
  })
  const second = sentCommitmentFixture({
    walletId: wallet.id,
    chainId: 137,
    commitment: sharedCommitment,
    treePosition: 2,
  })

  const result = db.insert(sentCommitments).values([first, second]).run()
  assert.equal(result.changes, 2)
})

test('Wallet Database - Scan State: wallet state is isolated by chain', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()

  await createWallet(db, wallet)
  await updateScanState(db, wallet.id, 1, 1000n)
  await updateScanState(db, wallet.id, 137, 5000n)

  assert.equal((await getScanState(db, wallet.id, 1))?.lastScannedBlock, 1000n)
  assert.equal((await getScanState(db, wallet.id, 137))?.lastScannedBlock, 5000n)
})

test('Wallet Database - Notes: PPOI refresh includes every non-Valid status', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const requiredListKeys = ['required-a', 'required-b']
  const pending = createTestNote({ walletId: wallet.id, chainId: 1, poisPerList: null })
  const missing = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    poisPerList: { 'required-a': 'Missing', 'required-b': 'Valid' },
  })
  const shieldBlocked = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    poisPerList: { 'required-a': 'Valid', 'required-b': 'ShieldBlocked' },
  })
  const proofSubmitted = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    poisPerList: { 'required-a': 'ProofSubmitted', 'required-b': 'Valid' },
  })
  const missingRequiredKey = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    poisPerList: { 'required-a': 'Valid' },
  })
  const allValid = createTestNote({
    walletId: wallet.id,
    chainId: 1,
    poisPerList: { 'required-a': 'Valid', 'required-b': 'Valid' },
  })

  await createWallet(db, wallet)
  await insertNotesBatch(db, [
    pending,
    missing,
    shieldBlocked,
    proofSubmitted,
    missingRequiredKey,
    allValid,
  ])

  const candidates = await getNotesNeedingPoiRefresh(db, wallet.id, 1, requiredListKeys)
  const expected = [
    pending,
    missing,
    shieldBlocked,
    proofSubmitted,
    missingRequiredKey,
  ].map((note) => Buffer.from(note.commitment).toString('hex')).sort()
  const candidateKeys = candidates
    .map((note) => Buffer.from(note.commitment).toString('hex'))
    .sort()

  assert.deepEqual(candidateKeys, expected)
  assert.equal(candidateKeys.includes(Buffer.from(allValid.commitment).toString('hex')), false)
})
