import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  closeChainDB,
  createChainDB,
  getChainBootstrapPaths,
  getSnapshotCheckpoint,
  prepareChainBootstrap,
  promoteChainBootstrap,
  recordSnapshotCheckpoint,
  recoverChainBootstrap,
  updateSyncState
} from '../../src'

const CHAIN_ID = 11155111
const BLOCK_HEIGHT = 6_000_000n
const CID = 'bafyreicheckpoint'

/**
 * Create one disposable chain.db target.
 * @returns Temporary directory and target path.
 */
function temporaryTarget () {
  const directory = mkdtempSync(join(tmpdir(), 'storage-snapshot-bootstrap-'))
  return {
    directory,
    targetPath: join(directory, 'chain.db')
  }
}

/**
 * Valid checkpoint tree fixture.
 * @returns One tree checkpoint.
 */
function treeFixture () {
  return [{
    treeNumber: 0,
    leafCount: 2,
    root: new Uint8Array(32).fill(7)
  }]
}

test('recordSnapshotCheckpoint requires the exact persisted cursor', async (t) => {
  const db = await createChainDB({ path: ':memory:', runMigrations: true })
  t.after(() => closeChainDB(db))

  await assert.rejects(
    () => recordSnapshotCheckpoint(db, {
      chainID: CHAIN_ID,
      cid: CID,
      blockHeight: BLOCK_HEIGHT,
      trees: treeFixture()
    }),
    /persisted sync cursor is missing/
  )

  await updateSyncState(db, CHAIN_ID, BLOCK_HEIGHT)
  await recordSnapshotCheckpoint(db, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT,
    trees: treeFixture(),
    validatedAt: 123
  })

  const checkpoint = await getSnapshotCheckpoint(db, CHAIN_ID)
  assert.equal(checkpoint?.cid, CID)
  assert.equal(checkpoint?.blockHeight, BLOCK_HEIGHT)
  assert.equal(checkpoint?.validatedAt, 123)
  assert.deepEqual(checkpoint?.trees, treeFixture())
})

test('validated staging database is promoted with its checkpoint', async (t) => {
  const { directory, targetPath } = temporaryTarget()
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const paths = await prepareChainBootstrap(targetPath, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT
  })
  const stagingDB = await createChainDB({
    path: paths.stagingPath,
    runMigrations: true
  })
  await updateSyncState(stagingDB, CHAIN_ID, BLOCK_HEIGHT)
  await recordSnapshotCheckpoint(stagingDB, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT,
    trees: treeFixture()
  })
  await closeChainDB(stagingDB)

  promoteChainBootstrap(targetPath)

  assert.equal(existsSync(paths.targetPath), true)
  assert.equal(existsSync(paths.stagingPath), false)
  assert.equal(existsSync(paths.markerPath), false)

  const targetDB = await createChainDB({ path: targetPath })
  const checkpoint = await getSnapshotCheckpoint(targetDB, CHAIN_ID)
  await closeChainDB(targetDB)
  assert.equal(checkpoint?.blockHeight, BLOCK_HEIGHT)
})

test('recovery discards an interrupted unvalidated bootstrap', async (t) => {
  const { directory, targetPath } = temporaryTarget()
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const paths = await prepareChainBootstrap(targetPath, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT
  })
  const stagingDB = await createChainDB({
    path: paths.stagingPath,
    runMigrations: true
  })
  await updateSyncState(stagingDB, CHAIN_ID, BLOCK_HEIGHT)
  await closeChainDB(stagingDB)

  assert.equal(await recoverChainBootstrap(targetPath), 'discarded')
  assert.equal(existsSync(paths.targetPath), false)
  assert.equal(existsSync(paths.stagingPath), false)
  assert.equal(existsSync(paths.markerPath), false)
})

test('recovery preserves a promoted database when marker cleanup was interrupted', async (t) => {
  const { directory, targetPath } = temporaryTarget()
  t.after(() => rmSync(directory, { recursive: true, force: true }))

  const paths = await prepareChainBootstrap(targetPath, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT
  })
  const stagingDB = await createChainDB({
    path: paths.stagingPath,
    runMigrations: true
  })
  await updateSyncState(stagingDB, CHAIN_ID, BLOCK_HEIGHT)
  await recordSnapshotCheckpoint(stagingDB, {
    chainID: CHAIN_ID,
    cid: CID,
    blockHeight: BLOCK_HEIGHT,
    trees: treeFixture()
  })
  await closeChainDB(stagingDB)

  renameSync(paths.stagingPath, paths.targetPath)
  assert.equal(await recoverChainBootstrap(targetPath), 'promoted')
  assert.equal(existsSync(paths.targetPath), true)
  assert.equal(existsSync(paths.markerPath), false)

  const checkpointDB = await createChainDB({ path: targetPath })
  const checkpoint = await getSnapshotCheckpoint(checkpointDB, CHAIN_ID)
  await closeChainDB(checkpointDB)
  assert.equal(checkpoint?.cid, CID)
})

test('bootstrap paths are deterministic for one target', () => {
  const targetPath = join(tmpdir(), 'railgun-chain.db')
  assert.deepEqual(getChainBootstrapPaths(targetPath), {
    targetPath,
    stagingPath: `${targetPath}.bootstrap`,
    markerPath: `${targetPath}.bootstrap.json`
  })
})
