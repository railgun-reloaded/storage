import { createWalletStorage as buildWalletStorage } from '../core/create-wallet-storage.js'
import type { WalletStorage } from '../core/wallet-storage.js'

import { createSqliteTransactor } from './transaction.js'
import type { WalletDB } from './wallet-db.js'

/**
 * Construct a `WalletStorage` backed by a Node `better-sqlite3` database.
 * @param db - The wallet database handle to bind.
 * @returns A `WalletStorage` implementation delegating to the bound database.
 */
function createWalletStorage (db: WalletDB): WalletStorage {
  return buildWalletStorage(db, createSqliteTransactor(db))
}

export { createWalletStorage }
