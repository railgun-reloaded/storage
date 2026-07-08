import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { build } from 'esbuild'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import { chromium } from 'playwright-core'

import type { BrowserTestResult } from '../shims/node-test.js'

/**
 * Node-side environment for the browser contract runs: bundles the page
 * harness and the database worker with esbuild (aliasing `node:test` and
 * `node:assert/strict` to the browser shims), serves the bundle over a
 * local HTTP server, and drives it with the system Chrome through
 * playwright-core. No cross-origin isolation headers are set; the adapter's
 * `opfs-sahpool` persistence must work without them.
 */

/** Report published by the page harness on `window.__report`. */
type BrowserReport = {
  scenario: string
  results: BrowserTestResult[]
}

/** A running browser evaluation environment. */
type BrowserEnvironment = {
  /** Origin serving the bundled harness. */
  baseUrl: string
  /** The driven browser. */
  browser: Browser
  /**
   * Shared browser context. Every scenario page must live in this one
   * context: OPFS and Web Locks are per-context, so cross-page persistence
   * and lock coordination are only observable within it.
   */
  context: BrowserContext
  /** Stop the browser and the server and remove the bundle directory. */
  close (): Promise<void>
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
}

const INDEX_HTML = '<!doctype html><html><head><meta charset="utf-8"><title>storage browser harness</title></head>' +
  '<body><script type="module" src="/app.js"></script></body></html>'

/**
 * Bundle the page harness and the database worker into a directory.
 * @param outDir - Destination directory for the served bundle.
 */
async function buildBundles (outDir: string): Promise<void> {
  const packageRoot = path.resolve(import.meta.dirname, '../../..')
  const shimsDir = path.join(packageRoot, 'test/browser/shims')
  const shimPlugin = {
    name: 'node-builtin-shims',
    /**
     * Register resolvers mapping the node builtins used by the contract
     * suite to their browser shims.
     * @param buildApi - esbuild plugin build API.
     * @param buildApi.onResolve - esbuild resolver registration hook.
     */
    setup (buildApi: { onResolve: (options: { filter: RegExp }, callback: () => { path: string }) => void }) {
      buildApi.onResolve({ filter: /^node:test$/ }, () => ({ path: path.join(shimsDir, 'node-test.js') }))
      buildApi.onResolve({ filter: /^node:assert\/strict$/ }, () => ({ path: path.join(shimsDir, 'node-assert.js') }))
    },
  }
  await build({
    entryPoints: [path.join(packageRoot, 'test/browser/harness-browser.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: 'inline',
    logLevel: 'silent',
    outfile: path.join(outDir, 'app.js'),
    plugins: [shimPlugin],
  })
  await build({
    entryPoints: [path.join(packageRoot, 'src/browser/db-worker.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: 'inline',
    logLevel: 'silent',
    outfile: path.join(outDir, 'db-worker.js'),
  })
  copyFileSync(
    path.join(packageRoot, 'node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm'),
    path.join(outDir, 'sqlite3.wasm')
  )
  writeFileSync(path.join(outDir, 'index.html'), INDEX_HTML)
}

/**
 * Serve a directory over a local HTTP server on an ephemeral port.
 * @param dir - Directory to serve.
 * @returns The listening server.
 */
async function startServer (dir: string): Promise<Server> {
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? '/', 'http://localhost').pathname
    const relative = requestPath === '/' ? 'index.html' : requestPath.slice(1)
    const filePath = path.join(dir, relative)
    if (!filePath.startsWith(dir)) {
      response.writeHead(403).end()
      return
    }
    try {
      const body = readFileSync(filePath)
      response.writeHead(200, { 'content-type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' })
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  return server
}

/**
 * Build the bundles, start the server, and launch the system Chrome.
 * @returns The running environment.
 */
async function launchBrowserEnvironment (): Promise<BrowserEnvironment> {
  const dir = mkdtempSync(path.join(tmpdir(), 'storage-browser-eval-'))
  await buildBundles(dir)
  const server = await startServer(dir)
  const { port } = server.address() as AddressInfo
  let browser: Browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
  } catch (error) {
    server.close()
    rmSync(dir, { recursive: true, force: true })
    throw new Error(
      'Failed to launch the system Chrome via playwright-core (channel "chrome"). The browser contract suite requires a Chrome installation.',
      { cause: error }
    )
  }
  const context = await browser.newContext()
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    browser,
    context,
    /**
     * Stop the browser and the server and remove the bundle directory.
     */
    async close () {
      await browser.close()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Wait for the page harness to publish its report.
 * @param page - The page running a scenario.
 * @returns The published report.
 */
async function waitForReport (page: Page): Promise<BrowserReport> {
  await page.waitForFunction('window.__report !== undefined', undefined, { timeout: 120_000 })
  return await page.evaluate('window.__report') as BrowserReport
}

/**
 * Open a scenario page and wait for its report.
 * @param environment - The running environment.
 * @param scenario - Scenario name understood by the page harness.
 * @returns The page (still open) and its report.
 */
async function runScenarioPage (environment: BrowserEnvironment, scenario: string): Promise<{ page: Page, report: BrowserReport }> {
  const page = await environment.context.newPage()
  await page.goto(`${environment.baseUrl}/?scenario=${scenario}`)
  const report = await waitForReport(page)
  return { page, report }
}

/**
 * Format failed results into an assertion message.
 * @param report - The report to inspect.
 * @returns `undefined` when everything passed, otherwise a failure summary.
 */
function formatFailures (report: BrowserReport): string | undefined {
  const failures = report.results.filter((result) => !result.passed)
  if (failures.length === 0) {
    return undefined
  }
  const lines = failures.map((failure) => `- ${failure.name}\n${failure.error ?? ''}`)
  return `${failures.length}/${report.results.length} browser checks failed in scenario ${report.scenario}:\n${lines.join('\n')}`
}

export { launchBrowserEnvironment, runScenarioPage, waitForReport, formatFailures }
export type { BrowserEnvironment, BrowserReport }
