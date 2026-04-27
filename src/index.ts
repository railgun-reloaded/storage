/**
 * railgun-reloaded/storage - Persistence layer for RAILGUN Reloaded
 *
 * Two-database architecture:
 * - chain.db: Public blockchain state (shared across wallets)
 * - wallet.db: Private wallet data (one per wallet)
 *
 * Built on Drizzle ORM with SQLite for type-safe, performant persistence.
 * @example
 * ```typescript
 * import { createChainDB, createWalletDB } from '@reloaded/storage';
 *
 * // Create chain database (shared)
 * const chainDb = createChainDB({
 *   path: '~/.railgun/chains/1/chain.db',
 * });
 *
 * // Create wallet database (per-wallet)
 * const walletDb = createWalletDB({
 *   path: '~/.railgun/wallets/my-wallet/wallet.db',
 * });
 * ```
 */

// Re-export everything from chain and wallet modules
export * from './chain/index'
export * from './wallet/index'
