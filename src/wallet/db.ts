import path from 'path'

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

const DEFAULT_WALLET_MIGRATION_FOLDER = './drizzle/wallet'
/**
 * Create and configure a wallet database instance.
 * @param config - Options controlling database path, pragmas, migrations, and
 *   verbosity.
 * @returns WalletDB instance.
 */
function createWalletDB (config: WalletDBConfig): WalletDB {
  const {
    path: dbPath,
    runMigrations = true,
    migrationsFolder,
    verbose = false,
    encryptionKey,
  } = config

  const sqlite = new Database(dbPath, {
    verbose: verbose ? console.log : undefined,
  })

  if (encryptionKey) {
    console.warn('SQLCipher encryption not yet implemented')
  }

  configurePragmas(sqlite)

  const db = drizzle(sqlite, { schema }) as WalletDB
  db.$client = sqlite

  if (runMigrations) {
    /**
     * We try to locate the drizzle/ folder relative to this package, instead of
     * the package that includes it as a dependency. This prevents consumers from
     * needing a drizzle/ folder of their own.
     */
    const migrationFilePath = path.resolve(__dirname, '../../', migrationsFolder ?? DEFAULT_WALLET_MIGRATION_FOLDER)
    try {
      migrate(db, { migrationsFolder: migrationFilePath })
      if (verbose) {
        console.log(`Wallet database migrations applied: ${dbPath}`)
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
 */
function configurePragmas (sqlite: Database.Database): void {
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
