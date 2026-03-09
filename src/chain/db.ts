import Database from 'better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema'

export interface ChainDBConfig {
  path: string;
  enableWAL?: boolean;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
}

export interface ChainDB extends BetterSQLite3Database<typeof schema> {
  $client: Database.Database;
}

const DEFAULT_MIGRATION_FOLDER = './drizzle/chain'
export function createChainDB (config: ChainDBConfig): ChainDB {
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
    try {
      const migrationFilePath = migrationsFolder ?? DEFAULT_MIGRATION_FOLDER
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

export function closeChainDB (db: ChainDB): void {
  const sqlite = db.$client
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close()
  }
}

export function optimizeChainDB (db: ChainDB, vacuum: boolean = false): void {
  const sqlite = db.$client

  sqlite.pragma('analysis_limit = 1000')
  sqlite.pragma('optimize')

  if (vacuum) {
    sqlite.exec('VACUUM')
  }
}

export function getChainDBSize (db: ChainDB): number {
  const sqlite = db.$client
  const result = sqlite.pragma('page_count', { simple: true }) as number
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number
  return result * pageSize
}

export function backupChainDB (db: ChainDB, backupPath: string): void {
  const sqlite = db.$client
  sqlite.backup(backupPath)
}
