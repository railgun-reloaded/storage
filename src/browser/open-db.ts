import type { RemoteCallback } from 'drizzle-orm/sqlite-proxy'

import { assertValidDatabaseName, lockNameForDatabase, poolNameForDatabase } from './database-name.js'
import { BrowserStorageError } from './errors.js'
import type { MigrationEntry } from './migrations.js'
import type { PragmaProfile, SqlParam } from './protocol.js'
import { SqliteWorkerClient } from './sqlite-client.js'

/**
 * Configuration options shared by the browser database factories. Databases
 * are addressed by logical name, not filesystem path; see
 * `chainDatabaseName` for the documented per-chain convention. The name
 * space is shared across chain and wallet databases, exactly as file paths
 * are shared in the Node adapter.
 */
type BrowserDBConfig = {
  /** Logical database name. Required for persistent databases. */
  name?: string
  /**
   * Open an isolated throwaway database instead of persistent storage. An
   * ephemeral database lives exactly as long as its connection and leaves
   * no data in the browser.
   */
  ephemeral?: boolean
  /**
   * Wait for the database lock instead of failing fast with
   * `DATABASE_BUSY` when another tab or worker holds the database.
   */
  waitForLock?: boolean
}

/**
 * Fail when a capability the adapter depends on is missing in this context.
 * @param persistent - Whether persistent storage capabilities are required.
 */
function assertBrowserCapabilities (persistent: boolean): void {
  if (typeof Worker !== 'function') {
    throw new BrowserStorageError(
      'UNSUPPORTED_ENVIRONMENT',
      'The browser storage adapter requires dedicated Workers, which this context does not provide.'
    )
  }
  if (typeof WebAssembly !== 'object') {
    throw new BrowserStorageError(
      'UNSUPPORTED_ENVIRONMENT',
      'The browser storage adapter requires WebAssembly, which this context does not provide.'
    )
  }
  if (persistent && typeof navigator.storage?.getDirectory !== 'function') {
    throw new BrowserStorageError(
      'UNSUPPORTED_ENVIRONMENT',
      'Persistent databases require the origin-private file system (navigator.storage.getDirectory). Use { ephemeral: true } or run in a context that provides OPFS.'
    )
  }
}

/**
 * Open a worker-hosted connection for a factory.
 * @param config - Caller configuration.
 * @param pragmas - Pragma profile for the database domain.
 * @param migrations - Embedded migration catalog for the database domain.
 * @returns The open client.
 */
async function openBrowserClient (config: BrowserDBConfig, pragmas: PragmaProfile, migrations: MigrationEntry[]): Promise<SqliteWorkerClient> {
  const ephemeral = config.ephemeral === true
  assertBrowserCapabilities(!ephemeral)
  if (!ephemeral && config.name === undefined) {
    throw new BrowserStorageError(
      'INITIALIZATION_FAILED',
      'A persistent database requires a logical name. Pass { name } (see chainDatabaseName for the chain convention) or open with { ephemeral: true }.'
    )
  }
  const name = config.name ?? 'ephemeral'
  assertValidDatabaseName(name)
  return SqliteWorkerClient.open({
    databaseName: name,
    poolName: ephemeral ? null : poolNameForDatabase(name),
    lockName: ephemeral ? null : lockNameForDatabase(name),
    pragmas,
    migrations,
    waitForLock: config.waitForLock === true,
  })
}

/**
 * Build the drizzle `sqlite-proxy` callback for a worker connection.
 *
 * The declared `RemoteCallback` type requires `rows` to always be an array,
 * but the driver's documented behavior for a no-row `get` is a missing
 * `rows`, which its runtime handles; the cast bridges that gap.
 * @param client - The worker connection to execute against.
 * @returns The remote callback for `drizzle`.
 */
function remoteCallback (client: SqliteWorkerClient): RemoteCallback {
  return (async (sql: string, params: unknown[], method: 'run' | 'all' | 'values' | 'get') =>
    client.exec(sql, params as SqlParam[], method)) as RemoteCallback
}

export { openBrowserClient, assertBrowserCapabilities, remoteCallback }
export type { BrowserDBConfig }
