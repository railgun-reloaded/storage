import { hexToBytes } from '@railgun-reloaded/bytes'

import type { DBNewNote } from './schema'

/**
 * Input contract for creating a new note record.
 * Consumers map their domain types into this shape before persisting.
 * Hex string fields (`commitment`, `nullifier`, `tokenSubID`) accept values
 * with or without a `0x` prefix; all other fields are passed through unchanged.
 * `tokenType` is the integer token-class enum (0 = ERC20, 1 = ERC721).
 * `tokenSubID` is a 32-byte sub-identifier; for ERC20 it is the canonical
 * 256-bit null (64 zero hex chars).
 */
type NoteInput = {
  commitment: string
  walletId: string
  chainId: number
  nullifier: string
  token: string
  amount: bigint
  tokenType: number
  tokenSubID: string
  blockNumber: bigint
  treeNumber: number
  treePosition: number
  commitmentType: number
  outputType?: number
  npk?: Uint8Array
  random?: Uint8Array
  blindedCommitment?: Uint8Array
  creationRailgunTxid?: Uint8Array
  creationTxid?: Uint8Array
}

/**
 * Converts a single NoteInput into a DBNewNote ready for insertion.
 * Hex strings are decoded to Uint8Array and `spent` is initialised to false.
 * @param input - The NoteInput object from the caller.
 * @returns A DBNewNote object suitable for the wallet database.
 * @throws If `tokenSubID` does not decode to exactly 32 bytes.
 */
function toDBNote (input: NoteInput): DBNewNote {
  const tokenSubID = hexToBytes(input.tokenSubID)
  if (tokenSubID.length !== 32) {
    throw new Error(`tokenSubID must be exactly 32 bytes, got ${tokenSubID.length}`)
  }

  return {
    commitment: hexToBytes(input.commitment),
    walletId: input.walletId,
    chainId: input.chainId,
    nullifier: hexToBytes(input.nullifier),
    token: input.token,
    amount: input.amount,
    tokenType: input.tokenType,
    tokenSubID,
    spent: false,
    blockNumber: input.blockNumber,
    treeNumber: input.treeNumber,
    treePosition: input.treePosition,
    commitmentType: input.commitmentType,
    outputType: input.outputType ?? null,
    npk: input.npk ?? null,
    random: input.random ?? null,
    blindedCommitment: input.blindedCommitment ?? null,
    creationRailgunTxid: input.creationRailgunTxid ?? null,
    creationTxid: input.creationTxid ?? null,
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
