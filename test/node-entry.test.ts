import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import '../src/node/index.js'

const nodeRequire = createRequire(import.meta.url)

test('Node Entry: defers loading the native module until a database is created', () => {
  const nativeLoaded = Object.keys(nodeRequire.cache).some((modulePath) =>
    modulePath.includes('better-sqlite3')
  )
  assert.equal(nativeLoaded, false)
})
