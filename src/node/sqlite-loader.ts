import type Database from 'better-sqlite3'

type DatabaseConstructor = new (...args: any[]) => Database.Database
type Drizzle = (...args: any[]) => unknown
type Migrate = (...args: any[]) => void

/**
 * The Node-only database runtime: the native driver constructor and the
 * drizzle factory/migrator bound to it. The drizzle members are typed loosely
 * because their concrete results are cast at the call sites.
 */
type DatabaseRuntime = {
  Database: DatabaseConstructor;
  drizzle: Drizzle;
  migrate: Migrate;
}

let cached: DatabaseRuntime | undefined

/**
 * Lazily load the Node-only database runtime.
 *
 * `better-sqlite3` is declared as an optional peer dependency, and the drizzle
 * `better-sqlite3` adapter pulls the native module in eagerly when imported.
 * Deferring both imports until a database is actually created keeps the `./node`
 * entry importable in environments where the native module is unavailable; only
 * creating a database requires it. The result is cached after the first load.
 * @returns The native driver constructor with the drizzle factory and migrator.
 */
async function loadDatabaseRuntime (): Promise<DatabaseRuntime> {
  if (cached) {
    return cached
  }
  try {
    const [sqlite, driver, migrator] = await Promise.all([
      import('better-sqlite3'),
      import('drizzle-orm/better-sqlite3'),
      import('drizzle-orm/better-sqlite3/migrator'),
    ])
    cached = {
      Database: (sqlite.default ?? sqlite) as unknown as DatabaseConstructor,
      drizzle: driver.drizzle,
      migrate: migrator.migrate,
    }
    return cached
  } catch (error) {
    throw new Error(
      "The optional peer dependency 'better-sqlite3' is required to create a database. Install it to use the Node storage entry.",
      { cause: error }
    )
  }
}

export { loadDatabaseRuntime }
