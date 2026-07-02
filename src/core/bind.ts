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

export { bind }
