import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

export interface WalletDBConfig {
  path: string;
  enableWAL?: boolean;
  runMigrations?: boolean;
  migrationsFolder?: string;
  verbose?: boolean;
  encryptionKey?: string;
}

export interface WalletDB extends BetterSQLite3Database<typeof schema> {
  $client: Database.Database;
}

export function createWalletDB(config: WalletDBConfig): WalletDB {
  const {
    path,
    enableWAL = path !== ':memory:',
    runMigrations = true,
    migrationsFolder = './drizzle/wallet',
    verbose = false,
    encryptionKey,
  } = config;

  const sqlite = new Database(path, {
    verbose: verbose ? console.log : undefined,
  });

  if (encryptionKey) {
    console.warn('SQLCipher encryption not yet implemented');
  }

  configurePragmas(sqlite, enableWAL);

  const db = drizzle(sqlite, { schema }) as WalletDB;
  db.$client = sqlite;

  if (runMigrations && path !== ':memory:') {
    try {
      migrate(db, { migrationsFolder });
      if (verbose) {
        console.log(`Wallet database migrations applied: ${path}`);
      }
    } catch (error) {
      console.error('Failed to apply wallet database migrations:', error);
      throw error;
    }
  }

  return db;
}

function configurePragmas(sqlite: Database.Database, enableWAL: boolean): void {
  if (enableWAL) {
    sqlite.pragma('journal_mode = WAL');
  }

  sqlite.pragma('synchronous = FULL');
  sqlite.pragma('cache_size = -5000');
  sqlite.pragma('temp_store = MEMORY');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('auto_vacuum = FULL');
}

export function closeWalletDB(db: WalletDB): void {
  const sqlite = db.$client;
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close();
  }
}

export function optimizeWalletDB(db: WalletDB): void {
  const sqlite = db.$client;
  sqlite.pragma('analysis_limit = 1000');
  sqlite.pragma('optimize');
}

export function getWalletDBSize(db: WalletDB): number {
  const sqlite = db.$client;
  const result = sqlite.pragma('page_count', { simple: true }) as number;
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
  return result * pageSize;
}

export function backupWalletDB(db: WalletDB, backupPath: string): void {
  const sqlite = db.$client;
  sqlite.backup(backupPath);
}

export function rekeyWalletDB(_db: WalletDB, _newKey: string): void {
  // Future: SQLCipher rekey
  // const sqlite = db.$client;
  // sqlite.pragma(`rekey = '${newKey}'`);
  throw new Error('Database rekeying not yet implemented');
}
