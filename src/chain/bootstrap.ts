import fs from 'fs'
import path from 'path'

import { closeChainDB, createChainDB } from './db.js'
import { getSnapshotCheckpoint } from './queries.js'

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

  const marker = readMarker(paths.markerPath)
  if (fs.existsSync(paths.targetPath)) {
    const targetDB = await createChainDB({ path: paths.targetPath, runMigrations: true })
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
 * Start a disposable bootstrap attempt. The caller must first establish that
 * the existing target has no trusted sync state.
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
