import Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema'

/**
 * Configuration options for creating a chain database instance.
 */
interface ChainDBConfig {
  path: string;
  enableWAL?: boolean;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
}

interface ChainDB extends BetterSQLite3Database<typeof schema> {
  $client: Database.Database;
}

const DEFAULT_CHAIN_MIGRATION_FOLDER = './drizzle/chain'
/**
 * Create a Drizzle SQLite database for storing chain events.
 * SQLite methods are synchronous, so callers do not need to await operations.
 * @param config - ChainDB creation configuration options.
 * @returns A configured ChainDB instance.
 */
function createChainDB (config: ChainDBConfig): ChainDB {
  const {
    path,
    enableWAL,
    runMigrations,
    migrationsFolder,
    verbose,
  } = config

  const sqlite = new Database(path, {
    verbose: verbose ? console.log : undefined,
  })

  configurePragmas(sqlite, enableWAL || false)

  const db = drizzle(sqlite, { schema }) as ChainDB
  db.$client = sqlite

  if (runMigrations) {
    const migrationFilePath = migrationsFolder ?? DEFAULT_CHAIN_MIGRATION_FOLDER
    try {
      migrate(db, { migrationsFolder: migrationFilePath })
      if (verbose) {
        console.log(`Chain database migrations applied: ${path}`)
      }
    } catch (error) {
      console.error('Failed to apply chain database migrations:', error)
      throw error
    }
  }

  return db
}

/**
 * Configure common SQLite pragmas on the provided database instance.
 * @param sqlite - The database instance to configure.
 * @param enableWAL - Whether to enable Write-Ahead Logging for concurrent
 *   read/write access.
 */
function configurePragmas (sqlite: Database.Database, enableWAL: boolean): void {
  if (enableWAL) {
    sqlite.pragma('journal_mode = WAL')
  }

  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('cache_size = -10000')
  sqlite.pragma('temp_store = MEMORY')
  sqlite.pragma('mmap_size = 268435456')
  sqlite.pragma('foreign_keys = ON')
}

/**
 * Close the chain database if it is not currently in a transaction.
 * @param db - The ChainDB instance to close.
 */
function closeChainDB (db: ChainDB): void {
  const sqlite = db.$client
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close()
  }
}

/**
 * Perform optimization and maintenance on the database.
 * @param db - The ChainDB instance to optimize.
 * @param vacuum - If true, performs a `VACUUM` which rebuilds the database file,
 *   defragments it, and reclaims unused space. This operation can be slow on
 *   large databases.
 */
function optimizeChainDB (db: ChainDB, vacuum: boolean = false): void {
  const sqlite = db.$client

  sqlite.pragma('analysis_limit = 1000')
  sqlite.pragma('optimize')

  if (vacuum) {
    sqlite.exec('VACUUM')
  }
}

/**
 * Query the total size occupied by the database file.
 * @param db - The ChainDB instance to inspect.
 * @returns The total size used by the database in bytes.
 */
function getChainDBSize (db: ChainDB): number {
  const sqlite = db.$client
  const result = sqlite.pragma('page_count', { simple: true }) as number
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number
  return result * pageSize
}

/**
 * Create a backup of the provided database instance.
 * @param db - The ChainDB instance to back up.
 * @param backupPath - Filesystem path where the backup should be written.
 */
function backupChainDB (db: ChainDB, backupPath: string): void {
  const sqlite = db.$client
  sqlite.backup(backupPath)
}

export { createChainDB, closeChainDB, optimizeChainDB, getChainDBSize, backupChainDB }
export type { ChainDB, ChainDBConfig }
