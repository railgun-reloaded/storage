/**
 * railgun-reloaded/storage/browser - Browser database adapter entry.
 *
 * TODO: not yet implemented. This entry will be the browser counterpart of
 * `./node`: database lifecycle for a browser SQLite driver (wa-sqlite or
 * sql.js over OPFS — driver choice pending), a `Transactor` for that driver,
 * and one-argument factory wrappers that wire a browser database into the
 * platform-neutral `ChainStorage` and `WalletStorage` contracts from the
 * root entry. The adapter must pass the same contract suite as the Node
 * adapter (`test/contract/`). Wire the `./browser` subpath into the package
 * `exports` map when the adapter lands.
 */

export {}
