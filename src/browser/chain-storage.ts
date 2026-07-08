import type { SnapshotCheckpointInput } from '../chain/queries.js'
import { applySnapshotCheckpoint } from '../chain/queries.js'
import type { ChainStorage } from '../core/chain-storage.js'
import { createChainStorage as buildChainStorage } from '../core/create-chain-storage.js'

import type { BrowserChainDB } from './chain-db.js'
import { createWorkerSqliteTransactor } from './transaction.js'

/**
 * Construct a `ChainStorage` backed by a browser worker database.
 * @param db - The chain database handle to bind.
 * @returns A `ChainStorage` implementation delegating to the bound database.
 */
function createChainStorage (db: BrowserChainDB): ChainStorage {
  return buildChainStorage(db, createWorkerSqliteTransactor(db))
}

/**
 * Record a validated snapshot checkpoint atomically on a browser worker
 * database.
 * @param db - Staged chain database.
 * @param checkpoint - Validated checkpoint metadata.
 */
async function recordSnapshotCheckpoint (db: BrowserChainDB, checkpoint: SnapshotCheckpointInput): Promise<void> {
  await createWorkerSqliteTransactor(db)((tx) => applySnapshotCheckpoint(tx, checkpoint))
}

export { createChainStorage, recordSnapshotCheckpoint }
