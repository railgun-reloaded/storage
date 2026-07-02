import type Database from 'better-sqlite3'

import type { Transactor } from '../core/database.js'

/**
 * A drizzle database handle exposing its underlying `better-sqlite3`
 * connection.
 */
type SqliteBackedDatabase = {
  $client: Database.Database
}

/**
 * Create a transaction capability for a `better-sqlite3`-backed database.
 *
 * The driver executes statements synchronously, so its own transaction
 * helper commits before an async callback resumes from its first await.
 * This capability instead brackets the awaited callback with explicit
 * `BEGIN`/`COMMIT` statements on the connection, rolling back when the
 * callback throws. Statements issued on the same connection while the
 * callback is pending join the open transaction, so callers must not issue
 * unrelated writes concurrently. When the connection is already inside a
 * transaction the callback runs directly in that enclosing context.
 * @param db - Database whose connection brackets the transaction.
 * @returns A transaction capability bound to the database.
 */
function createSqliteTransactor<DB extends SqliteBackedDatabase> (db: DB): Transactor<DB> {
  return async <T>(fn: (tx: DB) => Promise<T>): Promise<T> => {
    const sqlite = db.$client
    if (sqlite.inTransaction) {
      return fn(db)
    }
    sqlite.exec('BEGIN')
    try {
      const result = await fn(db)
      sqlite.exec('COMMIT')
      return result
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }
}

export { createSqliteTransactor }
