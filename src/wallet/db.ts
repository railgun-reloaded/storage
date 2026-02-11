import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * Configuration options for creating a wallet database.
 */
export interface WalletDBConfig {
  /**
   * Path to the SQLite database file.
   * Use ':memory:' for in-memory database (testing).
   */
  path: string;

  /**
   * Whether to enable Write-Ahead Logging (WAL) mode.
   * Default: true for file-based, false for in-memory.
   */
  enableWAL?: boolean;

  /**
   * Whether to run migrations on initialization.
   * Default: true
   */
  runMigrations?: boolean;

  /**
   * Path to migrations folder.
   * Default: './drizzle/wallet'
   */
  migrationsFolder?: string;

  /**
   * Whether to enable verbose logging.
   * Default: false
   */
  verbose?: boolean;

  /**
   * SQLCipher encryption key (future enhancement).
   * When provided, uses encrypted database.
   */
  encryptionKey?: string;
}

/**
 * Wallet database instance with typed schema.
 * Includes both Drizzle wrapper and underlying SQLite client.
 */
export interface WalletDB extends BetterSQLite3Database<typeof schema> {
  $client: Database.Database;
}

/**
 * Creates and initializes a wallet database instance.
 *
 * The wallet database stores private wallet-specific data:
 * - Encrypted keys
 * - Decrypted notes (UTXOs)
 * - Balances
 * - Scan state
 * - Transaction history
 *
 * @param config - Database configuration options
 * @returns Initialized Drizzle database instance
 *
 * @example
 * ```typescript
 * // Production: file-based database
 * const walletDb = createWalletDB({
 *   path: '~/.railgun/wallets/my-wallet/wallet.db',
 * });
 *
 * // Testing: in-memory database
 * const testDb = createWalletDB({
 *   path: ':memory:',
 * });
 * ```
 */
export function createWalletDB(config: WalletDBConfig): WalletDB {
  const {
    path,
    enableWAL = path !== ':memory:',
    runMigrations = true,
    migrationsFolder = './drizzle/wallet',
    verbose = false,
    encryptionKey,
  } = config;

  // Create better-sqlite3 instance
  const sqlite = new Database(path, {
    verbose: verbose ? console.log : undefined,
  });

  // Apply encryption key if provided (future: SQLCipher support)
  if (encryptionKey) {
    // Note: Requires better-sqlite3-sqlcipher
    // sqlite.pragma(`key = '${encryptionKey}'`);
    console.warn('SQLCipher encryption not yet implemented');
  }

  // Configure SQLite pragmas
  configurePragmas(sqlite, enableWAL);

  // Create Drizzle instance with schema
  const db = drizzle(sqlite, { schema }) as WalletDB;

  // Attach SQLite client for direct access
  db.$client = sqlite;

  // Run migrations if enabled
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

/**
 * Configures SQLite pragmas for wallet database.
 *
 * Similar to chain.db but optimized for smaller, write-heavy workloads.
 *
 * @param sqlite - better-sqlite3 database instance
 * @param enableWAL - Whether to enable Write-Ahead Logging
 */
function configurePragmas(sqlite: Database.Database, enableWAL: boolean): void {
  // Enable Write-Ahead Logging
  if (enableWAL) {
    sqlite.pragma('journal_mode = WAL');
  }

  // Synchronous mode: FULL for wallet data durability
  // Wallet data is critical and databases are small
  sqlite.pragma('synchronous = FULL');

  // Cache size: 5MB (smaller than chain.db)
  sqlite.pragma('cache_size = -5000');

  // Store temporary tables/indexes in memory
  sqlite.pragma('temp_store = MEMORY');

  // Foreign key constraints
  sqlite.pragma('foreign_keys = ON');

  // Auto-vacuum: Reclaim space when data is deleted
  // Useful for wallet databases where notes get spent
  sqlite.pragma('auto_vacuum = FULL');
}

/**
 * Closes the wallet database connection.
 *
 * @param db - Wallet database instance
 */
export function closeWalletDB(db: WalletDB): void {
  const sqlite = db.$client;
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close();
  }
}

/**
 * Optimizes the database by running ANALYZE.
 *
 * @param db - Wallet database instance
 */
export function optimizeWalletDB(db: WalletDB): void {
  const sqlite = db.$client;
  sqlite.pragma('analysis_limit = 1000');
  sqlite.pragma('optimize');
}

/**
 * Gets the current database file size in bytes.
 *
 * @param db - Wallet database instance
 * @returns Database file size in bytes, or 0 for in-memory
 */
export function getWalletDBSize(db: WalletDB): number {
  const sqlite = db.$client;
  const result = sqlite.pragma('page_count', { simple: true }) as number;
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
  return result * pageSize;
}

/**
 * Creates a backup of the wallet database.
 * IMPORTANT: Backup contains sensitive key material!
 *
 * @param db - Source database instance
 * @param backupPath - Path to backup file
 */
export function backupWalletDB(db: WalletDB, backupPath: string): void {
  const sqlite = db.$client;
  sqlite.backup(backupPath);
}

/**
 * Changes the encryption key for the wallet database (future).
 * Requires SQLCipher support.
 *
 * @param _db - Wallet database instance
 * @param _newKey - New encryption key
 */
export function rekeyWalletDB(_db: WalletDB, _newKey: string): void {
  // Future: SQLCipher rekey
  // const sqlite = db.$client;
  // sqlite.pragma(`rekey = '${newKey}'`);
  throw new Error('Database rekeying not yet implemented');
}
