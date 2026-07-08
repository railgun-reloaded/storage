/**
 * railgun-reloaded/storage/browser - Browser database adapter entry.
 *
 * Provides only what requires a browser runtime: worker-hosted SQLite
 * database lifecycle factories over `@sqlite.org/sqlite-wasm` (persistent
 * databases use the `opfs-sahpool` VFS in the origin-private file system;
 * ephemeral databases live as long as their connection), the transaction
 * capability for the worker driver, explicit database deletion, and the
 * adapter factories that wire a browser database into the platform-neutral
 * `ChainStorage` and `WalletStorage` contracts. Everything else - the
 * contracts, the storage factories, the schemas, and the domain types -
 * lives on the root entry. The driver is loaded inside a dedicated worker,
 * so this entry must only be imported from a browser runtime that provides
 * Workers, WebAssembly, and (for persistent databases) OPFS and Web Locks.
 */

export type { SnapshotCheckpointInput } from '../chain/queries.js'
export * from './chain-db.js'
export { createChainStorage, recordSnapshotCheckpoint } from './chain-storage.js'
export { chainDatabaseName } from './database-name.js'
export { deleteDatabase } from './delete.js'
export { BrowserStorageError } from './errors.js'
export type { BrowserStorageErrorCode } from './errors.js'
export type { BrowserDBConfig } from './open-db.js'
export { createWorkerSqliteTransactor } from './transaction.js'
export * from './wallet-db.js'
export { createWalletStorage } from './wallet-storage.js'
