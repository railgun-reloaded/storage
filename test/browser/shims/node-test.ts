/**
 * Browser stand-in for the `node:test` API surface the contract suite uses.
 * `describe` groups names synchronously and `test` registers cases; the page
 * harness drains the registry with `runRegisteredTests`. The esbuild step
 * aliases `node:test` to this module so the contract files run unchanged.
 */

/** Outcome of one registered test. */
type BrowserTestResult = {
  name: string
  passed: boolean
  error?: string
}

type RegisteredTest = {
  name: string
  fn: () => void | Promise<void>
}

const groupNames: string[] = []
const registry: RegisteredTest[] = []

/**
 * Register a named group of tests. The body runs synchronously, matching how
 * the contract suite uses `node:test`.
 * @param name - Group name.
 * @param fn - Body registering tests.
 */
function describe (name: string, fn: () => void): void {
  groupNames.push(name)
  try {
    fn()
  } finally {
    groupNames.pop()
  }
}

/**
 * Register one test case.
 * @param name - Test name.
 * @param fn - Test body.
 */
function test (name: string, fn: () => void | Promise<void>): void {
  registry.push({ name: [...groupNames, name].join(' > '), fn })
}

/**
 * Run every registered test sequentially and collect the outcomes.
 * @returns One result per registered test, in registration order.
 */
async function runRegisteredTests (): Promise<BrowserTestResult[]> {
  const results: BrowserTestResult[] = []
  for (const entry of registry) {
    try {
      await entry.fn()
      results.push({ name: entry.name, passed: true })
    } catch (error) {
      results.push({
        name: entry.name,
        passed: false,
        error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
      })
    }
  }
  registry.length = 0
  return results
}

export { describe, test, runRegisteredTests }
export type { BrowserTestResult }
