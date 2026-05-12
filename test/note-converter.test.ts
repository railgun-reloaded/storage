import assert from 'node:assert'
import { test } from 'node:test'

import type { NoteInput } from '../src/wallet/note-converter'
import { toDBNote, toDBNotes } from '../src/wallet/note-converter'
import {
  createWallet,
  getNoteByCommitment,
  insertNotesBatch,
} from '../src/wallet/queries'

import { createTestWallet, createTestWalletDB } from './utils'

const BASE_INPUT: NoteInput = {
  commitment: '0xaabbccdd00000000000000000000000000000000000000000000000000000000',
  walletId: 'wallet-1',
  nullifier: '0x1122334400000000000000000000000000000000000000000000000000000000',
  token: '0x0000000000000000000000000000000000000000',
  amount: 500n,
  blockNumber: 1000n,
  treeNumber: 0,
  treePosition: 7,
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

test('toDBNotes + insertNotesBatch round-trip persists correctly', () => {
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  createWallet(db, wallet)

  const inputs: NoteInput[] = [
    {
      commitment: '0xaa00000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      nullifier: '0xbb00000000000000000000000000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000000',
      amount: 100n,
      blockNumber: 2000n,
      treeNumber: 1,
      treePosition: 3,
    },
    {
      commitment: '0xaa00000000000000000000000000000000000000000000000000000000000002',
      walletId: wallet.id,
      nullifier: '0xbb00000000000000000000000000000000000000000000000000000000000002',
      token: '0x0000000000000000000000000000000000000000',
      amount: 200n,
      blockNumber: 2001n,
      treeNumber: 1,
      treePosition: 4,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  const count = insertNotesBatch(db, dbNotes)
  assert.equal(count, 2)

  const found = getNoteByCommitment(db, dbNotes[0]!.commitment as Uint8Array)
  assert.ok(found !== undefined)
  assert.equal(found!.amount, 100n)
  assert.equal(found!.spent, false)
  assert.equal(found!.treeNumber, 1)
  assert.equal(found!.treePosition, 3)
})

test('toDBNotes + insertNotesBatch handles duplicates idempotently', () => {
  const db = createTestWalletDB()
  const wallet = createTestWallet()
  createWallet(db, wallet)

  const inputs: NoteInput[] = [
    {
      commitment: '0xcc00000000000000000000000000000000000000000000000000000000000001',
      walletId: wallet.id,
      nullifier: '0xdd00000000000000000000000000000000000000000000000000000000000001',
      token: '0x0000000000000000000000000000000000000000',
      amount: 300n,
      blockNumber: 3000n,
      treeNumber: 2,
      treePosition: 5,
    },
  ]

  const dbNotes = toDBNotes(inputs)
  insertNotesBatch(db, dbNotes)
  const secondCount = insertNotesBatch(db, toDBNotes(inputs))
  assert.equal(secondCount, 0)
})
