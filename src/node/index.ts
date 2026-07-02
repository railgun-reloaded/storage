/**
 * railgun-reloaded/storage/node - Node database adapter entry.
 *
 * Provides only what requires a Node runtime: the `better-sqlite3` database
 * lifecycle factories, the chain bootstrap flow, the transaction capability
 * for the synchronous driver, and the adapter factories that wire a Node
 * database into the platform-neutral `ChainStorage` and `WalletStorage`
 * contracts. Everything else — the contracts, the storage factories, the
 * schemas, and the domain types — lives on the root entry. The factories
 * load the native `better-sqlite3` module lazily, so this entry must only be
 * imported from a Node runtime.
 */

export type { SnapshotCheckpointInput } from '../chain/queries.js'
export * from './chain-bootstrap.js'
export * from './chain-db.js'
export { createChainStorage, recordSnapshotCheckpoint } from './chain-storage.js'
export { createSqliteTransactor } from './transaction.js'
export * from './wallet-db.js'
export { createWalletStorage } from './wallet-storage.js'
