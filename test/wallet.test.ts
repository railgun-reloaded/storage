import assert from 'node:assert'
import { test } from 'node:test'

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
  hexToBytes,
  resetTestCounters,
} from './utils'

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

  const retrieved = getNoteByCommitment(db, note.commitment as Uint8Array)

  assert.ok(retrieved)
  assert.deepEqual(retrieved?.commitment, note.commitment)
  assert.equal(retrieved?.amount, note.amount)
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

  markNoteSpent(db, note.commitment as Uint8Array, spentTxid as Uint8Array)

  const retrieved = getNoteByCommitment(db, note.commitment as Uint8Array)

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
  const commitments = notes.map((n) => n.commitment as Uint8Array)
  const spentTxid = hexToBytes('0xff32')

  createWallet(db, wallet)
  insertNotesBatch(db, notes)

  const count = markNotesSpentBatch(db, commitments, spentTxid)

  assert.equal(count, 2)
  const unspent = getUnspentNotes(db, wallet.id, 1)
  assert.equal(unspent.length, 0)
})

test('Wallet Database - Balances: recalculate from notes', () => {
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

  const balance = recalculateBalance(db, wallet.id, 1, token)

  assert.equal(balance, 300n) // 100 + 200, spent note excluded

  const retrieved = getBalance(db, wallet.id, 1, token)
  assert.ok(retrieved)
  assert.equal(retrieved?.amount, 300n)
})

test('Wallet Database - Balances: recalculate all balances', () => {
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

  recalculateAllBalances(db, wallet.id, 1)

  const balances = getAllBalances(db, wallet.id, 1)

  assert.equal(balances.length, 2)
  const ethBalance = balances.find((b) => b.token === ethToken.toLowerCase())
  const daiBalance = balances.find((b) => b.token === daiToken.toLowerCase())

  assert.ok(ethBalance)
  assert.equal(ethBalance?.amount, 300n)
  assert.ok(daiBalance)
  assert.equal(daiBalance?.amount, 500n)
})

test('Wallet Database - Balances: handle zero balance', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const token = '0x0000000000000000000000000000000000000000'

  createWallet(db, wallet)

  const balance = recalculateBalance(db, wallet.id, 1, token)

  assert.equal(balance, 0n)
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
  recalculateAllBalances(db, wallet.id, 1)

  const stats = getWalletDBStats(db, wallet.id)

  assert.equal(stats.notes, 3)
  assert.equal(stats.unspentNotes, 2)
  assert.equal(stats.balances, 1) // All notes same token
})

test('Wallet Database - Cascade Delete: delete wallet data', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const note = createTestNote({ walletId: wallet.id })

  createWallet(db, wallet)
  insertNote(db, note)
  recalculateAllBalances(db, wallet.id, 1)

  deleteWallet(db, wallet.id)

  assert.equal(getWallet(db, wallet.id), undefined)
  assert.equal(getNoteByCommitment(db, note.commitment as Uint8Array), undefined)
  assert.equal(getAllBalances(db, wallet.id, 1).length, 0)
})

test('Wallet Database - Token Case: insertNote stores token lowercase', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'
  const note = createTestNote({ walletId: wallet.id, token: checksumAddress })

  createWallet(db, wallet)
  insertNote(db, note)

  const retrieved = getNoteByCommitment(db, note.commitment as Uint8Array)
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

test('Wallet Database - Token Case: getBalance accepts mixed-case input', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  createWallet(db, wallet)
  insertNote(db, createTestNote({
    walletId: wallet.id,
    token: checksumAddress,
    amount: 500n,
  }))
  recalculateBalance(db, wallet.id, 1, checksumAddress)

  assert.equal(getBalance(db, wallet.id, 1, checksumAddress)?.amount, 500n)
  assert.equal(getBalance(db, wallet.id, 1, checksumAddress.toLowerCase())?.amount, 500n)
  assert.equal(getBalance(db, wallet.id, 1, checksumAddress.toUpperCase())?.amount, 500n)
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

test('Wallet Database - Token Case: same address in different cases dedupes to one balance row', () => {
  resetTestCounters()
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  const checksumAddress = '0x6B175474E89094C44Da98b954EedeAC495271d0F'

  createWallet(db, wallet)
  insertNotesBatch(db, [
    createTestNote({ walletId: wallet.id, token: checksumAddress, amount: 100n }),
    createTestNote({ walletId: wallet.id, token: checksumAddress.toLowerCase(), amount: 200n }),
    createTestNote({ walletId: wallet.id, token: checksumAddress.toUpperCase(), amount: 300n }),
  ])
  recalculateAllBalances(db, wallet.id, 1)

  const balances = getAllBalances(db, wallet.id, 1)
  assert.equal(balances.length, 1)
  assert.equal(balances[0]?.token, checksumAddress.toLowerCase())
  assert.equal(balances[0]?.amount, 600n)
})
