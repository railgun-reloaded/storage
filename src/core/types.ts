import type {
  DBNewCommitment,
  DBNewMerkleTree,
  DBNewNullifier,
  DBNewRailgunTransaction,
  DBNewUnshield,
} from '../chain/schema.js'

/**
 * Atomic unit of chain data produced by one scan batch. Every present member is
 * persisted together by `insertScanBatch`; absent or empty members are skipped.
 */
type ScanBatch = {
  chainID: number
  blockNumber: bigint
  nullifiers?: DBNewNullifier[]
  commitments?: DBNewCommitment[]
  unshields?: DBNewUnshield[]
  railgunTransactions?: DBNewRailgunTransaction[]
  merkleTrees?: DBNewMerkleTree[]
}

/**
 * Composite key that uniquely identifies a note. Notes are scoped per wallet and
 * chain, so a commitment alone is not unique across chains.
 */
type NoteIdentity = {
  walletId: string
  chainId: number
  commitment: Uint8Array
}

/**
 * Composite key that identifies a note by its chain-scoped nullifier and tree
 * position. The same nullifier/tree pair can recur across chains, so `chainId`
 * is required to disambiguate.
 */
type NoteNullifierIdentity = {
  chainId: number
  nullifier: Uint8Array
  treeNumber: number
}

/**
 * A note identity paired with the PPOI metadata to persist for it.
 */
type NotePoiStatusUpdate = NoteIdentity & {
  blindedCommitment: Uint8Array
  poisPerList: Record<string, string> | null
}

/**
 * Aggregate counters describing a wallet's stored state.
 */
type WalletDBStats = {
  notes: number
  unspentNotes: number
  transactions: number
}

export type {
  ScanBatch,
  NoteIdentity,
  NoteNullifierIdentity,
  NotePoiStatusUpdate,
  WalletDBStats,
}
