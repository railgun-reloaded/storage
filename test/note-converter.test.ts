import { test } from 'brittle'

import type { NoteInput } from '../src/wallet/note-converter'
import { toDBNote, toDBNotes } from '../src/wallet/note-converter'

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

test('toDBNote: converts hex commitment to Uint8Array', (t) => {
  const result = toDBNote(BASE_INPUT)
  t.ok(result.commitment instanceof Uint8Array)
  t.is(result.commitment.length, 32)
  t.is(result.commitment[0], 0xaa)
})

test('toDBNote: converts hex nullifier to Uint8Array', (t) => {
  const result = toDBNote(BASE_INPUT)
  t.ok(result.nullifier instanceof Uint8Array)
  t.is(result.nullifier.length, 32)
  t.is(result.nullifier[0], 0x11)
})

test('toDBNote: passes through scalar fields unchanged', (t) => {
  const result = toDBNote(BASE_INPUT)
  t.is(result.walletId, BASE_INPUT.walletId)
  t.is(result.token, BASE_INPUT.token)
  t.is(result.amount, BASE_INPUT.amount)
  t.is(result.blockNumber, BASE_INPUT.blockNumber)
  t.is(result.treeNumber, BASE_INPUT.treeNumber)
  t.is(result.treePosition, BASE_INPUT.treePosition)
})

test('toDBNote: sets spent to false', (t) => {
  const result = toDBNote(BASE_INPUT)
  t.is(result.spent, false)
})

test('toDBNotes: converts an array of inputs', (t) => {
  const inputs: NoteInput[] = [
    { ...BASE_INPUT, commitment: '0xaabb000000000000000000000000000000000000000000000000000000000000', nullifier: '0x1100000000000000000000000000000000000000000000000000000000000000' },
    { ...BASE_INPUT, commitment: '0xccdd000000000000000000000000000000000000000000000000000000000000', nullifier: '0x2200000000000000000000000000000000000000000000000000000000000000' },
  ]
  const results = toDBNotes(inputs)
  t.is(results.length, 2)
  t.ok(results[0]!.commitment instanceof Uint8Array)
  t.is(results[0]!.commitment[0], 0xaa)
  t.ok(results[1]!.commitment instanceof Uint8Array)
  t.is(results[1]!.commitment[0], 0xcc)
})

test('toDBNotes: returns empty array for empty input', (t) => {
  const results = toDBNotes([])
  t.is(results.length, 0)
  t.ok(Array.isArray(results))
})
