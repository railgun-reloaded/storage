import type { Database, SAHPoolUtil, Sqlite3Static } from '@sqlite.org/sqlite-wasm'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

import type { BrowserStorageErrorCode } from './errors.js'
import type { MigrationEntry } from './migrations.js'
import type {
  ExecMethod,
  OpenOptions,
  PragmaProfile,
  SqlParam,
  SqlValue,
  WorkerRequest,
  WorkerResponse,
} from './protocol.js'

/**
 * Dedicated-worker host for one SQLite database. OPFS synchronous access
 * handles only exist in dedicated workers, so the database (and the SAH pool
 * VFS backing persistent mode) lives here; the main thread talks to it
 * through the message protocol in `protocol.js`. Ephemeral databases are
 * plain in-memory-VFS files that live exactly as long as this worker.
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent) => void) | null
  postMessage: (message: unknown) => void
}

// The dedicated-worker global scope is not modeled by the DOM lib this
// package compiles against; the runtime guarantees these members exist.
const workerScope = globalThis as unknown as WorkerScope

const EPHEMERAL_FILENAME = '/ephemeral.sqlite3'
const PERSISTENT_FILENAME = '/db.sqlite3'

const PRAGMAS: Record<PragmaProfile, string[]> = {
  chain: [
    'synchronous = NORMAL',
    'cache_size = -10000',
    'temp_store = MEMORY',
    'foreign_keys = ON',
  ],
  wallet: [
    'synchronous = FULL',
    'cache_size = -5000',
    'temp_store = MEMORY',
    'foreign_keys = ON',
    'auto_vacuum = FULL',
  ],
}

let sqlite3: Sqlite3Static | undefined
let poolUtil: SAHPoolUtil | undefined
let db: Database | undefined
let openOptions: OpenOptions | undefined

/**
 * Failure carrying a machine-readable adapter error code across the worker
 * boundary.
 */
class WorkerFailure extends Error {
  /** Machine-readable failure category. */
  readonly code: BrowserStorageErrorCode

  /**
   * Create a worker failure.
   * @param code - Machine-readable failure category.
   * @param message - Human-readable description.
   */
  constructor (code: BrowserStorageErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Initialize the SQLite WASM runtime once per worker.
 * @returns The sqlite3 module namespace.
 */
async function loadSqlite3 (): Promise<Sqlite3Static> {
  if (sqlite3) {
    return sqlite3
  }
  try {
    sqlite3 = await sqlite3InitModule()
    return sqlite3
  } catch (error) {
    throw new WorkerFailure(
      'INITIALIZATION_FAILED',
      `Failed to initialize the SQLite WASM runtime: ${error instanceof Error ? error.message : String(error)}. ` +
      'Ensure the optional peer dependency @sqlite.org/sqlite-wasm is installed and its sqlite3.wasm asset is reachable.'
    )
  }
}

/**
 * Map a persistence-layer failure to an adapter error code.
 * @param error - The thrown value.
 * @returns The failure to report to the main thread.
 */
function mapOpenError (error: unknown): WorkerFailure {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  if (name === 'QuotaExceededError' || message.includes('QuotaExceeded')) {
    return new WorkerFailure('QUOTA_EXCEEDED', `The browser denied storage for this origin: ${message}`)
  }
  if (name === 'NoModificationAllowedError' || message.includes('access handle') || message.includes('createSyncAccessHandle')) {
    return new WorkerFailure(
      'DATABASE_BUSY',
      `Another context holds this database's persistence files: ${message}. Close the other tab or worker, or open with { waitForLock: true }.`
    )
  }
  return new WorkerFailure('INITIALIZATION_FAILED', `Failed to open the database: ${message}`)
}

/**
 * Open (or reopen) the database described by the stored open options.
 */
async function openDatabase (): Promise<void> {
  if (!openOptions) {
    throw new WorkerFailure('INITIALIZATION_FAILED', 'openDatabase called before an open request')
  }
  const module = await loadSqlite3()
  if (openOptions.poolName !== null) {
    if (typeof navigator.storage?.getDirectory !== 'function') {
      throw new WorkerFailure(
        'UNSUPPORTED_ENVIRONMENT',
        'Persistent databases require the origin-private file system (navigator.storage.getDirectory), which this browser context does not provide.'
      )
    }
    try {
      poolUtil ??= await module.installOpfsSAHPoolVfs({ name: openOptions.poolName })
      db = new poolUtil.OpfsSAHPoolDb(PERSISTENT_FILENAME)
    } catch (error) {
      throw mapOpenError(error)
    }
  } else {
    db = new module.oo1.DB(EPHEMERAL_FILENAME, 'c')
  }
  for (const pragma of PRAGMAS[openOptions.pragmas]) {
    db.exec(`PRAGMA ${pragma}`)
  }
  applyMigrations(db, openOptions.migrations)
}

/**
 * Apply pending migrations from the embedded catalog, replicating the
 * bookkeeping of drizzle's sqlite migrator: same `__drizzle_migrations`
 * table, same last-applied comparison on the journal timestamp, and all
 * pending migrations applied inside a single transaction.
 * @param database - The open database.
 * @param migrations - Embedded catalog entries in journal order.
 */
function applyMigrations (database: Database, migrations: MigrationEntry[]): void {
  database.exec(
    'CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)'
  )
  const rows = selectRows(database, 'SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1', [])
  const lastCreatedAt = rows[0] === undefined ? undefined : Number(rows[0][2])
  const pending = migrations.filter(
    (migration) => lastCreatedAt === undefined || lastCreatedAt < migration.folderMillis
  )
  if (pending.length === 0) {
    return
  }
  database.exec('BEGIN')
  try {
    for (const migration of pending) {
      for (const statement of migration.statements) {
        database.exec(statement)
      }
      runStatement(
        database,
        'INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)',
        [migration.hash, migration.folderMillis]
      )
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw new WorkerFailure(
      'MIGRATION_FAILED',
      `Applying pending migrations failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Convert one bound parameter to a value the WASM driver accepts.
 * @param param - Parameter produced by the drizzle codecs.
 * @returns The driver-bindable value.
 */
function toBindable (param: SqlParam): Exclude<SqlParam, boolean> {
  if (typeof param === 'boolean') {
    return param ? 1 : 0
  }
  return param
}

/**
 * Execute one statement and collect every result row as a value array.
 * @param database - The open database.
 * @param sql - Statement text.
 * @param params - Positional parameters.
 * @returns All result rows.
 */
function selectRows (database: Database, sql: string, params: SqlParam[]): SqlValue[][] {
  const stmt = database.prepare(sql)
  try {
    if (params.length > 0) {
      stmt.bind(params.map(toBindable))
    }
    const rows: SqlValue[][] = []
    while (stmt.step()) {
      rows.push(stmt.get([]) as SqlValue[])
    }
    return rows
  } finally {
    stmt.finalize()
  }
}

/**
 * Execute one statement for its side effects.
 * @param database - The open database.
 * @param sql - Statement text.
 * @param params - Positional parameters.
 */
function runStatement (database: Database, sql: string, params: SqlParam[]): void {
  const stmt = database.prepare(sql)
  try {
    if (params.length > 0) {
      stmt.bind(params.map(toBindable))
    }
    stmt.step()
  } finally {
    stmt.finalize()
  }
}

/**
 * Return the open database or fail when the connection is not available.
 * @returns The open database.
 */
function requireDb (): Database {
  if (!db) {
    throw new WorkerFailure('DATABASE_CLOSED', 'The database is not open')
  }
  return db
}

/**
 * Handle one request message.
 * @param request - The decoded request.
 * @returns The operation result to post back.
 */
async function handleRequest (request: WorkerRequest): Promise<unknown> {
  switch (request.op) {
    case 'open': {
      openOptions = request.options
      await openDatabase()
      return undefined
    }
    case 'exec': {
      const database = requireDb()
      return executeStatement(database, request.sql, request.params, request.method)
    }
    case 'autocommit': {
      const database = requireDb()
      const module = sqlite3
      if (!module || database.pointer === undefined) {
        throw new WorkerFailure('DATABASE_CLOSED', 'The database is not open')
      }
      return module.capi.sqlite3_get_autocommit(database.pointer) !== 0
    }
    case 'reopen': {
      requireDb().close()
      db = undefined
      await openDatabase()
      return undefined
    }
    case 'close': {
      if (db) {
        db.close()
        db = undefined
      }
      if (poolUtil) {
        // The SAH pool keeps its OPFS sync access handles open independently
        // of the database; release them (keeping the files) before
        // acknowledging the close so a subsequent deleteDatabase never races
        // the browser's asynchronous handle reclamation after termination.
        poolUtil.pauseVfs()
        poolUtil = undefined
      }
      return undefined
    }
  }
}

/**
 * Execute one statement on behalf of the drizzle `sqlite-proxy` callback.
 * @param database - The open database.
 * @param sql - Statement text.
 * @param params - Positional parameters.
 * @param method - Drizzle execution method.
 * @returns Rows shaped for the requested method plus the change count.
 */
function executeStatement (database: Database, sql: string, params: SqlParam[], method: ExecMethod): { rows: SqlValue[][] | SqlValue[] | undefined, changes: number } {
  if (method === 'run') {
    runStatement(database, sql, params)
    return { rows: undefined, changes: database.changes() }
  }
  const rows = selectRows(database, sql, params)
  if (method === 'get') {
    return { rows: rows[0], changes: database.changes() }
  }
  return { rows, changes: database.changes() }
}

let queue: Promise<void> = Promise.resolve()

/**
 * Queue one incoming request so operations execute strictly in order, and
 * post its response back to the main thread.
 * @param event - The message event carrying a request.
 */
function dispatchMessage (event: MessageEvent): void {
  const request = event.data as WorkerRequest
  queue = queue.then(async () => {
    let response: WorkerResponse
    try {
      const result = await handleRequest(request)
      response = { id: request.id, ok: true, result }
    } catch (error) {
      response = {
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : String(error),
        ...(error instanceof WorkerFailure ? { code: error.code } : {}),
      }
    }
    workerScope.postMessage(response)
  })
}

workerScope.onmessage = dispatchMessage
