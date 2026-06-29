import type { ChainStorage, WalletStorage } from '../../src/index.js'

/**
 * A live chain store under test together with its lifecycle controls.
 */
type ChainStorageHarness = {
  storage: ChainStorage
  reopen (): Promise<ChainStorage>
  close (): Promise<void>
}

/**
 * A live wallet store under test together with its lifecycle controls.
 */
type WalletStorageHarness = {
  storage: WalletStorage
  reopen (): Promise<WalletStorage>
  close (): Promise<void>
}

/**
 * Factory producing a fresh, isolated chain store for one test.
 */
type ChainHarnessFactory = () => Promise<ChainStorageHarness>

/**
 * Factory producing a fresh, isolated wallet store for one test.
 */
type WalletHarnessFactory = () => Promise<WalletStorageHarness>

export type {
  ChainStorageHarness,
  WalletStorageHarness,
  ChainHarnessFactory,
  WalletHarnessFactory,
}
