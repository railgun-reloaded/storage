/**
 * railgun-reloaded/storage - Runtime-agnostic persistence surface.
 *
 * This root entry exposes only the static, driver-independent surface: the
 * platform-neutral `ChainStorage` and `WalletStorage` contracts, the chain and
 * wallet schemas, their domain types, and the note converter. It carries no
 * native database dependency. The Node SQLite factories, the runtime adapters,
 * and the runtime-dependent queries live behind the `./node` subpath.
 * @example
 * ```typescript
 * import type { ChainStorage, WalletStorage, DBNewNote } from '@railgun-reloaded/storage';
 * import { createChainStorage, createWalletStorage, createWalletDB } from '@railgun-reloaded/storage/node';
 * ```
 */

export type {
  ChainStorage,
  WalletStorage,
  ScanBatch,
  NoteIdentity,
  NoteNullifierIdentity,
  NotePoiStatusUpdate,
  WalletDBStats,
} from './core/index.js'
export * from './chain/schema.js'
export * from './wallet/schema.js'
export * from './wallet/note-converter.js'
