/**
 * railgun-reloaded/storage/node - Complete Node persistence surface.
 *
 * Exposes the full storage API for a Node runtime: the platform-neutral
 * `ChainStorage` and `WalletStorage` contracts, the `better-sqlite3`-backed
 * adapter factories that satisfy them, the chain and wallet schemas, the
 * runtime-dependent queries, the note converter, and the database lifecycle
 * factories. The factories load the native `better-sqlite3` module lazily, so
 * this entry must only be imported from a Node runtime.
 */

export * from '../chain/index.js'
export * from '../wallet/index.js'
export type { ChainStorage, WalletStorage } from '../core/index.js'
export { createChainStorage } from './chain-storage.js'
export { createWalletStorage } from './wallet-storage.js'
