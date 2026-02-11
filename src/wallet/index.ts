/**
 * Wallet database module - Private wallet-specific storage.
 *
 * Stores encrypted keys, decrypted notes, balances, scan state, and transaction history.
 * One database instance per wallet.
 */

export * from './schema';
export * from './db';
export * from './queries';
