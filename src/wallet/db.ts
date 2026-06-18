import path from 'path'

import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { loadDatabaseRuntime } from '../sqlite-loader.js'

import * as schema from './schema.js'

/**
 * Configuration options for creating a wallet database.
 */
type WalletDBConfig = {
  path: string;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
  encryptionKey?: string;
}

/**
 * Extended drizzle database type specialized to the wallet schema.
 */
type WalletDB = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
}

const DEFAULT_WALLET_MIGRATION_FOLDER = './drizzle/wallet'
/**
 * Create and configure a wallet database instance.
 * @param config - Options controlling database path, pragmas, migrations, and
 *   verbosity.
 * @returns WalletDB instance.
 */
async function createWalletDB (config: WalletDBConfig): Promise<WalletDB> {
  const {
    path: dbPath,
    runMigrations = true,
    migrationsFolder,
    verbose = false,
    encryptionKey,
  } = config

  const { Database: SqliteDatabase, drizzle, migrate } = await loadDatabaseRuntime()
  const sqlite = new SqliteDatabase(dbPath, {
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
    const migrationFilePath = path.resolve(import.meta.dirname, '../../', migrationsFolder ?? DEFAULT_WALLET_MIGRATION_FOLDER)
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
async function closeWalletDB (db: WalletDB): Promise<void> {
  const sqlite = db.$client
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close()
  }
}

/**
 * Run optimization pragmas on the wallet database.
 * @param db - Wallet database instance to optimize.
 */
async function optimizeWalletDB (db: WalletDB): Promise<void> {
  const sqlite = db.$client
  sqlite.pragma('analysis_limit = 1000')
  sqlite.pragma('optimize')
}

/**
 * Calculate the size of the wallet database file in bytes.
 * @param db - Wallet database instance to inspect.
 * @returns Total size in bytes.
 */
async function getWalletDBSize (db: WalletDB): Promise<number> {
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
async function backupWalletDB (db: WalletDB, backupPath: string): Promise<void> {
  const sqlite = db.$client
  await sqlite.backup(backupPath)
}

/**
 * Change the encryption key for the wallet database (not yet implemented).
 * @param _db - Wallet database instance.
 * @param _newKey - New encryption key to set.
 * @throws Always throws until SQLCipher support is added.
 */
async function rekeyWalletDB (_db: WalletDB, _newKey: string): Promise<void> {
  // Future: SQLCipher rekey
  // const sqlite = db.$client;
  // sqlite.pragma(`rekey = '${newKey}'`);
  throw new Error('Database rekeying not yet implemented')
}

export type { WalletDB, WalletDBConfig }
export { createWalletDB, closeWalletDB, optimizeWalletDB, getWalletDBSize, backupWalletDB, rekeyWalletDB }
