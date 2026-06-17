/**
 * railgun-reloaded/storage - Platform-neutral persistence surface.
 *
 * This root entry exposes the shared, runtime-agnostic surface: schemas,
 * queries, and the note converter. It deliberately does not reach the
 * `better-sqlite3` factory implementation, so it is safe to import from
 * browser and React Native bundles. The Node SQLite factory lives behind the
 * `./node` subpath.
 * @example
 * ```typescript
 * import { getUnspentNotes } from '@railgun-reloaded/storage';
 * import { createWalletDB } from '@railgun-reloaded/storage/node';
 * ```
 */

export * from './chain/schema'
export * from './chain/queries'
export * from './wallet/schema'
export * from './wallet/queries'
export * from './wallet/note-converter'
