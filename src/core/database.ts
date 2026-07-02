import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import type * as chainSchema from '../chain/schema.js'
import type * as walletSchema from '../wallet/schema.js'

/**
 * Driver-neutral drizzle SQLite database bound to the chain schema. Both
 * synchronous and asynchronous drivers satisfy this type, so every query
 * written against it works unchanged on any drizzle SQLite backend.
 */
type ChainDatabase = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof chainSchema>

/**
 * Driver-neutral drizzle SQLite database bound to the wallet schema. Both
 * synchronous and asynchronous drivers satisfy this type, so every query
 * written against it works unchanged on any drizzle SQLite backend.
 */
type WalletDatabase = BaseSQLiteDatabase<'sync' | 'async', unknown, typeof walletSchema>

/**
 * Transaction capability supplied by a database adapter. Runs the callback
 * atomically: every statement issued on the callback's database context is
 * committed together or rolled back together. Adapters implement this with
 * whatever transaction primitive their driver provides.
 */
type Transactor<DB> = <T>(fn: (tx: DB) => Promise<T>) => Promise<T>

export type { ChainDatabase, WalletDatabase, Transactor }
