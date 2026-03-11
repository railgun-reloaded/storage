import Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema'

/**
 * Configuration options for creating a wallet database.
 */
interface WalletDBConfig {
  path: string;
  enableWAL?: boolean;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
  encryptionKey?: string;
}

/**
 * Extended drizzle database type specialized to the wallet schema.
 */
interface WalletDB extends BetterSQLite3Database<typeof schema> {
  $client: Database.Database;
}

/**
 * Create and configure a wallet database instance.
 * @param config - Options controlling database path, pragmas, migrations, and
 *   verbosity.
 * @returns WalletDB instance.
 */
function createWalletDB (config: WalletDBConfig): WalletDB {
  const {
    path,
    enableWAL = path !== ':memory:',
    runMigrations = true,
    migrationsFolder = './drizzle/wallet',
    verbose = false,
    encryptionKey,
  } = config

  const sqlite = new Database(path, {
    verbose: verbose ? console.log : undefined,
  })

  if (encryptionKey) {
    console.warn('SQLCipher encryption not yet implemented')
  }

  configurePragmas(sqlite, enableWAL)

  const db = drizzle(sqlite, { schema }) as WalletDB
  db.$client = sqlite

  if (runMigrations && path !== ':memory:') {
    try {
      migrate(db, { migrationsFolder })
      if (verbose) {
        console.log(`Wallet database migrations applied: ${path}`)
      }
    } catch (error) {
      console.error('Failed to apply wallet database migrations:', error)
      throw error
    }
  }

  return db
}

/**
 * Apply recommended SQLite pragmas for wallet databases.
 * @param sqlite - The underlying SQLite database instance.
 * @param enableWAL - Whether to enable Write-Ahead Logging (WAL).
 */
function configurePragmas (sqlite: Database.Database, enableWAL: boolean): void {
  if (enableWAL) {
    sqlite.pragma('journal_mode = WAL')
  }

  sqlite.pragma('synchronous = FULL')
  sqlite.pragma('cache_size = -5000')
  sqlite.pragma('temp_store = MEMORY')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('auto_vacuum = FULL')
}

/**
 * Close a wallet database if it is not currently in a transaction.
 * @param db - Wallet database instance to close.
 */
function closeWalletDB (db: WalletDB): void {
  const sqlite = db.$client
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close()
  }
}

/**
 * Run optimization pragmas on the wallet database.
 * @param db - Wallet database instance to optimize.
 */
function optimizeWalletDB (db: WalletDB): void {
  const sqlite = db.$client
  sqlite.pragma('analysis_limit = 1000')
  sqlite.pragma('optimize')
}

/**
 * Calculate the size of the wallet database file in bytes.
 * @param db - Wallet database instance to inspect.
 * @returns Total size in bytes.
 */
function getWalletDBSize (db: WalletDB): number {
  const sqlite = db.$client
  const result = sqlite.pragma('page_count', { simple: true }) as number
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number
  return result * pageSize
}

/**
 * Create a physical backup of the wallet database to a given path.
 * @param db - Wallet database instance to back up.
 * @param backupPath - Destination file path for the backup.
 */
function backupWalletDB (db: WalletDB, backupPath: string): void {
  const sqlite = db.$client
  sqlite.backup(backupPath)
}

/**
 * Change the encryption key for the wallet database (not yet implemented).
 * @param _db - Wallet database instance.
 * @param _newKey - New encryption key to set.
 * @throws Always throws until SQLCipher support is added.
 */
function rekeyWalletDB (_db: WalletDB, _newKey: string): void {
  // Future: SQLCipher rekey
  // const sqlite = db.$client;
  // sqlite.pragma(`rekey = '${newKey}'`);
  throw new Error('Database rekeying not yet implemented')
}

export type { WalletDB, WalletDBConfig }
export { createWalletDB, closeWalletDB, optimizeWalletDB, getWalletDBSize, backupWalletDB, rekeyWalletDB }
