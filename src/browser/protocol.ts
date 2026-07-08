import type { BrowserStorageErrorCode } from './errors.js'
import type { MigrationEntry } from './migrations.js'

/**
 * Value shapes that cross the worker boundary. Everything is structured
 * clonable: drizzle's codecs only ever hand the driver strings, numbers,
 * bigints, `Uint8Array`s, booleans, and nulls, and SQLite reads come back as
 * the same set minus booleans.
 */
type SqlParam = null | number | bigint | string | boolean | Uint8Array

/** A single column value read back from SQLite. */
type SqlValue = null | number | bigint | string | Uint8Array

/** Query execution methods used by the drizzle `sqlite-proxy` driver. */
type ExecMethod = 'run' | 'all' | 'values' | 'get'

/**
 * Result of one statement execution. `rows` is an array of row-value arrays
 * for `all`/`values`, a single row-value array (or `undefined` when no row
 * matched) for `get`, and `undefined` for `run`. `changes` carries
 * `sqlite3_changes()` so mutation counts keep parity with the Node driver.
 */
type ExecResult = {
  rows: SqlValue[][] | SqlValue[] | undefined
  changes: number
}

/** Pragma profile applied on open, mirroring the Node adapter's per-domain pragmas. */
type PragmaProfile = 'chain' | 'wallet'

/** Options for opening the worker-hosted database. */
type OpenOptions = {
  /** SAH pool VFS name for persistent databases, or `null` for an ephemeral database. */
  poolName: string | null
  /** Pragma profile to apply before migrations. */
  pragmas: PragmaProfile
  /** Embedded migration catalog to apply before the open resolves. */
  migrations: MigrationEntry[]
}

/** Request bodies accepted by the database worker. */
type WorkerRequestBody =
  | { op: 'open', options: OpenOptions }
  | { op: 'exec', sql: string, params: SqlParam[], method: ExecMethod }
  | { op: 'autocommit' }
  | { op: 'reopen' }
  | { op: 'close' }

/** Request messages accepted by the database worker. */
type WorkerRequest = WorkerRequestBody & { id: number }

/** Response messages posted back by the database worker. */
type WorkerResponse =
  | { id: number, ok: true, result: unknown }
  | { id: number, ok: false, message: string, code?: BrowserStorageErrorCode }

export type {
  SqlParam,
  SqlValue,
  ExecMethod,
  ExecResult,
  PragmaProfile,
  OpenOptions,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
}
