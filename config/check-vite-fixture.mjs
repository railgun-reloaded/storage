import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

/**
 * Packaging check: pack the package with `npm pack`, install the tarball
 * into a throwaway Vite app (no Node polyfills, no source aliases), run a
 * production `vite build`, serve it with `vite preview`, and drive the page
 * with the system Chrome until it reports success.
 * Run with: npm run check:fixture
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_PORT = 43117

const fixtureMain = `
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

const steps = []

function step (name) {
  steps.push(name)
}

function randomBytes (byteSize) {
  return globalThis.crypto.getRandomValues(new Uint8Array(byteSize))
}

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
    throw new Error('chain: expected 3 inserted nullifiers, got ' + inserted)
  }
  await storage.updateSyncState(11155111, 8_000_002n)
  step('chain: batch insert and sync cursor')

  await closeChainDB(db)
  db = await createChainDB({ name })
  storage = createChainStorage(db)
  const persisted = await storage.getAllNullifiers()
  if (persisted.length !== 3 || persisted[0].blockNumber !== 8_000_000n) {
    throw new Error('chain: persistence mismatch after reopen: ' + persisted.length + ' rows')
  }
  const syncState = await storage.getSyncState(11155111)
  if (syncState?.lastBlockHeight !== 8_000_002n) {
    throw new Error('chain: sync cursor mismatch after reopen: ' + String(syncState?.lastBlockHeight))
  }
  step('chain: close/reopen durability with bigint round-trip')

  await closeChainDB(db)
  await deleteDatabase(name)
  step('chain: explicit deletion')
}

async function runWalletFixture () {
  const name = 'fixture-wallet'
  await deleteDatabase(name)
  const db = await createWalletDB({ name })
  const storage = createWalletStorage(db)

  const walletId = 'fixture-wallet-1'
  const created = await storage.createWallet({
    id: walletId,
    encryptedKeys: randomBytes(64),
    name: 'fixture',
  })
  if (created !== true) {
    throw new Error('wallet: expected a fresh insert, got ' + String(created))
  }
  const wallet = await storage.getWallet(walletId)
  if (wallet?.name !== 'fixture') {
    throw new Error('wallet: read-back mismatch: ' + String(wallet?.name))
  }
  await storage.updateScanState(walletId, 11155111, 8_000_002n)
  const scanState = await storage.getScanState(walletId, 11155111)
  if (scanState?.lastScannedBlock !== 8_000_002n) {
    throw new Error('wallet: scan state mismatch: ' + String(scanState?.lastScannedBlock))
  }
  step('wallet: create, read back, and scan state')

  await closeWalletDB(db)
  await deleteDatabase(name)
  step('wallet: explicit deletion')
}

async function run () {
  const output = document.getElementById('output')
  try {
    await runChainFixture()
    await runWalletFixture()
    window.__fixtureReport = { ok: true, steps }
    output.textContent = 'ok\\n' + steps.join('\\n')
  } catch (error) {
    window.__fixtureReport = {
      ok: false,
      steps,
      error: error instanceof Error ? error.message + '\\n' + (error.stack ?? '') : String(error),
    }
    output.textContent = 'failed: ' + window.__fixtureReport.error
  }
}

run()
`

function writeFixture (fixtureDir) {
  mkdirSync(path.join(fixtureDir, 'src'), { recursive: true })
  writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({
    name: 'storage-vite-fixture',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      '@sqlite.org/sqlite-wasm': '3.53.0-build1',
    },
    devDependencies: {
      vite: '^7.3.0',
    },
  }, null, 2))
  writeFileSync(path.join(fixtureDir, 'index.html'), '<!doctype html><html><body><pre id="output">running</pre><script type="module" src="/src/main.js"></script></body></html>\n')
  writeFileSync(path.join(fixtureDir, 'src/main.js'), fixtureMain)
  writeFileSync(path.join(fixtureDir, 'vite.config.js'), [
    "import { defineConfig } from 'vite'",
    '',
    'export default defineConfig({',
    '  optimizeDeps: {',
    "    exclude: ['@railgun-reloaded/storage', '@sqlite.org/sqlite-wasm'],",
    '  },',
    '})',
    '',
  ].join('\n'))
}

/**
 * Run a command, streaming output, and fail on a non-zero exit.
 * @param {string} command - Executable name.
 * @param {string[]} args - Arguments.
 * @param {string} cwd - Working directory.
 * @returns {Promise<void>} Resolves when the command exits cleanly.
 */
function run (command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
      }
    })
  })
}

/**
 * Wait until a TCP port accepts connections.
 * @param {number} port - Port to poll.
 * @param {number} timeoutMs - Give up after this long.
 * @returns {Promise<void>} Resolves when the port is reachable.
 */
async function waitForPort (port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    if (connected) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(`vite preview did not start listening on port ${port}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
}

const packDir = mkdtempSync(path.join(tmpdir(), 'storage-pack-'))
const fixtureDir = mkdtempSync(path.join(tmpdir(), 'storage-vite-fixture-'))
let preview
let browser
try {
  console.log('Packing @railgun-reloaded/storage...')
  await run('npm', ['pack', '--pack-destination', packDir], packageRoot)
  const tarball = path.join(packDir, readdirSync(packDir).find((entry) => entry.endsWith('.tgz')))

  writeFixture(fixtureDir)
  console.log('Installing fixture dependencies...')
  await run('npm', ['install', '--no-audit', '--no-fund'], fixtureDir)
  await run('npm', ['install', '--no-save', '--no-audit', '--no-fund', tarball], fixtureDir)

  console.log('Building fixture with vite build...')
  await run('npx', ['vite', 'build'], fixtureDir)

  console.log('Serving fixture with vite preview...')
  preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PREVIEW_PORT), '--strictPort'], {
    cwd: fixtureDir,
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  await waitForPort(PREVIEW_PORT, 30_000)

  console.log('Driving fixture with Chrome...')
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${PREVIEW_PORT}/`)
  await page.waitForFunction('window.__fixtureReport !== undefined', undefined, { timeout: 60_000 })
  const report = await page.evaluate('window.__fixtureReport')
  if (!report.ok) {
    throw new Error(`Fixture failed after steps [${report.steps.join('; ')}]:\n${report.error}`)
  }
  console.log('Fixture passed:')
  for (const step of report.steps) {
    console.log(`  - ${step}`)
  }
} finally {
  await browser?.close()
  preview?.kill()
  rmSync(packDir, { recursive: true, force: true })
  rmSync(fixtureDir, { recursive: true, force: true })
}
