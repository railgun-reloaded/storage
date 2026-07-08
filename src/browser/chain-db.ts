import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { drizzle } from 'drizzle-orm/sqlite-proxy'

import * as schema from '../chain/schema.js'

import { chainMigrations } from './migration-catalog.generated.js'
import type { BrowserDBConfig } from './open-db.js'
import { openBrowserClient, remoteCallback } from './open-db.js'
import type { SqliteWorkerClient } from './sqlite-client.js'

/** Configuration options for creating a browser chain database. */
type BrowserChainDBConfig = BrowserDBConfig

/** Drizzle database over the chain schema backed by a worker connection. */
type BrowserChainDB = SqliteRemoteDatabase<typeof schema> & {
  $client: SqliteWorkerClient
}

/**
 * Create a drizzle SQLite database for storing chain events in the browser,
 * applying pending migrations from the embedded catalog before resolving.
 * Persistent databases live in the origin-private file system under the
 * given logical name; ephemeral databases live exactly as long as the
 * connection.
 * @param config - Browser chain database configuration options.
 * @returns A configured browser chain database.
 */
async function createChainDB (config: BrowserChainDBConfig): Promise<BrowserChainDB> {
  const client = await openBrowserClient(config, 'chain', chainMigrations)
  const db = drizzle(remoteCallback(client), { schema }) as BrowserChainDB
  db.$client = client
  return db
}

/**
 * Close the chain database connection, releasing the worker and any OPFS
 * access handles. Stored data is never deleted; use `deleteDatabase` for
 * explicit removal.
 * @param db - The browser chain database to close.
 */
async function closeChainDB (db: BrowserChainDB): Promise<void> {
  await db.$client.close()
}

export { createChainDB, closeChainDB }
export type { BrowserChainDB, BrowserChainDBConfig }
