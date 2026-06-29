import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  closeChainDB,
  closeWalletDB,
  createChainDB,
  createChainStorage,
  createWalletDB,
  createWalletStorage,
} from '../../src/node/index.js'

import { runChainStorageContract } from './chain-storage.contract.js'
import type { ChainStorageHarness, WalletStorageHarness } from './harness.js'
import { runWalletStorageContract } from './wallet-storage.contract.js'

/**
 * Build a file-backed Node `ChainStorage` harness in a fresh temp directory.
 * @returns A chain harness whose store persists across reopen.
 */
async function makeChainHarness (): Promise<ChainStorageHarness> {
  const dir = mkdtempSync(path.join(tmpdir(), 'chain-contract-'))
  const dbPath = path.join(dir, 'chain.db')
  let db = await createChainDB({ path: dbPath, runMigrations: true })
  return {
    storage: createChainStorage(db),
    /**
     * Close and reopen the same database file to exercise durability.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await closeChainDB(db)
      db = await createChainDB({ path: dbPath, runMigrations: true })
      return createChainStorage(db)
    },
    /**
     * Close the database and remove its temp directory.
     */
    async close () {
      await closeChainDB(db)
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Build a file-backed Node `WalletStorage` harness in a fresh temp directory.
 * @returns A wallet harness whose store persists across reopen.
 */
async function makeWalletHarness (): Promise<WalletStorageHarness> {
  const dir = mkdtempSync(path.join(tmpdir(), 'wallet-contract-'))
  const dbPath = path.join(dir, 'wallet.db')
  let db = await createWalletDB({ path: dbPath, runMigrations: true })
  return {
    storage: createWalletStorage(db),
    /**
     * Close and reopen the same database file to exercise durability.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await closeWalletDB(db)
      db = await createWalletDB({ path: dbPath, runMigrations: true })
      return createWalletStorage(db)
    },
    /**
     * Close the database and remove its temp directory.
     */
    async close () {
      await closeWalletDB(db)
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

runChainStorageContract('better-sqlite3', makeChainHarness)
runWalletStorageContract('better-sqlite3', makeWalletHarness)
