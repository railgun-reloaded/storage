import { BrowserStorageError } from './errors.js'

const DATABASE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Validate a logical database name. Names address databases inside the
 * origin's private file system, so they are restricted to a filesystem-safe
 * alphabet.
 * @param name - Logical database name supplied by the caller.
 */
function assertValidDatabaseName (name: string): void {
  if (!DATABASE_NAME_PATTERN.test(name)) {
    throw new BrowserStorageError(
      'INITIALIZATION_FAILED',
      `Invalid database name ${JSON.stringify(name)}. Names must start with a letter or digit and contain only letters, digits, ".", "_" or "-".`
    )
  }
}

/**
 * Derive the canonical chain database name for a chain. This is the
 * documented per-chain naming convention: one chain database per
 * `{ chain, railgunVersion }` pair, e.g. `chain-1-v0` for Ethereum mainnet
 * RAILGUN v0. Wallet databases deliberately have no canonical convention;
 * applications name them to match their own multi-wallet model.
 * @param chainID - Chain identifier tuple.
 * @param chainID.chain - EVM chain id.
 * @param chainID.railgunVersion - RAILGUN deployment version on that chain.
 * @returns The logical database name for that chain.
 */
function chainDatabaseName (chainID: { chain: number, railgunVersion: number }): string {
  return `chain-${chainID.chain}-v${chainID.railgunVersion}`
}

/**
 * Derive the SAH pool VFS name backing a logical database.
 * @param name - Logical database name.
 * @returns The VFS registration name.
 */
function poolNameForDatabase (name: string): string {
  return `railgun-storage-${name}`
}

/**
 * Derive the OPFS directory holding a logical database's pool. The SAH pool
 * VFS synthesizes its directory as "." + the pool name.
 * @param name - Logical database name.
 * @returns The OPFS directory name at the origin's root.
 */
function opfsDirectoryForDatabase (name: string): string {
  return `.${poolNameForDatabase(name)}`
}

/**
 * Derive the Web Locks name coordinating access to a logical database.
 * @param name - Logical database name.
 * @returns The lock name.
 */
function lockNameForDatabase (name: string): string {
  return `railgun-storage:${name}`
}

export {
  assertValidDatabaseName,
  chainDatabaseName,
  poolNameForDatabase,
  opfsDirectoryForDatabase,
  lockNameForDatabase,
}
