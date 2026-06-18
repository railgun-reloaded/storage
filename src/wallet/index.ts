/**
 * Wallet database module - Private wallet-specific storage.
 *
 * Stores encrypted keys, decrypted notes, scan state, and transaction history.
 * One database instance per wallet.
 */

export * from './db.js'
export * from './note-converter.js'
export * from './queries.js'
export * from './schema.js'
