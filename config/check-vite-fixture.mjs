import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

/**
 * Packaging check: pack the package with `npm pack`, install the tarball
 * into the Vite fixture at fixtures/vite-app (no Node polyfills, no source
 * aliases), run a production `vite build`, serve it with `vite preview`,
 * and drive the page with the system Chrome until it reports success.
 * Run with: npm run check:fixture
 */

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(packageRoot, 'fixtures/vite-app')
const PREVIEW_PORT = 43117

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
let preview
let browser
try {
  console.log('Packing @railgun-reloaded/storage...')
  await run('npm', ['pack', '--pack-destination', packDir], packageRoot)
  const tarball = path.join(packDir, readdirSync(packDir).find((entry) => entry.endsWith('.tgz')))

  console.log('Installing fixture dependencies...')
  rmSync(path.join(fixtureDir, 'node_modules'), { recursive: true, force: true })
  rmSync(path.join(fixtureDir, 'package-lock.json'), { force: true })
  rmSync(path.join(fixtureDir, 'dist'), { recursive: true, force: true })
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
}
