import { normalizeMutationCount } from '../core/batch.js'

/**
 * Bind a query's leading database argument, producing a contract method that
 * forwards its remaining arguments.
 * @param fn - Query accepting the database handle as its first argument.
 * @param db - Database handle to bind.
 * @returns A method that calls `fn` with the bound database.
 */
function bind<DB, A extends unknown[], R> (fn: (db: DB, ...args: A) => R, db: DB): (...args: A) => R {
  return (...args: A) => fn(db, ...args)
}

/**
 * Bind a batch mutation query's database argument and normalize its resolved
 * affected-row count to a plain non-negative integer.
 * @param fn - Mutation query resolving to a driver-reported row count.
 * @param db - Database handle to bind.
 * @returns A method resolving to a normalized row count.
 */
function boundCount<DB, A extends unknown[]> (fn: (db: DB, ...args: A) => Promise<number>, db: DB): (...args: A) => Promise<number> {
  return async (...args: A) => normalizeMutationCount(await fn(db, ...args))
}

export { bind, boundCount }
