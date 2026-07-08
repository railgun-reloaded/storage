/**
 * Machine-readable failure categories reported by the browser adapter.
 *
 * - `UNSUPPORTED_ENVIRONMENT` - a required browser capability (Worker,
 *   WebAssembly, OPFS, Web Locks) is missing in this context.
 * - `INITIALIZATION_FAILED` - the worker or the SQLite WASM runtime failed
 *   to start.
 * - `DATABASE_BUSY` - another context holds the requested logical database.
 * - `QUOTA_EXCEEDED` - the browser denied storage because the origin ran out
 *   of quota.
 * - `MIGRATION_FAILED` - applying pending migrations failed; the transaction
 *   was rolled back and no storage instance was returned.
 * - `DATABASE_DELETE_BLOCKED` - deletion was requested while an active
 *   connection holds the database.
 * - `DATABASE_CLOSED` - an operation was issued after `close()`.
 */
type BrowserStorageErrorCode =
  | 'UNSUPPORTED_ENVIRONMENT'
  | 'INITIALIZATION_FAILED'
  | 'DATABASE_BUSY'
  | 'QUOTA_EXCEEDED'
  | 'MIGRATION_FAILED'
  | 'DATABASE_DELETE_BLOCKED'
  | 'DATABASE_CLOSED'

/**
 * Error thrown by the browser adapter for environment, lifecycle, and
 * coordination failures. SQL statement errors are propagated as plain
 * `Error`s so query failures keep their driver message.
 */
class BrowserStorageError extends Error {
  /** Machine-readable failure category. */
  readonly code: BrowserStorageErrorCode

  /**
   * Create a browser storage error.
   * @param code - Machine-readable failure category.
   * @param message - Human-readable description with actionable context.
   * @param options - Standard error options; use `cause` to chain the
   *   underlying failure.
   */
  constructor (code: BrowserStorageErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'BrowserStorageError'
    this.code = code
  }
}

export { BrowserStorageError }
export type { BrowserStorageErrorCode }
