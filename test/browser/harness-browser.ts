import type { BrowserChainDB, BrowserWalletDB } from '../../src/browser/index.js'
import {
  BrowserStorageError,
  closeChainDB,
  closeWalletDB,
  createChainDB,
  createChainStorage,
  createWalletDB,
  createWalletStorage,
  deleteDatabase,
} from '../../src/browser/index.js'
import { runChainStorageContract } from '../contract/chain-storage.contract.js'
import { createTestNullifiers } from '../contract/fixtures.js'
import type { ChainStorageHarness, WalletStorageHarness } from '../contract/harness.js'
import { runWalletStorageContract } from '../contract/wallet-storage.contract.js'

import type { BrowserTestResult } from './shims/node-test.js'
import { runRegisteredTests } from './shims/node-test.js'

/**
 * Browser page harness. The orchestrating Node test bundles this module,
 * serves it, and drives it with a real browser: the scenario in the page
 * URL selects what runs, and the outcome is published on `window.__report`.
 */

type BrowserReport = {
  scenario: string
  results: BrowserTestResult[]
}

const PERSIST_NAME = 'eval-persist'
const MULTITAB_NAME = 'eval-multitab'

let uniqueCounter = 0

/**
 * Produce a unique persistent database name for one test.
 * @param prefix - Name prefix identifying the domain under test.
 * @returns A database name unique to this page load.
 */
function uniqueName (prefix: string): string {
  uniqueCounter += 1
  return `${prefix}-${Date.now()}-${uniqueCounter}`
}

/**
 * Build an ephemeral chain harness: reopen preserves the worker-lifetime
 * database, close discards it.
 * @returns A chain harness over an ephemeral database.
 */
async function makeEphemeralChainHarness (): Promise<ChainStorageHarness> {
  const db = await createChainDB({ ephemeral: true })
  return {
    storage: createChainStorage(db),
    /**
     * Close and reopen the database on the same worker.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await db.$client.reopen()
      return createChainStorage(db)
    },
    /**
     * Close the connection, discarding the ephemeral database.
     */
    async close () {
      await closeChainDB(db)
    },
  }
}

/**
 * Build an ephemeral wallet harness: reopen preserves the worker-lifetime
 * database, close discards it.
 * @returns A wallet harness over an ephemeral database.
 */
async function makeEphemeralWalletHarness (): Promise<WalletStorageHarness> {
  const db = await createWalletDB({ ephemeral: true })
  return {
    storage: createWalletStorage(db),
    /**
     * Close and reopen the database on the same worker.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await db.$client.reopen()
      return createWalletStorage(db)
    },
    /**
     * Close the connection, discarding the ephemeral database.
     */
    async close () {
      await closeWalletDB(db)
    },
  }
}

/**
 * Build a persistent chain harness in a uniquely named database. Reopen
 * tears the whole connection down (worker, lock) and reopens from OPFS;
 * close also deletes the database so runs leave no residue.
 * @returns A chain harness over a persistent database.
 */
async function makePersistentChainHarness (): Promise<ChainStorageHarness> {
  const name = uniqueName('eval-chain')
  let db: BrowserChainDB = await createChainDB({ name })
  return {
    storage: createChainStorage(db),
    /**
     * Fully close the connection and reopen the same database from OPFS.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await closeChainDB(db)
      db = await createChainDB({ name })
      return createChainStorage(db)
    },
    /**
     * Close the connection and delete the database.
     */
    async close () {
      await closeChainDB(db)
      await deleteDatabase(name)
    },
  }
}

/**
 * Build a persistent wallet harness in a uniquely named database. Reopen
 * tears the whole connection down and reopens from OPFS; close also deletes
 * the database so runs leave no residue.
 * @returns A wallet harness over a persistent database.
 */
async function makePersistentWalletHarness (): Promise<WalletStorageHarness> {
  const name = uniqueName('eval-wallet')
  let db: BrowserWalletDB = await createWalletDB({ name })
  return {
    storage: createWalletStorage(db),
    /**
     * Fully close the connection and reopen the same database from OPFS.
     * @returns A storage bound to the reopened database.
     */
    async reopen () {
      await closeWalletDB(db)
      db = await createWalletDB({ name })
      return createWalletStorage(db)
    },
    /**
     * Close the connection and delete the database.
     */
    async close () {
      await closeWalletDB(db)
      await deleteDatabase(name)
    },
  }
}

/**
 * Run one named check and record its outcome like a registered test.
 * @param name - Check name for the report.
 * @param fn - Check body.
 * @returns The recorded outcome.
 */
async function runCheck (name: string, fn: () => Promise<void>): Promise<BrowserTestResult> {
  try {
    await fn()
    return { name, passed: true }
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    }
  }
}

/**
 * Remove every entry in the origin-private file system.
 */
async function wipeOpfs (): Promise<void> {
  const root = await navigator.storage.getDirectory()
  const names: string[] = []
  for await (const key of root.keys()) {
    names.push(key)
  }
  for (const key of names) {
    await root.removeEntry(key, { recursive: true })
  }
}

/**
 * List the origin-private file system's top-level entry names.
 * @returns The entry names.
 */
async function listOpfs (): Promise<string[]> {
  const root = await navigator.storage.getDirectory()
  const names: string[] = []
  for await (const key of root.keys()) {
    names.push(key)
  }
  return names
}

/**
 * Execute the scenario selected by the page URL.
 * @param scenario - Scenario name from the page URL.
 * @returns The scenario's test results.
 */
async function runScenario (scenario: string): Promise<BrowserTestResult[]> {
  switch (scenario) {
    case 'contract-ephemeral': {
      runChainStorageContract('browser-ephemeral', makeEphemeralChainHarness)
      runWalletStorageContract('browser-ephemeral', makeEphemeralWalletHarness)
      return runRegisteredTests()
    }
    case 'contract-persistent': {
      runChainStorageContract('browser-persistent', makePersistentChainHarness)
      runWalletStorageContract('browser-persistent', makePersistentWalletHarness)
      return runRegisteredTests()
    }
    case 'ephemeral-leaves-no-data': {
      return [await runCheck('ephemeral databases leave no persistent data', async () => {
        await wipeOpfs()
        const db = await createChainDB({ ephemeral: true })
        const storage = createChainStorage(db)
        await storage.insertNullifiersBatch(createTestNullifiers(3))
        await closeChainDB(db)
        const entries = await listOpfs()
        if (entries.length > 0) {
          throw new Error(`Expected an empty origin-private file system, found: ${entries.join(', ')}`)
        }
      })]
    }
    case 'persist-write': {
      return [await runCheck('write persistent state before reload', async () => {
        await deleteDatabase(PERSIST_NAME)
        const db = await createChainDB({ name: PERSIST_NAME })
        const storage = createChainStorage(db)
        await storage.insertNullifiersBatch(createTestNullifiers(3, 700n))
        await storage.updateSyncState(1, 900n)
        await closeChainDB(db)
      })]
    }
    case 'persist-verify': {
      return [await runCheck('persistent state survives reload into a new context', async () => {
        const db = await createChainDB({ name: PERSIST_NAME })
        const storage = createChainStorage(db)
        const nullifiers = await storage.getAllNullifiers()
        if (nullifiers.length !== 3) {
          throw new Error(`Expected 3 persisted nullifiers, found ${nullifiers.length}`)
        }
        const syncState = await storage.getSyncState(1)
        if (syncState?.lastBlockHeight !== 900n) {
          throw new Error(`Expected persisted sync height 900n, found ${syncState?.lastBlockHeight}`)
        }
        await closeChainDB(db)
        await deleteDatabase(PERSIST_NAME)
      })]
    }
    case 'logical-name-isolation': {
      return [await runCheck('logical names isolate persistent chain databases', async () => {
        const leftName = uniqueName('isolation-left')
        const rightName = uniqueName('isolation-right')
        let leftDb: BrowserChainDB | undefined
        let rightDb: BrowserChainDB | undefined
        try {
          leftDb = await createChainDB({ name: leftName })
          rightDb = await createChainDB({ name: rightName })
          await createChainStorage(leftDb).insertNullifiersBatch(createTestNullifiers(2, 1200n))
          const rightNullifiers = await createChainStorage(rightDb).getAllNullifiers()
          if (rightNullifiers.length !== 0) {
            throw new Error(`Expected isolated database to be empty, found ${rightNullifiers.length} nullifiers`)
          }
        } finally {
          if (leftDb) {
            await closeChainDB(leftDb)
          }
          if (rightDb) {
            await closeChainDB(rightDb)
          }
          await deleteDatabase(leftName)
          await deleteDatabase(rightName)
        }
      })]
    }
    case 'wallet-multi-wallet': {
      return [await runCheck('one wallet database stores multiple wallets', async () => {
        const name = uniqueName('multi-wallet')
        let db: BrowserWalletDB | undefined
        try {
          db = await createWalletDB({ name })
          const storage = createWalletStorage(db)
          await storage.createWallet({ id: 'wallet-a', encryptedKeys: new Uint8Array([1]), name: 'A' })
          await storage.createWallet({ id: 'wallet-b', encryptedKeys: new Uint8Array([2]), name: 'B' })
          const wallets = await storage.listWallets()
          if (wallets.length !== 2) {
            throw new Error(`Expected 2 wallets in one database, found ${wallets.length}`)
          }
          await storage.updateScanState('wallet-a', 1, 100n)
          await storage.updateScanState('wallet-b', 1, 200n)
          const first = await storage.getScanState('wallet-a', 1)
          const second = await storage.getScanState('wallet-b', 1)
          if (first?.lastScannedBlock !== 100n || second?.lastScannedBlock !== 200n) {
            throw new Error(`Expected independent scan state, found ${first?.lastScannedBlock}/${second?.lastScannedBlock}`)
          }
        } finally {
          if (db) {
            await closeWalletDB(db)
          }
          await deleteDatabase(name)
        }
      })]
    }
    case 'multitab-hold': {
      const db = await createChainDB({ name: MULTITAB_NAME })
      const storage = createChainStorage(db)
      await storage.insertNullifiersBatch(createTestNullifiers(1))
      return [{ name: 'holding the multitab database open', passed: true }]
    }
    case 'multitab-probe': {
      return [
        await runCheck('opening a held database fails fast with DATABASE_BUSY', async () => {
          try {
            await createChainDB({ name: MULTITAB_NAME })
          } catch (error) {
            if (error instanceof BrowserStorageError && error.code === 'DATABASE_BUSY') {
              return
            }
            throw error
          }
          throw new Error('Expected the open to fail while another tab holds the database')
        }),
        await runCheck('deleting a held database fails with DATABASE_DELETE_BLOCKED', async () => {
          try {
            await deleteDatabase(MULTITAB_NAME)
          } catch (error) {
            if (error instanceof BrowserStorageError && error.code === 'DATABASE_DELETE_BLOCKED') {
              return
            }
            throw error
          }
          throw new Error('Expected the delete to fail while another tab holds the database')
        }),
      ]
    }
    case 'multitab-wait': {
      return [await runCheck('waitForLock open succeeds once the holder closes', async () => {
        const db = await createChainDB({ name: MULTITAB_NAME, waitForLock: true })
        const storage = createChainStorage(db)
        const nullifiers = await storage.getAllNullifiers()
        if (nullifiers.length !== 1) {
          throw new Error(`Expected the holder's write to be visible, found ${nullifiers.length} nullifiers`)
        }
        await closeChainDB(db)
        await deleteDatabase(MULTITAB_NAME)
      })]
    }
    case 'wipe': {
      return [await runCheck('wipe origin-private file system', wipeOpfs)]
    }
    default: {
      return [{ name: 'scenario', passed: false, error: `Unknown scenario ${JSON.stringify(scenario)}` }]
    }
  }
}

const scenario = new URLSearchParams(window.location.search).get('scenario') ?? 'contract-ephemeral'

runScenario(scenario)
  .then((results) => {
    const report: BrowserReport = { scenario, results }
    ;(window as unknown as { __report?: BrowserReport }).__report = report
  })
  .catch((error: unknown) => {
    const report: BrowserReport = {
      scenario,
      results: [{
        name: 'scenario bootstrap',
        passed: false,
        error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
      }],
    }
    ;(window as unknown as { __report?: BrowserReport }).__report = report
  })

export type { BrowserReport }
