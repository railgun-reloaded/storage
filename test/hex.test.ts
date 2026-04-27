import { hexToBytes } from '@railgun-reloaded/bytes'
import { test } from 'brittle'

test('hexToBytes: converts hex string without 0x prefix', (assert) => {
  const result = hexToBytes('deadbeef')
  assert.alike(result, new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
})

test('hexToBytes: converts hex string with 0x prefix', (assert) => {
  const result = hexToBytes('0xdeadbeef')
  assert.alike(result, new Uint8Array([0xde, 0xad, 0xbe, 0xef]))
})

test('hexToBytes: handles 32-byte commitment hash', (assert) => {
  const hash = '0xaabbccdd'.padEnd(2 + 64, '0')
  const result = hexToBytes(hash)
  assert.is(result.length, 32)
  assert.is(result[0], 0xaa)
  assert.is(result[1], 0xbb)
  assert.is(result[2], 0xcc)
  assert.is(result[3], 0xdd)
})

test('hexToBytes: throws on odd-length hex string', (assert) => {
  assert.exception(() => hexToBytes('abc'), /odd-length/)
  assert.exception(() => hexToBytes('0xabc'), /odd-length/)
})

test('hexToBytes: throws on non-hex characters', (assert) => {
  assert.exception(() => hexToBytes('zzzz'), /non-hex/)
  assert.exception(() => hexToBytes('0xgg11'), /non-hex/)
})

test('hexToBytes: returns empty Uint8Array for empty string', (assert) => {
  const result = hexToBytes('')
  assert.is(result.length, 0)
  assert.ok(result instanceof Uint8Array)
})
