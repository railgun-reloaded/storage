import fs from 'fs'
import path from 'path'

import { gt } from 'drizzle-orm'

import { getSnapshotCheckpoint } from '../chain/queries.js'
import { syncState } from '../chain/schema.js'

import { closeChainDB, createChainDB } from './chain-db.js'

const CHAIN_BOOTSTRAP_MARKER_VERSION = 1

type ChainBootstrapMarker = {
  version: typeof CHAIN_BOOTSTRAP_MARKER_VERSION
  chainID: number
  cid: string
  blockHeight: string
}

type ChainBootstrapPaths = {
  targetPath: string
  stagingPath: string
  markerPath: string
}

type ChainBootstrapRecovery = 'none' | 'discarded' | 'promoted'

/**
 * Derive the disposable database and marker paths used for one trusted chain
 * database.
 * @param targetPath - Final chain.db path.
 * @returns Target, staging, and marker paths.
 */
function getChainBootstrapPaths (targetPath: string): ChainBootstrapPaths {
  const resolvedTarget = path.resolve(targetPath)
  return {
    targetPath: resolvedTarget,
    stagingPath: `${resolvedTarget}.bootstrap`,
    markerPath: `${resolvedTarget}.bootstrap.json`
  }
}

/**
 * Remove a SQLite database and any transient sidecar files.
 * @param dbPath - Main SQLite database path.
 */
function removeSQLiteFiles (dbPath: string): void {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true })
  }
}

/**
 * Parse and validate a bootstrap marker.
 * @param markerPath - Marker JSON path.
 * @returns Parsed marker.
 */
function readMarker (markerPath: string): ChainBootstrapMarker {
  const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as Partial<ChainBootstrapMarker>
  if (
    parsed.version !== CHAIN_BOOTSTRAP_MARKER_VERSION ||
    !Number.isInteger(parsed.chainID) ||
    typeof parsed.cid !== 'string' ||
    parsed.cid.length === 0 ||
    typeof parsed.blockHeight !== 'string'
  ) {
    throw new Error(`Invalid chain bootstrap marker: ${markerPath}`)
  }
  BigInt(parsed.blockHeight)
  return parsed as ChainBootstrapMarker
}

/**
 * Determine whether the target already holds trusted sync state. Bootstrap is
 * cold-start-only, so a target that has advanced its sync cursor must never be
 * overwritten by a staging attempt. The target is inspected without applying
 * migrations; an unreadable or schemaless file is treated as untrusted.
 * @param targetPath - Final chain.db path.
 * @returns `true` when the target carries a non-zero synced cursor.
 */
async function targetHasTrustedState (targetPath: string): Promise<boolean> {
  if (!fs.existsSync(targetPath)) {
    return false
  }
  const targetDB = await createChainDB({ path: targetPath, runMigrations: false })
  try {
    const synced = targetDB
      .select()
      .from(syncState)
      .where(gt(syncState.lastBlockHeight, 0n))
      .get()
    return synced !== undefined
  } catch {
    return false
  } finally {
    await closeChainDB(targetDB)
  }
}

/**
 * Recover from an interrupted bootstrap. A final database carrying the marker's
 * validated checkpoint is preserved; every other marked staging attempt is
 * discarded.
 * @param targetPath - Final chain.db path.
 * @returns Recovery action.
 */
async function recoverChainBootstrap (
  targetPath: string
): Promise<ChainBootstrapRecovery> {
  const paths = getChainBootstrapPaths(targetPath)
  if (!fs.existsSync(paths.markerPath)) {
    if (fs.existsSync(paths.stagingPath)) {
      removeSQLiteFiles(paths.stagingPath)
      return 'discarded'
    }
    return 'none'
  }

  let marker: ChainBootstrapMarker
  try {
    marker = readMarker(paths.markerPath)
  } catch {
    removeSQLiteFiles(paths.stagingPath)
    fs.rmSync(paths.markerPath, { force: true })
    return 'discarded'
  }

  if (fs.existsSync(paths.targetPath)) {
    const targetDB = await createChainDB({ path: paths.targetPath, runMigrations: false })
    try {
      const checkpoint = await getSnapshotCheckpoint(targetDB, marker.chainID)
      if (
        checkpoint?.cid === marker.cid &&
        checkpoint.blockHeight === BigInt(marker.blockHeight)
      ) {
        removeSQLiteFiles(paths.stagingPath)
        fs.rmSync(paths.markerPath, { force: true })
        return 'promoted'
      }
    } finally {
      await closeChainDB(targetDB)
    }
  }

  removeSQLiteFiles(paths.stagingPath)
  fs.rmSync(paths.markerPath, { force: true })
  return 'discarded'
}

/**
 * Start a disposable bootstrap attempt. Bootstrap is cold-start-only: the call
 * throws when the target already holds trusted sync state rather than
 * overwriting it.
 * @param targetPath - Final chain.db path.
 * @param marker - Snapshot identity and exact checkpoint height.
 * @returns Paths for the attempt.
 */
async function prepareChainBootstrap (
  targetPath: string,
  marker: Omit<ChainBootstrapMarker, 'version' | 'blockHeight'> & {
    blockHeight: bigint
  }
): Promise<ChainBootstrapPaths> {
  await recoverChainBootstrap(targetPath)
  const paths = getChainBootstrapPaths(targetPath)
  if (await targetHasTrustedState(paths.targetPath)) {
    throw new Error('Cannot bootstrap over a chain database with trusted sync state')
  }
  fs.mkdirSync(path.dirname(paths.targetPath), { recursive: true })
  removeSQLiteFiles(paths.targetPath)
  removeSQLiteFiles(paths.stagingPath)

  const markerData: ChainBootstrapMarker = {
    version: CHAIN_BOOTSTRAP_MARKER_VERSION,
    chainID: marker.chainID,
    cid: marker.cid,
    blockHeight: marker.blockHeight.toString()
  }
  const temporaryMarker = `${paths.markerPath}.tmp`
  fs.writeFileSync(temporaryMarker, JSON.stringify(markerData))
  fs.renameSync(temporaryMarker, paths.markerPath)
  return paths
}

/**
 * Discard a staged bootstrap attempt and its marker.
 * @param targetPath - Final chain.db path.
 */
function discardChainBootstrap (targetPath: string): void {
  const paths = getChainBootstrapPaths(targetPath)
  removeSQLiteFiles(paths.stagingPath)
  fs.rmSync(paths.markerPath, { force: true })
}

/**
 * Atomically promote a closed, validated staging database into chain.db.
 * The target is expected to be absent because bootstrap is cold-start-only.
 * @param targetPath - Final chain.db path.
 */
function promoteChainBootstrap (targetPath: string): void {
  const paths = getChainBootstrapPaths(targetPath)
  if (!fs.existsSync(paths.markerPath)) {
    throw new Error('Cannot promote chain bootstrap without a marker')
  }
  if (!fs.existsSync(paths.stagingPath)) {
    throw new Error('Cannot promote chain bootstrap without a staging database')
  }
  if (fs.existsSync(paths.targetPath)) {
    throw new Error('Cannot promote chain bootstrap over an existing chain database')
  }

  fs.renameSync(paths.stagingPath, paths.targetPath)
  fs.rmSync(paths.markerPath, { force: true })
}

export {
  discardChainBootstrap,
  getChainBootstrapPaths,
  prepareChainBootstrap,
  promoteChainBootstrap,
  recoverChainBootstrap
}
export type {
  ChainBootstrapMarker,
  ChainBootstrapPaths,
  ChainBootstrapRecovery
}
