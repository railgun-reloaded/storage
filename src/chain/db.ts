import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema';

/**
 * Configuration options for creating a chain database.
 */
export interface ChainDBConfig {
  /**
   * Path to the SQLite database file.
   * Use ':memory:' for in-memory database (testing).
   */
  path: string;

  /**
   * Whether to enable Write-Ahead Logging (WAL) mode.
   * WAL provides better concurrency for read-heavy workloads.
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
   * Default: './drizzle/chain'
   */
  migrationsFolder?: string;

  /**
   * Whether to enable verbose logging.
   * Default: false
   */
  verbose?: boolean;
}

/**
 * Chain database instance with typed schema.
 */
export type ChainDB = BetterSQLite3Database<typeof schema>;

/**
 * Creates and initializes a chain database instance.
 *
 * The chain database stores public blockchain state shared across all wallets:
 * - Nullifiers (spent notes)
 * - Merkle tree nodes
 * - Commitments (UTXO hashes)
 * - Sync state
 *
 * @param config - Database configuration options
 * @returns Initialized Drizzle database instance
 *
 * @example
 * ```typescript
 * // Production: file-based database
 * const chainDb = createChainDB({
 *   path: '~/.railgun/chains/1/chain.db',
 * });
 *
 * // Testing: in-memory database
 * const testDb = createChainDB({
 *   path: ':memory:',
 *   enableWAL: false,
 * });
 * ```
 */
export function createChainDB(config: ChainDBConfig): ChainDB {
  const {
    path,
    enableWAL = path !== ':memory:',
    runMigrations = true,
    migrationsFolder = './drizzle/chain',
    verbose = false,
  } = config;

  // Create better-sqlite3 instance
  const sqlite = new Database(path, {
    verbose: verbose ? console.log : undefined,
  });

  // Configure SQLite pragmas for optimal performance
  configurePragmas(sqlite, enableWAL);

  // Create Drizzle instance with schema
  const db = drizzle(sqlite, { schema });

  // Run migrations if enabled
  if (runMigrations && path !== ':memory:') {
    try {
      migrate(db, { migrationsFolder });
      if (verbose) {
        console.log(`Chain database migrations applied: ${path}`);
      }
    } catch (error) {
      console.error('Failed to apply chain database migrations:', error);
      throw error;
    }
  }

  return db;
}

/**
 * Configures SQLite pragmas for optimal performance.
 *
 * Performance optimizations:
 * - WAL mode: Better concurrency for read-heavy workloads
 * - Synchronous NORMAL: Balance between durability and performance
 * - Cache size: 10MB for hot data
 * - Temp store: Memory for faster temporary operations
 * - Mmap size: 256MB memory-mapped I/O for large databases
 *
 * @param sqlite - better-sqlite3 database instance
 * @param enableWAL - Whether to enable Write-Ahead Logging
 */
function configurePragmas(sqlite: Database.Database, enableWAL: boolean): void {
  // Enable Write-Ahead Logging for better concurrency
  if (enableWAL) {
    sqlite.pragma('journal_mode = WAL');
  }

  // Synchronous mode: NORMAL is a good balance
  // FULL = maximum durability, slower writes
  // NORMAL = fsync at critical moments, faster writes
  // OFF = no fsync, fastest but risky
  sqlite.pragma('synchronous = NORMAL');

  // Cache size: 10MB (negative = kibibytes)
  // Default is 2MB, increase for better performance
  sqlite.pragma('cache_size = -10000');

  // Store temporary tables/indexes in memory
  sqlite.pragma('temp_store = MEMORY');

  // Memory-mapped I/O for large databases (256MB)
  // Improves read performance for large files
  sqlite.pragma('mmap_size = 268435456');

  // Foreign key constraints (not used in chain.db, but good practice)
  sqlite.pragma('foreign_keys = ON');
}

/**
 * Closes the chain database connection.
 *
 * @param db - Chain database instance
 */
export function closeChainDB(db: ChainDB): void {
  const sqlite = db.$client;
  if (sqlite && !sqlite.inTransaction) {
    sqlite.close();
  }
}

/**
 * Optimizes the database by running ANALYZE and VACUUM.
 * Should be run periodically (e.g., after bulk imports).
 *
 * ANALYZE updates query planner statistics.
 * VACUUM rebuilds the database file, reclaiming space.
 *
 * @param db - Chain database instance
 * @param vacuum - Whether to run VACUUM (can be slow for large databases)
 */
export function optimizeChainDB(db: ChainDB, vacuum: boolean = false): void {
  const sqlite = db.$client;

  // Update statistics for query optimizer
  sqlite.pragma('analysis_limit = 1000');
  sqlite.pragma('optimize');

  if (vacuum) {
    // Rebuild database file (slow, reclaims space)
    sqlite.exec('VACUUM');
  }
}

/**
 * Gets the current database file size in bytes.
 *
 * @param db - Chain database instance
 * @returns Database file size in bytes, or 0 for in-memory
 */
export function getChainDBSize(db: ChainDB): number {
  const sqlite = db.$client;
  const result = sqlite.pragma('page_count', { simple: true }) as number;
  const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
  return result * pageSize;
}

/**
 * Creates a backup of the chain database.
 *
 * @param db - Source database instance
 * @param backupPath - Path to backup file
 */
export function backupChainDB(db: ChainDB, backupPath: string): void {
  const sqlite = db.$client;
  sqlite.backup(backupPath);
}
