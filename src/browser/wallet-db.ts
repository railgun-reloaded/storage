import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

import * as schema from '../wallet/schema.js'

import { walletMigrations } from './migration-catalog.generated.js'
import type { BrowserDBConfig } from './open-db.js'
import { openBrowserClient, remoteCallback } from './open-db.js'
import type { SqliteWorkerClient } from './sqlite-client.js'

/** Configuration options for creating a browser wallet database. */
type BrowserWalletDBConfig = BrowserDBConfig

/** Drizzle database over the wallet schema backed by a worker connection. */
type BrowserWalletDB = SqliteRemoteDatabase<typeof schema> & {
  $client: SqliteWorkerClient
}

/**
 * Create a drizzle SQLite database for wallet state in the browser,
 * applying pending migrations from the embedded catalog before resolving.
 * One wallet database holds any number of wallets (the shared multi-wallet
 * schema); the logical name is chosen by the application.
 * @param config - Browser wallet database configuration options.
 * @returns A configured browser wallet database.
 */
async function createWalletDB (config: BrowserWalletDBConfig): Promise<BrowserWalletDB> {
  const client = await openBrowserClient(config, 'wallet', walletMigrations)
  const db = drizzle(remoteCallback(client), { schema }) as BrowserWalletDB
  db.$client = client
  return db
}

/**
 * Close the wallet database connection, releasing the worker and any OPFS
 * access handles. Stored data is never deleted; use `deleteDatabase` for
 * explicit removal.
 * @param db - The browser wallet database to close.
 */
async function closeWalletDB (db: BrowserWalletDB): Promise<void> {
  await db.$client.close()
}

export { createWalletDB, closeWalletDB }
export type { BrowserWalletDB, BrowserWalletDBConfig }
