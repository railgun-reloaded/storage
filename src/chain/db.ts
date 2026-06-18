import fs from 'fs'
import path from 'path'

import type Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'

import { loadDatabaseRuntime } from '../sqlite-loader'

import * as schema from './schema'

/**
 * Configuration options for creating a chain database instance.
 */
type ChainDBConfig = {
  path: string;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
}

type ChainDB = BetterSQLite3Database<typeof schema> & {
  $client: Database.Database;
}

const DEFAULT_CHAIN_MIGRATION_FOLDER = './drizzle/chain'
/**
 * Create a Drizzle SQLite database for storing chain events, applying
 * pending migrations when needed.
 * @param config - ChainDB creation configuration options.
 * @returns A configured ChainDB instance.
 */
async function createChainDB (config: ChainDBConfig): Promise<ChainDB> {
  const {
    path: dbPath,
    runMigrations,
    migrationsFolder,
    verbose,
  } = config

  let dbExists = false
  if (dbPath !== ':memory:') {
    const fullPath = path.resolve(process.cwd(), dbPath)
    dbExists = fs.existsSync(fullPath)
  }

  const { Database: SqliteDatabase, drizzle, migrate } = await loadDatabaseRuntime()
  const sqlite = new SqliteDatabase(dbPath, {
    verbose: verbose ? console.log : undefined,
  })

  configurePragmas(sqlite)

  const db = drizzle(sqlite, { schema }) as ChainDB
  db.$client = sqlite
  /**
   * Drizzle tables need to be migrated when the database is created for the first time.
   * When we build storage package, the schema should be generated in drizzle/ folder.
   */
  if (!dbExists || runMigrations) {
    let migrationFilePath = migrationsFolder ?? DEFAULT_CHAIN_MIGRATION_FOLDER
    /**
     * We try to locate the drizzle/ folder relative to this package, instead of
     * package that include it as it's dependency. This prevent us from making drizzle/ (schema)
     * folder in our wallet sdk. It automatically migrate it if it is created for the first time
     * or if we explicitly enable migration.
     */
    migrationFilePath = path.resolve(__dirname, '../../', migrationFilePath)
    try {
      migrate(db, { migrationsFolder: migrationFilePath })
      if (verbose) {
        console.log(`Chain database migrations applied: ${dbPath}`)
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
 */
function configurePragmas (sqlite: Database.Database): void {
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
async function closeChainDB (db: ChainDB): Promise<void> {
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
async function optimizeChainDB (db: ChainDB, vacuum: boolean = false): Promise<void> {
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
async function getChainDBSize (db: ChainDB): Promise<number> {
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
async function backupChainDB (db: ChainDB, backupPath: string): Promise<void> {
  const sqlite = db.$client
  await sqlite.backup(backupPath)
}

export { createChainDB, closeChainDB, optimizeChainDB, getChainDBSize, backupChainDB }
export type { ChainDB, ChainDBConfig }
