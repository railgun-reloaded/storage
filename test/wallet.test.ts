import assert from 'node:assert'
import { test } from 'node:test'

import type { DBNewNote, DBNewSentCommitment, NoteIdentity } from '../src/wallet/index'
import {
  createWallet,
  deleteWallet,
  getNoteByCommitment,
  getScanState,
  getTxHistory,
  getUnspentNotes,
  getUnspentNotesByToken,
  getWallet,
  getWalletDBStats,
  insertNote,
  insertNotesBatch,
  insertTxHistory,
  listWallets,
  markNoteSpent,
  markNotesSpentBatch,
  sentCommitments,
  updateNotePoiStatus,
  updateScanState,
} from '../src/wallet/index'

import {
  createTestNote,
  createTestWallet,
  createTestWalletDB,
  hexToBytes,
  resetTestCounters,
} from './utils'

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

test('Wallet Database - Wallets: create and retrieve', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)

  const retrieved = getWallet(db, wallet.id)

  assert.ok(retrieved)
  assert.equal(retrieved?.id, wallet.id)
  assert.equal(retrieved?.name, wallet.name)
})

test('Wallet Database - Wallets: list all', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet1 = createTestWallet()
  const wallet2 = createTestWallet()

  createWallet(db, wallet1)
  createWallet(db, wallet2)

  const wallets = listWallets(db)

  assert.equal(wallets.length, 2)
})

test('Wallet Database - Wallets: delete wallet', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)

  const deleted = deleteWallet(db, wallet.id)

  assert.equal(deleted, 1)
  assert.equal(getWallet(db, wallet.id), undefined)
})

test('Wallet Database - Notes: insert and retrieve', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  createWallet(db, wallet)
  insertNote(db, note)

  const retrieved = getNoteByCommitment(db, noteIdentity(note))

  assert.ok(retrieved)
  assert.deepEqual(retrieved?.commitment, note.commitment)
  assert.equal(retrieved?.amount, note.amount)
})

test('Wallet Database - Notes: commitment identity is wallet and chain scoped', () => {
  resetTestCounters()
  const db = createTestWalletDB()
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

  createWallet(db, wallet1)
  createWallet(db, wallet2)
  assert.equal(insertNotesBatch(db, [wallet1Chain1, wallet2Chain1, wallet1Chain137]), 3)

  assert.equal(getNoteByCommitment(db, noteIdentity(wallet1Chain1))?.amount, 1n)
  assert.equal(getNoteByCommitment(db, noteIdentity(wallet2Chain1))?.amount, 2n)
  assert.equal(getNoteByCommitment(db, noteIdentity(wallet1Chain137))?.amount, 3n)

  assert.equal(markNoteSpent(db, noteIdentity(wallet1Chain1), spentTxid), 1)
  assert.equal(updateNotePoiStatus(db, noteIdentity(wallet1Chain137), blindedCommitment, poisPerList), 1)

  assert.equal(getNoteByCommitment(db, noteIdentity(wallet1Chain1))?.spent, true)
  assert.equal(getNoteByCommitment(db, noteIdentity(wallet2Chain1))?.spent, false)
  assert.equal(getNoteByCommitment(db, noteIdentity(wallet1Chain137))?.spent, false)
  assert.deepEqual(getNoteByCommitment(db, noteIdentity(wallet1Chain137))?.blindedCommitment, blindedCommitment)
  assert.equal(getNoteByCommitment(db, noteIdentity(wallet1Chain1))?.blindedCommitment, null)
})

test('Wallet Database - Sent commitments: commitment identity is wallet and chain scoped', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const sharedCommitment = hexToBytes(`0x${'ac'.repeat(32)}`)

  createWallet(db, wallet)

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

test('Wallet Database - Notes: batch insert', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id }),
    createTestNote({ walletId: wallet.id }),
    createTestNote({ walletId: wallet.id }),
  ]

  createWallet(db, wallet)
  const count = insertNotesBatch(db, notes)

  assert.equal(count, 3)
})

test('Wallet Database - Notes: get unspent notes', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: true }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const unspent = getUnspentNotes(db, wallet.id, 1)

  assert.equal(unspent.length, 2)
  assert.ok(unspent.every((n) => !n.spent))
})

test('Wallet Database - Notes: get unspent notes by token', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const ethToken = '0x0000000000000000000000000000000000000000'
  const daiToken = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
    createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
    createTestNote({ walletId: wallet.id, token: daiToken, spent: false }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const ethNotes = getUnspentNotesByToken(db, wallet.id, 1, ethToken)

  assert.equal(ethNotes.length, 2)
  assert.ok(ethNotes.every((n) => n.token === ethToken))
})

test('Wallet Database - Notes: mark note as spent', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id, spent: false })
  const spentTxid = hexToBytes('0xfe32')

  createWallet(db, wallet)
  insertNote(db, note)

  markNoteSpent(db, noteIdentity(note), spentTxid as Uint8Array)

  const retrieved = getNoteByCommitment(db, noteIdentity(note))

  assert.ok(retrieved)
  assert.equal(retrieved?.spent, true)
  assert.deepEqual(retrieved?.spentTxid, spentTxid)
})

test('Wallet Database - Notes: batch mark notes as spent', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
  ]
  const identities = notes.map(noteIdentity)
  const spentTxid = hexToBytes('0xff32')

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const count = markNotesSpentBatch(db, identities, spentTxid)

  assert.equal(count, 2)
  const unspent = getUnspentNotes(db, wallet.id, 1)
  assert.equal(unspent.length, 0)
})

test('Wallet Database - Scan State: set and get', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  createWallet(db, wallet)
  updateScanState(db, wallet.id, chainId, 1000n)

  const state = getScanState(db, wallet.id, chainId)

  assert.ok(state)
  assert.equal(state?.lastScannedBlock, 1000n)
})

test('Wallet Database - Scan State: update existing', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  createWallet(db, wallet)
  updateScanState(db, wallet.id, chainId, 1000n)
  updateScanState(db, wallet.id, chainId, 2000n)

  const state = getScanState(db, wallet.id, chainId)

  assert.equal(state?.lastScannedBlock, 2000n)
})

test('Wallet Database - Scan State: support multi-chain', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)
  updateScanState(db, wallet.id, 1, 1000n) // Ethereum
  updateScanState(db, wallet.id, 137, 5000n) // Polygon

  const ethState = getScanState(db, wallet.id, 1)
  const polyState = getScanState(db, wallet.id, 137)

  assert.equal(ethState?.lastScannedBlock, 1000n)
  assert.equal(polyState?.lastScannedBlock, 5000n)
})

test('Wallet Database - Transaction History: insert and retrieve', () => {
  resetTestCounters()
  const db = createTestWalletDB()
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

  createWallet(db, wallet)
  insertTxHistory(db, tx)

  const history = getTxHistory(db, wallet.id, 1)

  assert.equal(history.length, 1)
  assert.equal(history[0]!.id, tx.id)
  assert.equal(history[0]!.type, 'shield')
})

test('Wallet Database - Transaction History: return descending order', () => {
  resetTestCounters()
  const db = createTestWalletDB()
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

  createWallet(db, wallet)
  for (const tx of txs) {
    insertTxHistory(db, tx)
  }

  const history = getTxHistory(db, wallet.id, 1)

  assert.equal(history.length, 3)
  assert.equal(history[0]!.blockNumber, 3000n) // Most recent first
  assert.equal(history[1]!.blockNumber, 2000n)
  assert.equal(history[2]!.blockNumber, 1000n)
})

test('Wallet Database - Stats: return correct counts', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: true }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const stats = getWalletDBStats(db, wallet.id)

  assert.equal(stats.notes, 3)
  assert.equal(stats.unspentNotes, 2)
})

test('Wallet Database - Cascade Delete: delete wallet data', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  createWallet(db, wallet)
  insertNote(db, note)

  deleteWallet(db, wallet.id)

  assert.equal(getWallet(db, wallet.id), undefined)
  assert.equal(getNoteByCommitment(db, noteIdentity(note)), undefined)
})

test('Wallet Database - Token Case: insertNote stores token lowercase', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  const note = createTestNote({ walletId: wallet.id, token: checksumAddress })

  createWallet(db, wallet)
  insertNote(db, note)

  const retrieved = getNoteByCommitment(db, noteIdentity(note))
  assert.equal(retrieved?.token, checksumAddress.toLowerCase())
})

test('Wallet Database - Token Case: insertNotesBatch stores tokens lowercase', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  const upperAddress = '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48'
  const notes = [
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
    createTestNote({ walletId: wallet.id, token: upperAddress }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const allNotes = getUnspentNotes(db, wallet.id, 1)
  assert.equal(allNotes.length, 2)
  assert.ok(allNotes.every((n) => n.token === n.token.toLowerCase()))
})

test('Wallet Database - Token Case: getUnspentNotesByToken accepts mixed-case input', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  createWallet(db, wallet)
  insertNotesBatch(db, [
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
    createTestNote({ walletId: wallet.id, token: checksumAddress }),
  ])

  assert.equal(getUnspentNotesByToken(db, wallet.id, 1, checksumAddress).length, 2)
  assert.equal(getUnspentNotesByToken(db, wallet.id, 1, checksumAddress.toLowerCase()).length, 2)
  assert.equal(getUnspentNotesByToken(db, wallet.id, 1, checksumAddress.toUpperCase()).length, 2)
})
