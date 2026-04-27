import { hexToBytes } from '@railgun-reloaded/bytes'

import type { DBNewNote } from './schema'

/**
 * Input contract for creating a new note record.
 * Consumers map their domain types into this shape before persisting.
 * Fields commitment and nullifier are hex strings (with or without `0x` prefix);
 * all other fields are passed through unchanged.
 */
type NoteInput = {
  commitment: string
  walletId: string
  nullifier: string
  token: string
  amount: bigint
  blockNumber: bigint
  treeNumber: number
  treePosition: number
}

/**
 * Converts a single NoteInput into a DBNewNote ready for insertion.
 * Hex strings are decoded to Uint8Array and `spent` is initialised to false.
 * @param input - The NoteInput object from the caller.
 * @returns A DBNewNote object suitable for the wallet database.
 */
function toDBNote (input: NoteInput): DBNewNote {
  return {
    commitment: hexToBytes(input.commitment),
    walletId: input.walletId,
    nullifier: hexToBytes(input.nullifier),
    token: input.token,
    amount: input.amount,
    spent: false,
    blockNumber: input.blockNumber,
    treeNumber: input.treeNumber,
    treePosition: input.treePosition,
  }
}

/**
 * Converts an array of NoteInput objects into DBNewNote records.
 * Returns an empty array when given an empty input array.
 * @param inputs - Array of NoteInput objects to convert.
 * @returns Array of DBNewNote objects ready for batch insertion.
 */
function toDBNotes (inputs: NoteInput[]): DBNewNote[] {
  return inputs.map(toDBNote)
}

export type { NoteInput }
export { toDBNote, toDBNotes }
