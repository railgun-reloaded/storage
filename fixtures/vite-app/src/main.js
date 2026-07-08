import {
  chainDatabaseName,
  closeChainDB,
  closeWalletDB,
  createChainDB,
  createChainStorage,
  createWalletDB,
  createWalletStorage,
  deleteDatabase,
} from '@railgun-reloaded/storage/browser'

/**
 * Packaging fixture: run representative chain and wallet write/read
 * operations against the packed package under a production Vite build.
 * Publishes { ok, steps, error? } on window.__fixtureReport.
 */

const steps = []

/**
 * Record one completed step.
 * @param name - Step name.
 */
function step (name) {
  steps.push(name)
}

/**
 * Generate random bytes with the Web Crypto API.
 * @param byteSize - Number of bytes.
 * @returns Random bytes.
 */
function randomBytes (byteSize) {
  return globalThis.crypto.getRandomValues(new Uint8Array(byteSize))
}

/**
 * Exercise persistent chain storage: batch insert, bigint round-trip,
 * close/reopen durability, and explicit deletion.
 */
async function runChainFixture () {
  const name = chainDatabaseName({ chain: 11155111, railgunVersion: 0 })
  await deleteDatabase(name)
  let db = await createChainDB({ name })
  let storage = createChainStorage(db)

  const nullifiers = [0, 1, 2].map((index) => ({
    nullifier: randomBytes(32),
    transactionHash: randomBytes(32),
    blockNumber: 8_000_000n + BigInt(index),
    treeNumber: 0,
  }))
  const inserted = await storage.insertNullifiersBatch(nullifiers)
  if (inserted !== 3) {
    throw new Error(`chain: expected 3 inserted nullifiers, got ${inserted}`)
  }
  await storage.updateSyncState(11155111, 8_000_002n)
  step('chain: batch insert and sync cursor')

  await closeChainDB(db)
  db = await createChainDB({ name })
  storage = createChainStorage(db)
  const persisted = await storage.getAllNullifiers()
  if (persisted.length !== 3 || persisted[0].blockNumber !== 8_000_000n) {
    throw new Error(`chain: persistence mismatch after reopen: ${persisted.length} rows`)
  }
  const syncState = await storage.getSyncState(11155111)
  if (syncState?.lastBlockHeight !== 8_000_002n) {
    throw new Error(`chain: sync cursor mismatch after reopen: ${syncState?.lastBlockHeight}`)
  }
  step('chain: close/reopen durability with bigint round-trip')

  await closeChainDB(db)
  await deleteDatabase(name)
  step('chain: explicit deletion')
}

/**
 * Exercise persistent wallet storage: wallet creation, scan state, and
 * explicit deletion.
 */
async function runWalletFixture () {
  const name = 'fixture-wallet'
  await deleteDatabase(name)
  const db = await createWalletDB({ name })
  const storage = createWalletStorage(db)

  const walletId = await storage.createWallet({
    id: 'fixture-wallet-1',
    encryptedKeys: randomBytes(64),
    name: 'fixture',
  })
  const wallet = await storage.getWallet(walletId)
  if (wallet?.name !== 'fixture') {
    throw new Error(`wallet: read-back mismatch: ${wallet?.name}`)
  }
  await storage.updateScanState(walletId, 11155111, 8_000_002n)
  const scanState = await storage.getScanState(walletId, 11155111)
  if (scanState?.lastScannedBlock !== 8_000_002n) {
    throw new Error(`wallet: scan state mismatch: ${scanState?.lastScannedBlock}`)
  }
  step('wallet: create, read back, and scan state')

  await closeWalletDB(db)
  await deleteDatabase(name)
  step('wallet: explicit deletion')
}

/**
 * Run the fixture and publish the report.
 */
async function run () {
  const output = document.getElementById('output')
  try {
    await runChainFixture()
    await runWalletFixture()
    window.__fixtureReport = { ok: true, steps }
    output.textContent = `ok\n${steps.join('\n')}`
  } catch (error) {
    window.__fixtureReport = {
      ok: false,
      steps,
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    }
    output.textContent = `failed: ${window.__fixtureReport.error}`
  }
}

run()
