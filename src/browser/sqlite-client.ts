import { BrowserStorageError } from './errors.js'
import type { MigrationEntry } from './migrations.js'
import type { ExecMethod, ExecResult, PragmaProfile, SqlParam, WorkerRequestBody, WorkerResponse } from './protocol.js'

/** Options for opening a worker-hosted SQLite connection. */
type SqliteWorkerClientOptions = {
  /** Logical database name; used for lock and pool derivation and diagnostics. */
  databaseName: string
  /** SAH pool VFS name for persistent databases, or `null` for ephemeral. */
  poolName: string | null
  /** Web Locks name guarding the database, or `null` to skip coordination (ephemeral). */
  lockName: string | null
  /** Pragma profile to apply on open. */
  pragmas: PragmaProfile
  /** Embedded migration catalog applied before `open` resolves. */
  migrations: MigrationEntry[]
  /** Wait for the database lock instead of failing fast when it is held. */
  waitForLock: boolean
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

/**
 * Acquire the Web Lock coordinating access to a logical database. The lock
 * is held until the returned release function is called and is released by
 * the browser automatically when the holding context dies.
 * @param lockName - Lock name derived from the logical database name.
 * @param wait - Wait for the lock instead of failing fast.
 * @returns A function releasing the lock.
 */
async function acquireDatabaseLock (lockName: string, wait: boolean): Promise<() => void> {
  if (typeof navigator === 'undefined' || navigator.locks === undefined) {
    throw new BrowserStorageError(
      'UNSUPPORTED_ENVIRONMENT',
      'Persistent databases require the Web Locks API (navigator.locks), which this browser context does not provide.'
    )
  }
  return new Promise<() => void>((resolve, reject) => {
    let release: (() => void) | undefined
    const held = new Promise<void>((_resolve) => {
      release = _resolve
    })
    navigator.locks
      .request(lockName, wait ? {} : { ifAvailable: true }, (lock) => {
        if (lock === null) {
          reject(new BrowserStorageError(
            'DATABASE_BUSY',
            `The database lock ${JSON.stringify(lockName)} is held by another tab or worker. Close the other context or open with { waitForLock: true }.`
          ))
          return undefined
        }
        resolve(() => release?.())
        return held
      })
      .catch((error: unknown) => {
        reject(new BrowserStorageError(
          'INITIALIZATION_FAILED',
          `Failed to acquire the database lock ${JSON.stringify(lockName)}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        ))
      })
  })
}

/**
 * Main-thread handle to a SQLite database hosted in a dedicated worker.
 * Requests are delivered and executed strictly in order: the worker handles
 * one message at a time, so individual statements never interleave. The
 * connection carries the same concurrent-use caveat as the Node adapter:
 * statements issued while a transaction callback is pending join that
 * transaction.
 */
class SqliteWorkerClient {
  /** Logical database name this connection is bound to. */
  readonly databaseName: string
  /** Whether the connection is backed by persistent OPFS storage. */
  readonly persistent: boolean

  /** The worker hosting the database. */
  #worker: Worker
  /** In-flight requests keyed by message id. */
  #pending = new Map<number, PendingRequest>()
  /** Next request message id. */
  #nextId = 1
  /** Whether the connection has been torn down. */
  #closed = false
  /** Releases the database lock, when one is held. */
  #releaseLock: (() => void) | undefined

  /**
   * Bind the client to a live worker. Use {@link SqliteWorkerClient.open}.
   * @param worker - The spawned database worker.
   * @param options - The options the connection was opened with.
   * @param releaseLock - Releases the database lock, when one is held.
   */
  private constructor (worker: Worker, options: SqliteWorkerClientOptions, releaseLock: (() => void) | undefined) {
    this.databaseName = options.databaseName
    this.persistent = options.poolName !== null
    this.#worker = worker
    this.#releaseLock = releaseLock
    worker.addEventListener('message', (event: MessageEvent) => {
      this.#dispatch(event.data as WorkerResponse)
    })
    worker.addEventListener('error', (event: ErrorEvent) => {
      this.#terminate(new BrowserStorageError(
        'INITIALIZATION_FAILED',
        `The database worker failed: ${event.message || 'unknown worker error'}`
      ))
    })
  }

  /**
   * Open a worker-hosted database connection. Acquires the database lock
   * (persistent databases), spawns the worker, opens the database, and
   * applies pending migrations before resolving; a partially migrated or
   * partially opened connection is never returned.
   * @param options - Connection options.
   * @returns The open client.
   */
  static async open (options: SqliteWorkerClientOptions): Promise<SqliteWorkerClient> {
    let releaseLock: (() => void) | undefined
    if (options.lockName !== null) {
      releaseLock = await acquireDatabaseLock(options.lockName, options.waitForLock)
    }
    let worker: Worker
    try {
      worker = new Worker(new URL('./db-worker.js', import.meta.url), { type: 'module' })
    } catch (error) {
      releaseLock?.()
      throw new BrowserStorageError(
        'INITIALIZATION_FAILED',
        `Failed to spawn the database worker: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
    const client = new SqliteWorkerClient(worker, options, releaseLock)
    try {
      await client.#request({
        op: 'open',
        options: {
          poolName: options.poolName,
          pragmas: options.pragmas,
          migrations: options.migrations,
        },
      })
    } catch (error) {
      client.#terminate()
      throw error
    }
    return client
  }

  /**
   * Execute one statement on the worker connection.
   * @param sql - Statement text.
   * @param params - Positional parameters.
   * @param method - Drizzle execution method controlling the row shape.
   * @returns Rows for the requested method plus the change count.
   */
  async exec (sql: string, params: SqlParam[], method: ExecMethod): Promise<ExecResult> {
    return await this.#request({ op: 'exec', sql, params, method }) as ExecResult
  }

  /**
   * Report whether the connection has an open transaction.
   * @returns `true` while a transaction is open.
   */
  async inTransaction (): Promise<boolean> {
    return await this.#request({ op: 'autocommit' }) === false
  }

  /**
   * Close and reopen the database on the same worker, preserving its
   * contents: persistent databases reopen from OPFS, ephemeral databases
   * reopen the worker-lifetime file. Pending migrations are re-checked on
   * reopen.
   */
  async reopen (): Promise<void> {
    await this.#request({ op: 'reopen' })
  }

  /**
   * Close the connection: flushes and closes the database, terminates the
   * worker (releasing OPFS access handles), and releases the database lock.
   * Never deletes stored data. Idempotent.
   */
  async close (): Promise<void> {
    if (this.#closed) {
      return
    }
    try {
      await this.#request({ op: 'close' })
    } finally {
      this.#terminate()
    }
  }

  /**
   * Send one request and await its response.
   * @param request - Request body without an id.
   * @returns The operation result.
   */
  #request (request: WorkerRequestBody): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(new BrowserStorageError('DATABASE_CLOSED', `The connection to database ${JSON.stringify(this.databaseName)} is closed`))
    }
    const id = this.#nextId++
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      try {
        this.#worker.postMessage({ id, ...request })
      } catch (error) {
        this.#pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  /**
   * Route one worker response to its pending request.
   * @param response - The decoded response.
   */
  #dispatch (response: WorkerResponse): void {
    const pending = this.#pending.get(response.id)
    if (!pending) {
      return
    }
    this.#pending.delete(response.id)
    if (response.ok) {
      pending.resolve(response.result)
    } else if (response.code !== undefined) {
      pending.reject(new BrowserStorageError(response.code, response.message))
    } else {
      pending.reject(new Error(response.message))
    }
  }

  /**
   * Reject every pending request.
   * @param error - Rejection reason.
   */
  #failAll (error: Error): void {
    for (const pending of this.#pending.values()) {
      pending.reject(error)
    }
    this.#pending.clear()
  }

  /**
   * Tear the connection down: terminate the worker, release the lock, and
   * fail anything still pending.
   * @param reason - Rejection reason for pending requests.
   */
  #terminate (reason: Error = new BrowserStorageError('DATABASE_CLOSED', `The connection to database ${JSON.stringify(this.databaseName)} is closed`)): void {
    this.#closed = true
    this.#worker.terminate()
    this.#failAll(reason)
    this.#releaseLock?.()
    this.#releaseLock = undefined
  }
}

export { SqliteWorkerClient }
export type { SqliteWorkerClientOptions }
