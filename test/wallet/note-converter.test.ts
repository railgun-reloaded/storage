import assert from 'node:assert'
import { test } from 'node:test'

import type { NoteInput } from '../../src/wallet/note-converter.js'
import { toDBNotes } from '../../src/wallet/note-converter.js'
import type { NoteIdentity } from '../../src/wallet/queries.js'
import {
  createWallet,
  getNoteByCommitment,
  getNoteByNullifier,
  insertNotesBatch,
} from '../../src/wallet/queries.js'
import type { DBNewNote } from '../../src/wallet/schema.js'
import { createTestWallet, createTestWalletDB } from '../utils.js'

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

test('public hex note inputs survive a wallet database round-trip', async () => {
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
  assert.deepEqual((await getNoteByNullifier(db, {
    chainId: inputs[0]!.chainId,
    nullifier: dbNotes[0]!.nullifier,
    treeNumber: inputs[0]!.treeNumber,
  }))?.commitment, dbNotes[0]!.commitment)
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
