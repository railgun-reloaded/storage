import assert from 'node:assert'
import { test } from 'node:test'

import type { DBNewNote, DBNewSentCommitment, NoteIdentity } from '../../src/wallet/index.js'
import {
  applyNotePoiStatusUpdates,
  applyNoteSpends,
  createWallet,
  deleteWallet,
  getAllNotes,
  getNoteByCommitment,
  getNotesNeedingPoiRefresh,
  getScanState,
  getTxHistory,
  getUnspentNotes,
  getUnspentNotesByToken,
  getWallet,
  getWalletDBStats,
  insertNote,
  insertNotesBatch,
  insertTxHistory,
  insertTxHistoryBatch,
  listWallets,
  markNoteSpent,
  sentCommitments,
  updateNotePoiStatus,
  updateScanState,
} from '../../src/wallet/index.js'
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

test('Wallet Database - Wallets: create and retrieve', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()

  await createWallet(db, wallet)

  const retrieved = await getWallet(db, wallet.id)

  assert.ok(retrieved)
  assert.equal(retrieved?.id, wallet.id)
  assert.equal(retrieved?.name, wallet.name)
})

test('Wallet Database - Wallets: list all', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet1 = createTestWallet()
  const wallet2 = createTestWallet()

  await createWallet(db, wallet1)
  await createWallet(db, wallet2)

  const wallets = await listWallets(db)

  assert.equal(wallets.length, 2)
})

test('Wallet Database - Wallets: delete wallet', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()

  await createWallet(db, wallet)

  const deleted = await deleteWallet(db, wallet.id)

  assert.equal(deleted, 1)
  assert.equal(await getWallet(db, wallet.id), undefined)
})

test('Wallet Database - Notes: insert and retrieve', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  await createWallet(db, wallet)
  await insertNote(db, note)

  const retrieved = await getNoteByCommitment(db, noteIdentity(note))

  assert.ok(retrieved)
  assert.deepEqual(retrieved?.commitment, note.commitment)
  assert.equal(retrieved?.amount, note.amount)
})

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
  assert.equal(await insertNotesBatch(db, [wallet1Chain1, wallet2Chain1, wallet1Chain137]), 3)

  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain1)))?.amount, 1n)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet2Chain1)))?.amount, 2n)
  assert.equal((await getNoteByCommitment(db, noteIdentity(wallet1Chain137)))?.amount, 3n)

  assert.equal(await markNoteSpent(db, noteIdentity(wallet1Chain1), spentTxid), 1)
  assert.equal(await updateNotePoiStatus(db, noteIdentity(wallet1Chain137), blindedCommitment, poisPerList), 1)

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

test('Wallet Database - Notes: batch insert', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id }),
    createTestNote({ walletId: wallet.id }),
    createTestNote({ walletId: wallet.id }),
  ]

  await createWallet(db, wallet)
  const count = await insertNotesBatch(db, notes)

  assert.equal(count, 3)
})

test('Wallet Database - Notes: get unspent notes', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: true }),
  ]

  await createWallet(db, wallet)
  await insertNotesBatch(db, notes)

  const unspent = await getUnspentNotes(db, wallet.id, 1)

  assert.equal(unspent.length, 2)
  assert.ok(unspent.every((n) => !n.spent))
})

test('Wallet Database - Notes: get unspent notes by token', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const ethToken = '0x0000000000000000000000000000000000000000'
  const daiToken = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
    createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
    createTestNote({ walletId: wallet.id, token: daiToken, spent: false }),
  ]

  await createWallet(db, wallet)
  await insertNotesBatch(db, notes)

  const ethNotes = await getUnspentNotesByToken(db, wallet.id, 1, ethToken)

  assert.equal(ethNotes.length, 2)
  assert.ok(ethNotes.every((n) => n.token === ethToken))
})

test('Wallet Database - Notes: mark note as spent', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id, spent: false })
  const spentTxid = hexToBytes('0xfe32')

  await createWallet(db, wallet)
  await insertNote(db, note)

  await markNoteSpent(db, noteIdentity(note), spentTxid as Uint8Array)

  const retrieved = await getNoteByCommitment(db, noteIdentity(note))

  assert.ok(retrieved)
  assert.equal(retrieved?.spent, true)
  assert.deepEqual(retrieved?.spentTxid, spentTxid)
})

test('Wallet Database - Notes: batch mark notes as spent', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
  ]
  const identities = notes.map(noteIdentity)
  const spentTxid = hexToBytes('0xff32')

  await createWallet(db, wallet)
  await insertNotesBatch(db, notes)

  const count = await applyNoteSpends(db, identities, spentTxid)

  assert.equal(count, 2)
  const unspent = await getUnspentNotes(db, wallet.id, 1)
  assert.equal(unspent.length, 0)
})

test('Wallet Database - Scan State: set and get', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  await createWallet(db, wallet)
  await updateScanState(db, wallet.id, chainId, 1000n)

  const state = await getScanState(db, wallet.id, chainId)

  assert.ok(state)
  assert.equal(state?.lastScannedBlock, 1000n)
})

test('Wallet Database - Scan State: update existing', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  await createWallet(db, wallet)
  await updateScanState(db, wallet.id, chainId, 1000n)
  await updateScanState(db, wallet.id, chainId, 2000n)

  const state = await getScanState(db, wallet.id, chainId)

  assert.equal(state?.lastScannedBlock, 2000n)
})

test('Wallet Database - Scan State: support multi-chain', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()

  await createWallet(db, wallet)
  await updateScanState(db, wallet.id, 1, 1000n) // Ethereum
  await updateScanState(db, wallet.id, 137, 5000n) // Polygon

  const ethState = await getScanState(db, wallet.id, 1)
  const polyState = await getScanState(db, wallet.id, 137)

  assert.equal(ethState?.lastScannedBlock, 1000n)
  assert.equal(polyState?.lastScannedBlock, 5000n)
})

test('Wallet Database - Transaction History: insert and retrieve', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const tx = {
    id: 'tx-1',
    walletId: wallet.id,
    chainId: 1,
    type: 'shield' as const,
    txid: '0xtx123',
    blockNumber: 1000n,
    timestamp: new Date(),
  }

  await createWallet(db, wallet)
  await insertTxHistory(db, tx)

  const history = await getTxHistory(db, wallet.id, 1)

  assert.equal(history.length, 1)
  assert.equal(history[0]!.id, tx.id)
  assert.equal(history[0]!.type, 'shield')
})

test('Wallet Database - Transaction History: return descending order', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const txs = [
    {
      id: 'tx-1',
      walletId: wallet.id,
      chainId: 1,
      type: 'shield' as const,
      txid: '0xtx1',
      blockNumber: 1000n,
      timestamp: new Date(),
    },
    {
      id: 'tx-2',
      walletId: wallet.id,
      chainId: 1,
      type: 'transfer' as const,
      txid: '0xtx2',
      blockNumber: 2000n,
      timestamp: new Date(),
    },
    {
      id: 'tx-3',
      walletId: wallet.id,
      chainId: 1,
      type: 'unshield' as const,
      txid: '0xtx3',
      blockNumber: 3000n,
      timestamp: new Date(),
    },
  ]

  await createWallet(db, wallet)
  for (const tx of txs) {
    await insertTxHistory(db, tx)
  }

  const history = await getTxHistory(db, wallet.id, 1)

  assert.equal(history.length, 3)
  assert.equal(history[0]!.blockNumber, 3000n) // Most recent first
  assert.equal(history[1]!.blockNumber, 2000n)
  assert.equal(history[2]!.blockNumber, 1000n)
})

test('Wallet Database - Transaction History: batch insert persists all rows', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const txs = [
    {
      id: 'tx-1',
      walletId: wallet.id,
      chainId: 1,
      type: 'shield' as const,
      txid: '0xtx1',
      blockNumber: 1000n,
      timestamp: new Date(),
    },
    {
      id: 'tx-2',
      walletId: wallet.id,
      chainId: 1,
      type: 'transfer' as const,
      txid: '0xtx2',
      blockNumber: 2000n,
      timestamp: new Date(),
    },
  ]

  await createWallet(db, wallet)
  const inserted = await insertTxHistoryBatch(db, txs)

  assert.equal(inserted, 2)
  assert.equal((await getTxHistory(db, wallet.id, 1)).length, 2)
})

test('Wallet Database - Notes: batch POI status update persists all rows', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const noteA = createTestNote({ walletId: wallet.id, chainId: 1 })
  const noteB = createTestNote({ walletId: wallet.id, chainId: 1 })
  const blindedA = hexToBytes(`0x${'a1'.repeat(32)}`)
  const blindedB = hexToBytes(`0x${'b2'.repeat(32)}`)

  await createWallet(db, wallet)
  assert.equal(await insertNotesBatch(db, [noteA, noteB]), 2)

  const updated = await applyNotePoiStatusUpdates(db, [
    { ...noteIdentity(noteA), blindedCommitment: blindedA, poisPerList: { list: 'valid' } },
    { ...noteIdentity(noteB), blindedCommitment: blindedB, poisPerList: null },
  ])

  assert.equal(updated, 2)
  assert.deepEqual((await getNoteByCommitment(db, noteIdentity(noteA)))?.blindedCommitment, blindedA)
  assert.deepEqual((await getNoteByCommitment(db, noteIdentity(noteB)))?.blindedCommitment, blindedB)
})

test('Wallet Database - Notes: PPOI refresh query returns pending and non-Valid statuses', async () => {
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
  assert.equal(await insertNotesBatch(db, [
    pending,
    missing,
    shieldBlocked,
    proofSubmitted,
    missingRequiredKey,
    allValid,
  ]), 6)

  const candidates = await getNotesNeedingPoiRefresh(db, wallet.id, 1, requiredListKeys)
  const expected = [
    pending,
    missing,
    shieldBlocked,
    proofSubmitted,
    missingRequiredKey,
  ].map((note) => Buffer.from(note.commitment).toString('hex')).sort()
  const exactFilter = (await getAllNotes(db, wallet.id, 1))
    .filter((note) => (
      note.poisPerList == null ||
      requiredListKeys.some((listKey) => (
        (note.poisPerList as Record<string, string | undefined>)[listKey] !== 'Valid'
      ))
    ))
    .map((note) => Buffer.from(note.commitment).toString('hex'))
    .sort()
  const candidateKeys = candidates
    .map((note) => Buffer.from(note.commitment).toString('hex'))
    .sort()

  assert.deepEqual(candidateKeys, expected)
  assert.deepEqual(candidateKeys, exactFilter)
  assert.equal(candidateKeys.includes(Buffer.from(allValid.commitment).toString('hex')), false)
})

test('Wallet Database - Stats: return correct counts', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: true }),
  ]

  await createWallet(db, wallet)
  await insertNotesBatch(db, notes)

  const stats = await getWalletDBStats(db, wallet.id)

  assert.equal(stats.notes, 3)
  assert.equal(stats.unspentNotes, 2)
})

test('Wallet Database - Cascade Delete: delete wallet data', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  await createWallet(db, wallet)
  await insertNote(db, note)

  await deleteWallet(db, wallet.id)

  assert.equal(await getWallet(db, wallet.id), undefined)
  assert.equal(await getNoteByCommitment(db, noteIdentity(note)), undefined)
})

test('Wallet Database - Token Case: insertNote stores token lowercase', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  const note = createTestNote({ walletId: wallet.id, token: checksumAddress })

  await createWallet(db, wallet)
  await insertNote(db, note)

  const retrieved = await getNoteByCommitment(db, noteIdentity(note))
  assert.equal(retrieved?.token, checksumAddress.toLowerCase())
})

test('Wallet Database - Token Case: insertNotesBatch stores tokens lowercase', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  const upperAddress = '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'
  const notes = [
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
    createTestNote({ walletId: wallet.id, token: upperAddress }),
  ]

  await createWallet(db, wallet)
  await insertNotesBatch(db, notes)

  const allNotes = await getUnspentNotes(db, wallet.id, 1)
  assert.equal(allNotes.length, 2)
  assert.ok(allNotes.every((n) => n.token === n.token.toLowerCase()))
})

test('Wallet Database - Token Case: getUnspentNotesByToken accepts mixed-case input', async () => {
  resetTestCounters()
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  await createWallet(db, wallet)
  await insertNotesBatch(db, [
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
  ])

  assert.equal((await getUnspentNotesByToken(db, wallet.id, 1, checksumAddress)).length, 2)
  assert.equal((await getUnspentNotesByToken(db, wallet.id, 1, checksumAddress.toLowerCase())).length, 2)
  assert.equal((await getUnspentNotesByToken(db, wallet.id, 1, checksumAddress.toUpperCase())).length, 2)
})
