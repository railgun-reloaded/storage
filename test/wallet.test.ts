import { test } from 'brittle'

import {
  createWallet,
  deleteWallet,
  getAllBalances,
  getBalance,
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
  recalculateAllBalances,
  recalculateBalance,
  updateScanState,
} from '../src/wallet/index'

import {
  createTestNote,
  createTestWallet,
  createTestWalletDB,
  resetTestCounters,
} from './utils'

test('Wallet Database - Wallets: create and retrieve', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)

  const retrieved = getWallet(db, wallet.id)

  t.ok(retrieved)
  t.is(retrieved?.id, wallet.id)
  t.is(retrieved?.name, wallet.name)
})

test('Wallet Database - Wallets: list all', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet1 = createTestWallet()
  const wallet2 = createTestWallet()

  createWallet(db, wallet1)
  createWallet(db, wallet2)

  const wallets = listWallets(db)

  t.is(wallets.length, 2)
})

test('Wallet Database - Wallets: delete wallet', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)

  const deleted = deleteWallet(db, wallet.id)

  t.is(deleted, 1)
  t.is(getWallet(db, wallet.id), undefined)
})

test('Wallet Database - Notes: insert and retrieve', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  createWallet(db, wallet)
  insertNote(db, note)

  const retrieved = getNoteByCommitment(db, note.commitment)

  t.ok(retrieved)
  t.is(retrieved?.commitment, note.commitment)
  t.is(retrieved?.amount, note.amount)
})

test('Wallet Database - Notes: batch insert', (t) => {
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

  t.is(count, 3)
})

test('Wallet Database - Notes: get unspent notes', (t) => {
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

  const unspent = getUnspentNotes(db, wallet.id)

  t.is(unspent.length, 2)
  t.ok(unspent.every((n) => !n.spent))
})

test('Wallet Database - Notes: get unspent notes by token', (t) => {
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

  const ethNotes = getUnspentNotesByToken(db, wallet.id, ethToken)

  t.is(ethNotes.length, 2)
  t.ok(ethNotes.every((n) => n.token === ethToken))
})

test('Wallet Database - Notes: mark note as spent', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id, spent: false })
  const spentTxid = '0xspent123'

  createWallet(db, wallet)
  insertNote(db, note)

  markNoteSpent(db, note.commitment, spentTxid)

  const retrieved = getNoteByCommitment(db, note.commitment)

  t.ok(retrieved)
  t.is(retrieved?.spent, true)
  t.is(retrieved?.spentTxid, spentTxid)
})

test('Wallet Database - Notes: batch mark notes as spent', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const notes = [
    createTestNote({ walletId: wallet.id, spent: false }),
    createTestNote({ walletId: wallet.id, spent: false }),
  ]
  const commitments = notes.map((n) => n.commitment)
  const spentTxid = '0xspent456'

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const count = markNotesSpentBatch(db, commitments, spentTxid)

  t.is(count, 2)
  const unspent = getUnspentNotes(db, wallet.id)
  t.is(unspent.length, 0)
})

test('Wallet Database - Balances: recalculate from notes', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const token = '0x0000000000000000000000000000000000000000'
  const notes = [
    createTestNote({ walletId: wallet.id, token, amount: 100n, spent: false }),
    createTestNote({ walletId: wallet.id, token, amount: 200n, spent: false }),
    createTestNote({ walletId: wallet.id, token, amount: 300n, spent: true }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const balance = recalculateBalance(db, wallet.id, token)

  t.is(balance, 300n) // 100 + 200, spent note excluded

  const retrieved = getBalance(db, wallet.id, token)
  t.ok(retrieved)
  t.is(retrieved?.amount, 300n)
})

test('Wallet Database - Balances: recalculate all balances', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const ethToken = '0x0000000000000000000000000000000000000000'
  const daiToken = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  const notes = [
    createTestNote({ walletId: wallet.id, token: ethToken, amount: 100n, spent: false }),
    createTestNote({ walletId: wallet.id, token: ethToken, amount: 200n, spent: false }),
    createTestNote({ walletId: wallet.id, token: daiToken, amount: 500n, spent: false }),
  ]

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  recalculateAllBalances(db, wallet.id)

  const balances = getAllBalances(db, wallet.id)

  t.is(balances.length, 2)
  const ethBalance = balances.find((b) => b.token === ethToken)
  const daiBalance = balances.find((b) => b.token === daiToken)

  t.ok(ethBalance)
  t.is(ethBalance?.amount, 300n)
  t.ok(daiBalance)
  t.is(daiBalance?.amount, 500n)
})

test('Wallet Database - Balances: handle zero balance', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const token = '0x0000000000000000000000000000000000000000'

  createWallet(db, wallet)

  const balance = recalculateBalance(db, wallet.id, token)

  t.is(balance, 0n)
})

test('Wallet Database - Scan State: set and get', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  createWallet(db, wallet)
  updateScanState(db, wallet.id, chainId, 1000n)

  const state = getScanState(db, wallet.id, chainId)

  t.ok(state)
  t.is(state?.lastScannedBlock, 1000n)
})

test('Wallet Database - Scan State: update existing', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const chainId = 1

  createWallet(db, wallet)
  updateScanState(db, wallet.id, chainId, 1000n)
  updateScanState(db, wallet.id, chainId, 2000n)

  const state = getScanState(db, wallet.id, chainId)

  t.is(state?.lastScannedBlock, 2000n)
})

test('Wallet Database - Scan State: support multi-chain', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()

  createWallet(db, wallet)
  updateScanState(db, wallet.id, 1, 1000n) // Ethereum
  updateScanState(db, wallet.id, 137, 5000n) // Polygon

  const ethState = getScanState(db, wallet.id, 1)
  const polyState = getScanState(db, wallet.id, 137)

  t.is(ethState?.lastScannedBlock, 1000n)
  t.is(polyState?.lastScannedBlock, 5000n)
})

test('Wallet Database - Transaction History: insert and retrieve', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const tx = {
    id: 'tx-1',
    walletId: wallet.id,
    type: 'shield' as const,
    txid: '0xtx123',
    blockNumber: 1000n,
    timestamp: new Date(),
  }

  createWallet(db, wallet)
  insertTxHistory(db, tx)

  const history = getTxHistory(db, wallet.id)

  t.is(history.length, 1)
  t.is(history[0]!.id, tx.id)
  t.is(history[0]!.type, 'shield')
})

test('Wallet Database - Transaction History: return descending order', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const txs = [
    {
      id: 'tx-1',
      walletId: wallet.id,
      type: 'shield' as const,
      txid: '0xtx1',
      blockNumber: 1000n,
      timestamp: new Date(),
    },
    {
      id: 'tx-2',
      walletId: wallet.id,
      type: 'transfer' as const,
      txid: '0xtx2',
      blockNumber: 2000n,
      timestamp: new Date(),
    },
    {
      id: 'tx-3',
      walletId: wallet.id,
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

  const history = getTxHistory(db, wallet.id)

  t.is(history.length, 3)
  t.is(history[0]!.blockNumber, 3000n) // Most recent first
  t.is(history[1]!.blockNumber, 2000n)
  t.is(history[2]!.blockNumber, 1000n)
})

test('Wallet Database - Stats: return correct counts', (t) => {
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
  recalculateAllBalances(db, wallet.id)

  const stats = getWalletDBStats(db, wallet.id)

  t.is(stats.notes, 3)
  t.is(stats.unspentNotes, 2)
  t.is(stats.balances, 1) // All notes same token
})

test('Wallet Database - Cascade Delete: delete wallet data', (t) => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  createWallet(db, wallet)
  insertNote(db, note)
  recalculateAllBalances(db, wallet.id)

  deleteWallet(db, wallet.id)

  t.is(getWallet(db, wallet.id), undefined)
  t.is(getNoteByCommitment(db, note.commitment), undefined)
  t.is(getAllBalances(db, wallet.id).length, 0)
})
