import type { SnapshotCheckpointInput } from '../chain/queries.js'
import { applySnapshotCheckpoint } from '../chain/queries.js'
import type { ChainStorage } from '../core/chain-storage.js'
import { createChainStorage as buildChainStorage } from '../core/create-chain-storage.js'

import type { ChainDB } from './chain-db.js'
import { createSqliteTransactor } from './transaction.js'

/**
 * Construct a `ChainStorage` backed by a Node `better-sqlite3` database.
 * @param db - The chain database handle to bind.
 * @returns A `ChainStorage` implementation delegating to the bound database.
 */
function createChainStorage (db: ChainDB): ChainStorage {
  return buildChainStorage(db, createSqliteTransactor(db))
}

/**
 * Record a validated snapshot checkpoint atomically on a Node
 * `better-sqlite3` database.
 * @param db - Staged chain database.
 * @param checkpoint - Validated checkpoint metadata.
 */
async function recordSnapshotCheckpoint (db: ChainDB, checkpoint: SnapshotCheckpointInput): Promise<void> {
  await createSqliteTransactor(db)((tx) => applySnapshotCheckpoint(tx, checkpoint))
}

export { createChainStorage, recordSnapshotCheckpoint }
