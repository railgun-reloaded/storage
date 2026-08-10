import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import '../src/index.js'

const nodeRequire = createRequire(import.meta.url)

test('Root Entry: pulls in no native database module', () => {
  const nativeLoaded = Object.keys(nodeRequire.cache).some((modulePath) =>
    modulePath.includes('better-sqlite3')
  )
  assert.equal(nativeLoaded, false)
})
