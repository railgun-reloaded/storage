import type {
  DBCommitment,
  DBMerkleTree,
  DBNewCommitment,
  DBNewMerkleTree,
  DBNewNullifier,
  DBNewRailgunTransaction,
  DBNewUnshield,
  DBNullifier,
  DBRailgunTransaction,
  DBSyncState,
  DBUnshield,
} from '../chain/schema.js'

import type { ScanBatch } from './types.js'

/**
 * Chain-wide storage operations.
 */
type ChainStorage = {
  /**
   * Determine whether a given nullifier exists.
   * @param nullifier - The nullifier value to look up.
   * @param treeNumber - Tree number of the nullifier.
   * @returns `true` if the nullifier is present, otherwise `false`.
   */
  nullifierExists (nullifier: Uint8Array, treeNumber: number): Promise<boolean>

  /**
   * Insert a batch of nullifiers, updating existing records on conflict. An
   * empty batch is a no-op and returns `0`.
   * @param nullifierBatch - Array of nullifiers to upsert.
   * @returns Normalized count of affected rows.
   */
  insertNullifiersBatch (nullifierBatch: DBNewNullifier[]): Promise<number>

  /**
   * Retrieve nullifiers whose block numbers fall within an inclusive range,
   * ordered ascending by block number.
   * @param fromBlock - Starting block height (inclusive).
   * @param toBlock - Ending block height (inclusive).
   * @returns Nullifiers ordered by block number.
   */
  getNullifiersByBlockRange (fromBlock: bigint, toBlock: bigint): Promise<DBNullifier[]>

  /**
   * Remove nullifiers at or after a block number, used during reorg.
   * @param fromBlock - Block number from which to delete (inclusive).
   * @returns Normalized count of deleted rows.
   */
  deleteNullifiersFromBlock (fromBlock: bigint): Promise<number>

  /**
   * Retrieve all nullifiers, ordered ascending by block number.
   * @returns All nullifier records.
   */
  getAllNullifiers (): Promise<DBNullifier[]>

  /**
   * Retrieve nullifiers at or after a block number, ordered ascending by block.
   * @param fromBlock - Starting block height (inclusive).
   * @returns Nullifier records from the block onward.
   */
  getNullifiersFromBlock (fromBlock: bigint): Promise<DBNullifier[]>

  /**
   * Insert or update a batch of commitments. An empty batch is a no-op and
   * returns `0`.
   * @param commitmentBatch - Array of commitment records to upsert.
   * @returns Normalized count of affected rows.
   */
  insertCommitmentBatch (commitmentBatch: DBNewCommitment[]): Promise<number>

  /**
   * Get commitments within an inclusive leaf range of a Merkle tree, ordered
   * ascending by tree position.
   * @param treeNumber - Tree identifier.
   * @param startLeafIndex - Starting leaf index (inclusive).
   * @param endLeafIndex - Ending leaf index (inclusive).
   * @returns Commitments ordered by leaf index.
   */
  getCommitmentsByLeafRange (treeNumber: number, startLeafIndex: number, endLeafIndex: number): Promise<DBCommitment[]>

  /**
   * Retrieve commitments within an inclusive block range, ordered ascending by
   * block number.
   * @param fromBlock - Start block height (inclusive).
   * @param toBlock - End block height (inclusive).
   * @returns Commitments ordered by block number.
   */
  getCommitmentsByBlockRange (fromBlock: bigint, toBlock: bigint): Promise<DBCommitment[]>

  /**
   * Delete commitments at or after a block height, used during reorg.
   * @param fromBlock - Block height from which to delete (inclusive).
   * @returns Normalized count of deleted rows.
   */
  deleteCommitmentsFromBlock (fromBlock: bigint): Promise<number>

  /**
   * Fetch the serialized Merkle tree for a given tree number.
   * @param treeNumber - Identifier of the Merkle tree.
   * @returns The Merkle tree record, or `undefined` when absent.
   */
  getMerkleTree (treeNumber: number): Promise<DBMerkleTree | undefined>

  /**
   * Fetch all Merkle trees, ordered ascending by tree number.
   * @returns All Merkle tree records.
   */
  getAllMerkleTrees (): Promise<DBMerkleTree[]>

  /**
   * Insert or update a Merkle tree record.
   * @param tree - Merkle tree data to persist.
   * @returns Normalized count of affected rows.
   */
  setMerkleTree (tree: DBNewMerkleTree): Promise<number>

  /**
   * Retrieve the synchronization state for a chain.
   * @param chainID - Identifier of the chain.
   * @returns The sync state, or `undefined` when absent.
   */
  getSyncState (chainID: number): Promise<DBSyncState | undefined>

  /**
   * Insert or update the commitment synchronization cursor for a chain.
   * @param chainID - Identifier of the chain.
   * @param lastBlockHeight - Last synced block height.
   * @returns Normalized count of affected rows.
   */
  updateSyncState (chainID: number, lastBlockHeight: bigint): Promise<number>

  /**
   * Read the independent Railgun TXID sync cursor for a chain.
   * @param chainID - Identifier of the chain.
   * @returns Last block height whose Railgun TXID rows were persisted, or `0n`.
   */
  getTxidSyncCursor (chainID: number): Promise<bigint>

  /**
   * Update the Railgun TXID sync cursor without changing the commitment cursor.
   * @param chainID - Identifier of the chain.
   * @param blockHeight - Last PPOI-complete block persisted for TXID state.
   * @returns Normalized count of affected rows.
   */
  setTxidSyncCursor (chainID: number, blockHeight: bigint): Promise<number>

  /**
   * Insert Railgun transactions, ignoring already-seen Railgun TXIDs. An empty
   * batch is a no-op and returns `0`.
   * @param rows - Railgun transaction rows to insert.
   * @returns Normalized count of inserted rows.
   */
  insertRailgunTransactions (rows: DBNewRailgunTransaction[]): Promise<number>

  /**
   * Fetch one Railgun transaction by its canonical Railgun TXID.
   * @param railgunTxid - Canonical Railgun transaction ID.
   * @returns The matching transaction, or `undefined`.
   */
  getRailgunTransactionByTxid (railgunTxid: Uint8Array): Promise<DBRailgunTransaction | undefined>

  /**
   * Fetch Railgun transactions within an inclusive block range, ordered
   * ascending by block number.
   * @param fromBlock - Start block height (inclusive).
   * @param toBlock - End block height (inclusive).
   * @returns Transactions ordered by block number.
   */
  getRailgunTransactionsByBlockRange (fromBlock: bigint, toBlock: bigint): Promise<DBRailgunTransaction[]>

  /**
   * Fetch Railgun transactions whose output batch starts in a tree range,
   * ordered ascending by output batch start position.
   * @param utxoTreeOut - Output UTXO tree number.
   * @param startPosition - Inclusive output start position.
   * @param endPosition - Inclusive output end position.
   * @returns Transactions ordered by output batch start position.
   */
  getRailgunTransactionsByTreeRange (utxoTreeOut: number, startPosition: number, endPosition: number): Promise<DBRailgunTransaction[]>

  /**
   * Find the Railgun transaction whose output batch contains the commitment at
   * a given tree position.
   * @param treeNumber - Output UTXO tree.
   * @param treePosition - Position of the commitment within that tree.
   * @returns The transaction that produced the commitment, or `undefined`.
   */
  findRailgunTransactionForLeaf (treeNumber: number, treePosition: number): Promise<DBRailgunTransaction | undefined>

  /**
   * Insert or update a batch of unshield events. An empty batch is a no-op and
   * returns `0`.
   * @param unshieldsBatch - Array of unshield records to upsert.
   * @returns Normalized count of affected rows.
   */
  insertUnshieldBatch (unshieldsBatch: DBNewUnshield[]): Promise<number>

  /**
   * Retrieve unshield records within an inclusive block range, ordered ascending
   * by block number.
   * @param fromBlock - Starting block height (inclusive).
   * @param toBlock - Ending block height (inclusive).
   * @returns Unshield records ordered by block number.
   */
  getUnshieldsByBlockRange (fromBlock: bigint, toBlock: bigint): Promise<DBUnshield[]>

  /**
   * Persist one scan batch atomically: nullifiers, commitments, unshields,
   * Railgun transactions, serialized Merkle trees, and the sync cursors either
   * all commit or all roll back together. The Railgun TXID cursor advances only
   * when at least one new Railgun transaction row was inserted; the commitment
   * sync cursor always advances. Absent or empty members are skipped.
   * @param batch - Scan batch to persist.
   */
  insertScanBatch (batch: ScanBatch): Promise<void>
}

export type { ChainStorage }
