import type { Transactor } from '../core/database.js'

import type { SqliteWorkerClient } from './sqlite-client.js'

/**
 * A drizzle database handle exposing its underlying worker connection.
 */
type WorkerBackedDatabase = {
  $client: SqliteWorkerClient
}

/**
 * Create a transaction capability for a worker-backed browser database.
 *
 * Mirrors the Node adapter's semantics: the awaited callback is bracketed
 * with explicit `BEGIN`/`COMMIT` statements on the connection, rolling back
 * when the callback throws. Statements issued on the same connection while
 * the callback is pending join the open transaction, so callers must not
 * issue unrelated writes concurrently. When the connection is already
 * inside a transaction the callback runs directly in that enclosing
 * context.
 * @param db - Database whose connection brackets the transaction.
 * @returns A transaction capability bound to the database.
 */
function createWorkerSqliteTransactor<DB extends WorkerBackedDatabase> (db: DB): Transactor<DB> {
  return async <T>(fn: (tx: DB) => Promise<T>): Promise<T> => {
    const client = db.$client
    if (await client.inTransaction()) {
      return fn(db)
    }
    await client.exec('BEGIN', [], 'run')
    try {
      const result = await fn(db)
      await client.exec('COMMIT', [], 'run')
      return result
    } catch (error) {
      await client.exec('ROLLBACK', [], 'run')
      throw error
    }
  }
}

export { createWorkerSqliteTransactor }
