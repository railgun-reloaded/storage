/**
 * railgun-reloaded/storage - Runtime-agnostic persistence surface.
 *
 * This root entry exposes only the static, driver-independent surface: the
 * chain and wallet schemas, their types, and the note converter. It carries no
 * native database dependency. The Node SQLite factory and the runtime-dependent
 * queries live behind the `./node` subpath.
 * @example
 * ```typescript
 * import type { DBNewNote } from '@railgun-reloaded/storage';
 * import { createWalletDB, getUnspentNotes } from '@railgun-reloaded/storage/node';
 * ```
 */

export * from './chain/schema'
export * from './wallet/schema'
export * from './wallet/note-converter'
