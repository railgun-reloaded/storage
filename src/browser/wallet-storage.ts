import { createWalletStorage as buildWalletStorage } from '../core/create-wallet-storage.js'
import type { WalletStorage } from '../core/wallet-storage.js'

import { createWorkerSqliteTransactor } from './transaction.js'
import type { BrowserWalletDB } from './wallet-db.js'

/**
 * Construct a `WalletStorage` backed by a browser worker database.
 * @param db - The wallet database handle to bind.
 * @returns A `WalletStorage` implementation delegating to the bound database.
 */
function createWalletStorage (db: BrowserWalletDB): WalletStorage {
  return buildWalletStorage(db, createWorkerSqliteTransactor(db))
}

export { createWalletStorage }
