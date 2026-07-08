/**
 * Browser stand-in for the `node:assert/strict` subset the contract suite
 * uses: `equal`, `deepEqual`, `ok`, and `rejects`, with strict-mode
 * semantics. Deep equality understands the value shapes the storage layer
 * round-trips: bigints, `Uint8Array`s, `Date`s, arrays, and plain objects.
 * The esbuild step aliases `node:assert/strict` to this module.
 */

/**
 * Render a value for an assertion message, tolerating bigints and binary.
 * @param value - Value to render.
 * @returns A short human-readable rendering.
 */
function inspect (value: unknown): string {
  if (typeof value === 'bigint') {
    return `${value}n`
  }
  if (value instanceof Uint8Array) {
    return `Uint8Array(${value.length})[${Array.from(value.slice(0, 8)).join(',')}${value.length > 8 ? ',...' : ''}]`
  }
  try {
    return JSON.stringify(value, (_key, entry) => {
      if (typeof entry === 'bigint') {
        return `${entry}n`
      }
      if (entry instanceof Uint8Array) {
        return inspect(entry)
      }
      return entry
    }) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * Structural strict equality over the storage layer's value shapes.
 * @param a - Actual value.
 * @param b - Expected value.
 * @returns `true` when the values are deeply strictly equal.
 */
function isDeepEqual (a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }
  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array) || a.length !== b.length) {
      return false
    }
    return a.every((byte, index) => byte === b[index])
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false
    }
    return a.every((entry, index) => isDeepEqual(entry, b[index]))
  }
  const aKeys = Object.keys(a as Record<string, unknown>)
  const bKeys = Object.keys(b as Record<string, unknown>)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  return aKeys.every((key) =>
    Object.hasOwn(b, key) && isDeepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  )
}

/**
 * Failure thrown by the assertion shim.
 */
class AssertionError extends Error {}

/**
 * Assert strict (`Object.is`) equality.
 * @param actual - Actual value.
 * @param expected - Expected value.
 * @param message - Optional failure message.
 */
function equal (actual: unknown, expected: unknown, message?: string): void {
  if (!Object.is(actual, expected)) {
    throw new AssertionError(message ?? `Expected ${inspect(actual)} to strictly equal ${inspect(expected)}`)
  }
}

/**
 * Assert deep strict equality.
 * @param actual - Actual value.
 * @param expected - Expected value.
 * @param message - Optional failure message.
 */
function deepEqual (actual: unknown, expected: unknown, message?: string): void {
  if (!isDeepEqual(actual, expected)) {
    throw new AssertionError(message ?? `Expected ${inspect(actual)} to deeply equal ${inspect(expected)}`)
  }
}

/**
 * Assert a value is truthy.
 * @param value - Value under test.
 * @param message - Optional failure message.
 */
function ok (value: unknown, message?: string): void {
  if (!value) {
    throw new AssertionError(message ?? `Expected ${inspect(value)} to be truthy`)
  }
}

/**
 * Assert an async operation rejects.
 * @param operation - Promise or async function expected to reject.
 * @param message - Optional failure message.
 */
async function rejects (operation: Promise<unknown> | (() => Promise<unknown>), message?: string): Promise<void> {
  try {
    await (typeof operation === 'function' ? operation() : operation)
  } catch {
    return
  }
  throw new AssertionError(message ?? 'Expected the operation to reject')
}

const assert = { equal, deepEqual, ok, rejects }

export default assert
export { equal, deepEqual, ok, rejects }
