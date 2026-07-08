import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'

import type { BrowserEnvironment } from './harness/environment.js'
import { formatFailures, launchBrowserEnvironment, runScenarioPage, waitForReport } from './harness/environment.js'

/**
 * Drive the shared storage contract suite in a real browser against the
 * browser adapter's ephemeral factories. The suite itself is the same
 * `test/contract/` code the Node adapter runs; only the harness factories
 * differ.
 */

describe('browser adapter (real Chrome)', () => {
  let environment: BrowserEnvironment

  before(async () => {
    environment = await launchBrowserEnvironment()
  })

  after(async () => {
    await environment?.close()
  })

  test('contract suite passes against ephemeral factories', async () => {
    const { page, report } = await runScenarioPage(environment, 'contract-ephemeral')
    try {
      assert.ok(report.results.length > 0, 'expected the contract suite to register tests')
      assert.equal(formatFailures(report), undefined)
    } finally {
      await page.close()
    }
  })

  test('contract suite passes against persistent factories', async () => {
    const { page, report } = await runScenarioPage(environment, 'contract-persistent')
    try {
      assert.ok(report.results.length > 0, 'expected the contract suite to register tests')
      assert.equal(formatFailures(report), undefined)
    } finally {
      await page.close()
    }
  })

  test('ephemeral databases leave no persistent data', async () => {
    const { page, report } = await runScenarioPage(environment, 'ephemeral-leaves-no-data')
    try {
      assert.equal(formatFailures(report), undefined)
    } finally {
      await page.close()
    }
  })

  test('persistent data survives into a fresh page and worker context', async () => {
    const write = await runScenarioPage(environment, 'persist-write')
    await write.page.close()
    assert.equal(formatFailures(write.report), undefined)

    const verify = await runScenarioPage(environment, 'persist-verify')
    try {
      assert.equal(formatFailures(verify.report), undefined)
    } finally {
      await verify.page.close()
    }
  })

  test('logical database identifiers isolate persistent data', async () => {
    const { page, report } = await runScenarioPage(environment, 'logical-name-isolation')
    try {
      assert.equal(formatFailures(report), undefined)
    } finally {
      await page.close()
    }
  })

  test('wallet database supports multiple wallets', async () => {
    const { page, report } = await runScenarioPage(environment, 'wallet-multi-wallet')
    try {
      assert.equal(formatFailures(report), undefined)
    } finally {
      await page.close()
    }
  })

  test('concurrent opens follow the lock policy across tabs', async () => {
    const holder = await runScenarioPage(environment, 'multitab-hold')
    try {
      assert.equal(formatFailures(holder.report), undefined)

      const probe = await runScenarioPage(environment, 'multitab-probe')
      await probe.page.close()
      assert.equal(formatFailures(probe.report), undefined)

      const waiter = await environment.context.newPage()
      await waiter.goto(`${environment.baseUrl}/?scenario=multitab-wait`)
      await holder.page.close()
      const waiterReport = await waitForReport(waiter)
      await waiter.close()
      assert.equal(formatFailures(waiterReport), undefined)
    } finally {
      if (!holder.page.isClosed()) {
        await holder.page.close()
      }
    }
  })
})
