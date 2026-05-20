/**
 * Wallet database module - Private wallet-specific storage.
 *
 * Stores encrypted keys, decrypted notes, scan state, and transaction history.
 * One database instance per wallet.
 */

export * from './db'
export * from './note-converter'
export * from './queries'
export * from './schema'
