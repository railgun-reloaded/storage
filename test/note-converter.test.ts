import assert from 'node:assert'
import { test } from 'node:test'

import type { NoteInput } from '../src/wallet/note-converter.js'
import { toDBNote, toDBNotes } from '../src/wallet/note-converter.js'
import type { NoteIdentity } from '../src/wallet/queries.js'
import {
  createWallet,
  getNoteByCommitment,
  insertNotesBatch,
} from '../src/wallet/queries.js'
import type { DBNewNote } from '../src/wallet/schema.js'

import { createTestWallet, createTestWalletDB } from './utils.js'

const ERC20_NULL_SUB_ID = `0x${'00'.repeat(32)}`

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

const BASE_INPUT: NoteInput = {
  commitment: '0xaabbccdd00000000000000000000000000000000000000000000000000000000',
  walletId: 'wallet-1',
  chainId: 1,
  nullifier: '0x1122334400000000000000000000000000000000000000000000000000000000',
  token: '0x0000000000000000000000000000000000000000',
  amount: 500n,
  tokenType: 0,
  tokenSubID: ERC20_NULL_SUB_ID,
  blockNumber: 1000n,
  treeNumber: 0,
  treePosition: 7,
  commitmentType: 0,
}

test('toDBNote: converts hex commitment to Uint8Array', () => {
  const result = toDBNote(BASE_INPUT)
  assert.ok(result.commitment instanceof Uint8Array)
  assert.equal(result.commitment.length, 32)
  assert.equal(result.commitment[0], 0xaa)
})

test('toDBNote: converts hex nullifier to Uint8Array', () => {
  const result = toDBNote(BASE_INPUT)
  assert.ok(result.nullifier instanceof Uint8Array)
  assert.equal(result.nullifier.length, 32)
  assert.equal(result.nullifier[0], 0x11)
})

test('toDBNote: passes through scalar fields unchanged', () => {
  const result = toDBNote(BASE_INPUT)
  assert.equal(result.walletId, BASE_INPUT.walletId)
  assert.equal(result.token, BASE_INPUT.token)
  assert.equal(result.amount, BASE_INPUT.amount)
  assert.equal(result.blockNumber, BASE_INPUT.blockNumber)
  assert.equal(result.treeNumber, BASE_INPUT.treeNumber)
  assert.equal(result.treePosition, BASE_INPUT.treePosition)
})

test('toDBNote: sets spent to false', () => {
  const result = toDBNote(BASE_INPUT)
  assert.equal(result.spent, false)
})

test('toDBNote: ERC20 round-trip — tokenType is 0 and tokenSubID is 32 zero bytes', () => {
  const result = toDBNote(BASE_INPUT)
  assert.equal(result.tokenType, 0)
  assert.ok(result.tokenSubID instanceof Uint8Array)
  assert.equal(result.tokenSubID.length, 32)
  assert.ok((result.tokenSubID as Uint8Array).every((byte) => byte === 0))
})

test('toDBNote: ERC721 round-trip — tokenType is 1 and tokenSubID preserves the input bytes', () => {
  const subIdHex = '0x' + '11'.repeat(32)
  const result = toDBNote({
    ...BASE_INPUT,
    tokenType: 1,
    tokenSubID: subIdHex,
  })
  assert.equal(result.tokenType, 1)
  assert.ok(result.tokenSubID instanceof Uint8Array)
  assert.equal(result.tokenSubID.length, 32)
  assert.ok((result.tokenSubID as Uint8Array).every((byte) => byte === 0x11))
})

test('toDBNotes: converts an array of inputs', () => {
  const inputs: NoteInput[] = [
    { ...BASE_INPUT, commitment: '0xaabb000000000000000000000000000000000000000000000000000000000000', nullifier: '0x1100000000000000000000000000000000000000000000000000000000000000' },
    { ...BASE_INPUT, commitment: '0xccdd000000000000000000000000000000000000000000000000000000000000', nullifier: '0x2200000000000000000000000000000000000000000000000000000000000000' },
  ]
  const results = toDBNotes(inputs)
  assert.equal(results.length, 2)
  assert.ok(results[0]!.commitment instanceof Uint8Array)
  assert.equal(results[0]!.commitment[0], 0xaa)
  assert.ok(results[1]!.commitment instanceof Uint8Array)
  assert.equal(results[1]!.commitment[0], 0xcc)
})

test('toDBNotes: returns empty array for empty input', () => {
  const results = toDBNotes([])
  assert.equal(results.length, 0)
  assert.ok(Array.isArray(results))
})

test('toDBNotes + insertNotesBatch round-trip persists correctly', async () => {
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  await createWallet(db, wallet)

  const inputs: NoteInput[] = [
    {
      commitment: '0xaa00000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0xbb00000000000000000000000000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000000',
      amount: 100n,
      tokenType: 0,
      tokenSubID: ERC20_NULL_SUB_ID,
      blockNumber: 2000n,
      treeNumber: 1,
      treePosition: 3,
      commitmentType: 0,
    },
    {
      commitment: '0xaa00000000000000000000000000000000000000000000000000000000000002',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0xbb00000000000000000000000000000000000000000000000000000000000002',
      token: '0x0000000000000000000000000000000000000000',
      amount: 200n,
      tokenType: 0,
      tokenSubID: ERC20_NULL_SUB_ID,
      blockNumber: 2001n,
      treeNumber: 1,
      treePosition: 4,
      commitmentType: 0,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  const count = await insertNotesBatch(db, dbNotes)
  assert.equal(count, 2)

  const found = await getNoteByCommitment(db, noteIdentity(dbNotes[0]!))
  assert.ok(found !== undefined)
  assert.equal(found!.amount, 100n)
  assert.equal(found!.spent, false)
  assert.equal(found!.treeNumber, 1)
  assert.equal(found!.treePosition, 3)
  assert.equal(found!.tokenType, 0)
  assert.equal(found!.tokenSubID.length, 32)
  assert.ok(found!.tokenSubID.every((byte) => byte === 0))
})

test('toDBNotes + insertNotesBatch ERC721 round-trip persists tokenType=1 and tokenSubID bytes', async () => {
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  await createWallet(db, wallet)

  const subIdHex = '0x' + 'ab'.repeat(32)
  const inputs: NoteInput[] = [
    {
      commitment: '0xee00000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0xff00000000000000000000000000000000000000000000000000000000000001',
      token: '0x1111111111111111111111111111111111111111',
      amount: 1n,
      tokenType: 1,
      tokenSubID: subIdHex,
      blockNumber: 5000n,
      treeNumber: 3,
      treePosition: 9,
      commitmentType: 0,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  const count = await insertNotesBatch(db, dbNotes)
  assert.equal(count, 1)

  const found = await getNoteByCommitment(db, noteIdentity(dbNotes[0]!))
  assert.ok(found !== undefined)
  assert.equal(found!.tokenType, 1)
  assert.equal(found!.tokenSubID.length, 32)
  assert.ok(found!.tokenSubID.every((byte) => byte === 0xab))
})

test('insertNotesBatch: two notes on same token address with distinct tokenSubIDs persist as separate rows', async () => {
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  await createWallet(db, wallet)

  const sharedToken = '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d'
  const subId1Hex = `0x${'00'.repeat(31)}01`
  const subId2Hex = `0x${'00'.repeat(31)}02`

  const inputs: NoteInput[] = [
    {
      commitment: '0x1100000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0x2200000000000000000000000000000000000000000000000000000000000001',
      token: sharedToken,
      amount: 1n,
      tokenType: 1,
      tokenSubID: subId1Hex,
      blockNumber: 6000n,
      treeNumber: 4,
      treePosition: 1,
      commitmentType: 0,
    },
    {
      commitment: '0x1100000000000000000000000000000000000000000000000000000000000002',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0x2200000000000000000000000000000000000000000000000000000000000002',
      token: sharedToken,
      amount: 1n,
      tokenType: 1,
      tokenSubID: subId2Hex,
      blockNumber: 6001n,
      treeNumber: 4,
      treePosition: 2,
      commitmentType: 0,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  const count = await insertNotesBatch(db, dbNotes)
  assert.equal(count, 2)

  const found1 = await getNoteByCommitment(db, noteIdentity(dbNotes[0]!))
  const found2 = await getNoteByCommitment(db, noteIdentity(dbNotes[1]!))
  assert.ok(found1 !== undefined)
  assert.ok(found2 !== undefined)
  assert.equal(found1!.tokenSubID[31], 0x01)
  assert.equal(found2!.tokenSubID[31], 0x02)
})

test('toDBNotes + insertNotesBatch handles duplicates idempotently', async () => {
  const db = await createTestWalletDB()
  const wallet = createTestWallet()
  await createWallet(db, wallet)

  const inputs: NoteInput[] = [
    {
      commitment: '0xcc00000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      chainId: 1,
      nullifier: '0xdd00000000000000000000000000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000000',
      amount: 300n,
      tokenType: 0,
      tokenSubID: ERC20_NULL_SUB_ID,
      blockNumber: 3000n,
      treeNumber: 2,
      treePosition: 5,
      commitmentType: 0,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  await insertNotesBatch(db, dbNotes)
  const secondCount = await insertNotesBatch(db, toDBNotes(inputs))
  assert.equal(secondCount, 0)
})
