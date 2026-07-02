/**
 * railgun-reloaded/storage - Runtime-agnostic persistence surface.
 *
 * This root entry exposes the platform-neutral `ChainStorage` and
 * `WalletStorage` contracts, the shared storage factories that implement
 * them for any drizzle SQLite database, the chain and wallet schemas, their
 * domain types, and the note converter. It carries no native database
 * dependency. Environment-neutral code consumes the contracts; only
 * application code picks a database adapter. The Node `better-sqlite3`
 * adapter lives behind the `./node` subpath.
 * @example
 * ```typescript
 * // Environment-neutral code (an SDK, a service) consumes the contracts:
 * import type { ChainStorage, WalletStorage } from '@railgun-reloaded/storage';
 *
 * // Application code picks the adapter for its runtime:
 * import { createChainDB, createChainStorage } from '@railgun-reloaded/storage/node';
 * const chainDB = await createChainDB({ path: 'chain.db' });
 * const chainStorage: ChainStorage = createChainStorage(chainDB);
 * ```
 */

export type {
  ChainStorage,
  WalletStorage,
  ChainDatabase,
  WalletDatabase,
  Transactor,
  ScanBatch,
  NoteIdentity,
  NoteNullifierIdentity,
  NotePoiStatusUpdate,
  WalletDBStats,
} from './core/index.js'
export { createChainStorage, createWalletStorage } from './core/index.js'
export * from './chain/schema.js'
export * from './wallet/schema.js'
export * from './wallet/note-converter.js'
