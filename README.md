# @railgun-reloaded/storage

Persistence layer for RAILGUN Reloaded using Drizzle ORM with SQLite.

All public storage/database operations are asynchronous and return a `Promise`, so the same API shape works on runtimes where storage is async-only.

## Entry Points

The package is split into runtime entry points:

- **`@railgun-reloaded/storage`** — the runtime-agnostic surface: the chain and wallet schemas, their inferred types, and the note converter. It carries no native database dependency.
- **`@railgun-reloaded/storage/node`** — the complete Node surface. It re-exports everything from the root entry and adds the runtime-dependent queries and the `better-sqlite3`-backed database factories.
- **`@railgun-reloaded/storage/browser`** — the browser SQLite adapter. It creates worker-hosted `@sqlite.org/sqlite-wasm` databases, applies the embedded migration catalog, and returns the same `ChainStorage` and `WalletStorage` contracts as Node.

`better-sqlite3` is an **optional peer dependency** used only by the `./node` entry. `@sqlite.org/sqlite-wasm` is an **optional peer dependency** used only by the `./browser` entry. The root entry installs and imports in a browser toolchain with no native driver, no `Buffer` global, and no polyfills.

```typescript
// Node consumers: import the database factories and queries from ./node
import { createChainDB, getUnspentNotes } from '@railgun-reloaded/storage/node';

// Browser consumers: import persistent SQLite factories from ./browser
import { chainDatabaseName, createChainDB } from '@railgun-reloaded/storage/browser';

// Schema-only / type-only consumers: import from the root entry
import type { DBNewNote } from '@railgun-reloaded/storage';
```

## Overview

RAILGUN Reloaded uses a **two-database architecture** for optimal performance and data separation:

### chain.db - Public Blockchain State
- Shared across all wallets for a given chain
- Stores nullifiers, commitments, unshields, Railgun transactions, serialized merkle trees, and sync state
- Large database (~1M+ entries per year)
- Can be deleted and resynced from blockchain
- No encryption needed (public data)

### wallet.db - Private Wallet Data
- One database per consumer (holds multiple wallets)
- Stores encrypted keys, decrypted notes, PPOI status, scan state, transaction history
- Small database (~1K-10K entries)
- Critical for backup/restore
- Can be encrypted at rest

## Installation

```bash
# Browser / schema-only consumers — no native driver required
npm install @railgun-reloaded/storage

# Node consumers — also install the native driver for the ./node entry
npm install @railgun-reloaded/storage better-sqlite3

# Browser storage consumers — also install the WASM driver for ./browser
npm install @railgun-reloaded/storage @sqlite.org/sqlite-wasm
```

## Quick Start

### Browser Storage

```typescript
import {
  chainDatabaseName,
  closeChainDB,
  closeWalletDB,
  createChainDB,
  createChainStorage,
  createWalletDB,
  createWalletStorage,
  deleteDatabase,
} from '@railgun-reloaded/storage/browser';

const chainDb = await createChainDB({
  name: chainDatabaseName({ chain: 1, railgunVersion: 0 }),
});
const chainStorage = createChainStorage(chainDb);
await chainStorage.updateSyncState(1, 0n);

const walletDb = await createWalletDB({ name: 'wallets' });
const walletStorage = createWalletStorage(walletDb);
await walletStorage.createWallet({
  id: 'wallet-1',
  encryptedKeys: new Uint8Array(32),
  name: 'Primary wallet',
});

await closeChainDB(chainDb); // keeps persistent data
await closeWalletDB(walletDb); // keeps persistent data
await deleteDatabase(chainDatabaseName({ chain: 1, railgunVersion: 0 })); // explicit deletion
await deleteDatabase('wallets'); // explicit deletion
```

Browser databases use logical names, not file paths. Chain databases should use
`chainDatabaseName({ chain, railgunVersion })`; wallet database names are chosen
by the application and may contain multiple wallet rows. Use `{ ephemeral: true
}` for throwaway test databases. Persistent opens fail fast with
`BrowserStorageError` code `DATABASE_BUSY` when another tab or worker holds the
same logical database; pass `waitForLock: true` to wait instead.

### Chain Database

```typescript
import { createChainDB, insertNullifiersBatch, nullifierExists } from '@railgun-reloaded/storage/node';

// Create chain database (shared across wallets)
const chainDb = await createChainDB({
  path: '~/.railgun/chains/1/chain.db', // Ethereum mainnet
});

// Insert nullifiers in batch
const nullifiers = [
  {
    nullifier: new Uint8Array(32),       // 32-byte nullifier
    transactionHash: new Uint8Array(32), // EVM tx hash
    blockNumber: 18000000n,
    treeNumber: 0,
  },
  // ... more nullifiers
];

await insertNullifiersBatch(chainDb, nullifiers);

// Check if nullifier exists (spent note)
const isSpent = await nullifierExists(chainDb, nullifiers[0].nullifier, 0);
```

### Wallet Database

```typescript
import {
  createWalletDB,
  createWallet,
  insertNote,
  getUnspentNotes,
} from '@railgun-reloaded/storage/node';

// Create wallet database
const walletDb = await createWalletDB({
  path: '~/.railgun/wallets.db',
});

// Create wallet
await createWallet(walletDb, {
  id: 'wallet-1',
  encryptedKeys: encryptedKeyBundle, // Uint8Array, encrypted by the caller
  name: 'My RAILGUN Wallet',
});

// Insert decrypted note
await insertNote(walletDb, {
  commitment: commitmentBytes, // Uint8Array
  walletId: 'wallet-1',
  chainId: 1,
  nullifier: nullifierBytes,   // Uint8Array
  token: '0x0000000000000000000000000000000000000000', // ETH
  amount: 1000000000000000000n, // 1 ETH
  spent: false,
  blockNumber: 18000000n,
  treeNumber: 0,
  treePosition: 12345,
  commitmentType: 0,
});

// Get unspent notes and compute a balance
const unspent = await getUnspentNotes(walletDb, 'wallet-1', 1);
const balance = unspent.reduce((sum, note) => sum + note.amount, 0n);
console.log(`Balance: ${balance} wei`);
```

## API Reference

### Chain Database

#### Factory

```typescript
createChainDB(config: ChainDBConfig): Promise<ChainDB>
```

**ChainDBConfig:**
- `path: string` - Database file path (use `:memory:` for in-memory)
- `runMigrations?: boolean` - Run migrations on init (default: true)
- `migrationsFolder?: string` - Path to migrations (default: './drizzle/chain')
- `verbose?: boolean` - Enable logging (default: false)

#### Nullifier Operations

```typescript
// Check existence
nullifierExists(db: ChainDB, nullifier: Uint8Array, treeNumber: number): Promise<boolean>

// Batch insert
insertNullifiersBatch(db: ChainDB, records: DBNewNullifier[]): Promise<number>

// Query by block range / from block / all
getNullifiersByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Promise<DBNullifier[]>
getNullifiersFromBlock(db: ChainDB, fromBlock: bigint): Promise<DBNullifier[]>
getAllNullifiers(db: ChainDB): Promise<DBNullifier[]>

// Delete from block (reorg)
deleteNullifiersFromBlock(db: ChainDB, fromBlock: bigint): Promise<number>
```

#### Merkle Tree Operations

Trees are stored as one row per tree: the serialized leaf buffer plus its leaf count.

```typescript
// Get one tree / all trees
getMerkleTree(db: ChainDB, treeNumber: number): Promise<DBMerkleTree | undefined>
getAllMerkleTrees(db: ChainDB): Promise<DBMerkleTree[]>

// Upsert a tree
setMerkleTree(db: ChainDB, tree: DBNewMerkleTree): Promise<number>
```

#### Commitment Operations

```typescript
// Batch insert
insertCommitmentBatch(db: ChainDB, records: DBNewCommitment[]): Promise<number>

// Query by leaf range
getCommitmentsByLeafRange(db: ChainDB, treeNumber: number, startLeafIndex: number, endLeafIndex: number): Promise<DBCommitment[]>

// Query by block range
getCommitmentsByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Promise<DBCommitment[]>

// Delete from block (reorg)
deleteCommitmentsFromBlock(db: ChainDB, fromBlock: bigint): Promise<number>
```

#### Sync State

```typescript
// Get state
getSyncState(db: ChainDB, chainID: number): Promise<SyncState | undefined>

// Update state
updateSyncState(db: ChainDB, chainID: number, lastBlockHeight: bigint): Promise<number>

// Independent Railgun TXID cursor (lags lastBlockHeight when events
// came from a source without PPOI transaction data)
getTxidSyncCursor(db: ChainDB, chainID: number): Promise<bigint>
setTxidSyncCursor(db: ChainDB, chainID: number, blockHeight: bigint): Promise<number>
```

#### Railgun Transactions

```typescript
// Insert, ignoring already-seen Railgun TXIDs
insertRailgunTransactions(db: ChainDB, rows: DBNewRailgunTransaction[]): Promise<number>

// Lookups
getRailgunTransactionByTxid(db: ChainDB, railgunTxid: Uint8Array): Promise<DBRailgunTransaction | undefined>
getRailgunTransactionsByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Promise<DBRailgunTransaction[]>
getRailgunTransactionsByTreeRange(db: ChainDB, utxoTreeOut: number, startPosition: number, endPosition: number): Promise<DBRailgunTransaction[]>

// Find the transaction whose output batch contains a commitment slot
findRailgunTransactionForLeaf(db: ChainDB, treeNumber: number, treePosition: number): Promise<DBRailgunTransaction | undefined>
```

#### Unshields

```typescript
insertUnshieldBatch(db: ChainDB, records: DBNewUnshield[]): Promise<number>
getUnshieldsByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Promise<DBUnshield[]>
```

#### Scan Batch

`insertScanBatch` persists one scan batch atomically — all members plus the sync cursors are written in a single transaction. The Railgun TXID cursor advances only when at least one new Railgun transaction row was inserted. There is no public transaction API; this and the other batch functions are the atomicity primitives.

```typescript
insertScanBatch(db: ChainDB, batch: ScanBatch): Promise<void>

type ScanBatch = {
  chainID: number
  blockNumber: bigint
  nullifiers?: DBNewNullifier[]
  commitments?: DBNewCommitment[]
  unshields?: DBNewUnshield[]
  railgunTransactions?: DBNewRailgunTransaction[]
  merkleTrees?: DBNewMerkleTree[]
}
```

#### Utilities

```typescript
// Database file size in bytes
getChainDBSize(db: ChainDB): Promise<number>

// Optimize database
optimizeChainDB(db: ChainDB, vacuum?: boolean): Promise<void>

// Backup
backupChainDB(db: ChainDB, backupPath: string): Promise<void>

// Close
closeChainDB(db: ChainDB): Promise<void>
```

### Wallet Database

#### Factory

```typescript
createWalletDB(config: WalletDBConfig): Promise<WalletDB>
```

**WalletDBConfig:**
- `path: string` - Database file path (use `:memory:` for in-memory)
- `runMigrations?: boolean` - Run migrations on init (default: true)
- `migrationsFolder?: string` - Path to migrations (default: './drizzle/wallet')
- `verbose?: boolean` - Enable logging (default: false)
- `encryptionKey?: string` - SQLCipher encryption key (future)

#### Wallet Operations

```typescript
// Create wallet
createWallet(db: WalletDB, wallet: DBNewWallet): Promise<string>

// Get wallet
getWallet(db: WalletDB, walletId: string): Promise<DBWallet | undefined>

// List wallets
listWallets(db: WalletDB): Promise<DBWallet[]>

// Delete wallet (cascades to all data)
deleteWallet(db: WalletDB, walletId: string): Promise<number>
```

#### Note Operations

```typescript
// Insert single note
insertNote(db: WalletDB, note: DBNewNote): Promise<void>

// Batch insert (merges missing PPOI fields on conflict)
insertNotesBatch(db: WalletDB, notes: DBNewNote[]): Promise<number>

// Get unspent notes
getUnspentNotes(db: WalletDB, walletId: string, chainId: number): Promise<DBNote[]>

// Get unspent notes by token
getUnspentNotesByToken(db: WalletDB, walletId: string, chainId: number, token: string): Promise<DBNote[]>

// Get all notes (spent and unspent)
getAllNotes(db: WalletDB, walletId: string, chainId: number): Promise<DBNote[]>

// Get note by scoped wallet/chain/commitment identity
getNoteByCommitment(db: WalletDB, identity: NoteIdentity): Promise<DBNote | undefined>

// Get note by scoped chain/nullifier/tree identity
getNoteByNullifier(db: WalletDB, identity: NoteNullifierIdentity): Promise<DBNote | undefined>

// Mark spent
markNoteSpent(db: WalletDB, identity: NoteIdentity, spentTxid: Uint8Array): Promise<number>

// Batch mark spent
markNotesSpentBatch(db: WalletDB, identities: NoteIdentity[], spentTxid: Uint8Array): Promise<number>

// PPOI status
getNotesNeedingPoiRefresh(db: WalletDB, walletId: string, chainId: number, requiredListKeys?: readonly string[]): Promise<DBNote[]>
updateNotePoiStatus(db: WalletDB, identity: NoteIdentity, blindedCommitment: Uint8Array, poisPerList: Record<string, string> | null): Promise<number>
updateNotePoiStatusBatch(db: WalletDB, updates: NotePoiStatusUpdate[]): Promise<number>
```

Token addresses are stored lowercase; query functions normalize their `token` argument, so callers may pass any casing. The `toDBNote`/`toDBNotes` helpers (synchronous) convert hex-string `NoteInput` records into `DBNewNote` rows.

#### Scan State

```typescript
// Get scan state
getScanState(db: WalletDB, walletId: string, chainId: number): Promise<DBScanState | undefined>

// Update scan state
updateScanState(db: WalletDB, walletId: string, chainId: number, lastScannedBlock: bigint): Promise<void>
```

#### Transaction History

```typescript
// Insert transaction
insertTxHistory(db: WalletDB, tx: DBNewTxHistory): Promise<void>

// Batch insert
insertTxHistoryBatch(db: WalletDB, txs: DBNewTxHistory[]): Promise<number>

// Get history (ordered by block number descending)
getTxHistory(db: WalletDB, walletId: string, chainId: number, limit?: number): Promise<DBTxHistory[]>

// Get one entry by ID
getTxById(db: WalletDB, txId: string): Promise<DBTxHistory | undefined>
```

#### Stats

```typescript
getWalletDBStats(db: WalletDB, walletId: string): Promise<{ notes: number, unspentNotes: number, transactions: number }>
```

## Type Definitions

### Chain Types

Row types (`DBNullifier`, `DBCommitment`, …) and insert types (`DBNewNullifier`, …) are inferred from the Drizzle schemas in `src/chain/schema.ts` and re-exported from the package root.

```typescript
type DBNullifier = {
  nullifier: Uint8Array;       // 32 bytes
  transactionHash: Uint8Array;
  blockNumber: bigint;
  treeNumber: number;
};

type DBMerkleTree = {
  treeNumber: number;
  leaves: Uint8Array;          // serialized tree leaves
  leafCount: number;
};

type DBCommitment = {
  hash: Uint8Array;
  transactionHash: Uint8Array;
  blockNumber: bigint;
  treeNumber: number;
  treePosition: number;
  commitmentType: number;      // 0 = shield, 1 = transact
  commitment: unknown;         // msgpack-encoded commitment data
};

type SyncState = {
  chainID: number;
  lastBlockHeight: bigint;
  lastTxidSyncBlockHeight: bigint;
};
```

### Wallet Types

```typescript
type DBWallet = {
  id: string;
  encryptedKeys: Uint8Array;
  name: string | null;
  createdAt: Date;
};

type DBNote = {
  commitment: Uint8Array;
  walletId: string;
  chainId: number;
  nullifier: Uint8Array;
  token: string;                 // lowercase address
  amount: bigint;
  tokenType: number;             // 0 = ERC20, 1 = ERC721
  tokenSubID: Uint8Array;
  spent: boolean;
  spentTxid: Uint8Array | null;
  blockNumber: bigint;
  treeNumber: number;
  treePosition: number;
  commitmentType: number;
  outputType: number | null;
  npk: Uint8Array | null;
  random: Uint8Array | null;
  blindedCommitment: Uint8Array | null;
  creationRailgunTxid: Uint8Array | null;
  creationTxid: Uint8Array | null;
  poisPerList: unknown;          // msgpack-encoded PPOI statuses by list key
  decryptedAt: Date;
};

type DBTxHistory = {
  id: string;
  walletId: string;
  chainId: number;
  type: 'shield' | 'transfer' | 'unshield';
  txid: string;
  blockNumber: bigint;
  timestamp: Date;
  metadata: unknown;
  createdAt: Date;
};
```

## Advanced Usage

### Handling Reorgs

```typescript
import { deleteNullifiersFromBlock, deleteCommitmentsFromBlock } from '@railgun-reloaded/storage/node';

async function handleReorg(chainDb: ChainDB, reorgBlock: bigint) {
  // Delete all data from the reorged block onwards
  const deletedNullifiers = await deleteNullifiersFromBlock(chainDb, reorgBlock);
  const deletedCommitments = await deleteCommitmentsFromBlock(chainDb, reorgBlock);

  console.log(`Reorg: deleted ${deletedNullifiers} nullifiers, ${deletedCommitments} commitments`);

  // Update sync state to resync from reorg point
  await updateSyncState(chainDb, 1, reorgBlock - 1n);
}
```

### Batch Operations for Sync

```typescript
import { insertScanBatch } from '@railgun-reloaded/storage/node';

async function syncBlock(chainDb: ChainDB, blockNumber: bigint) {
  // Fetch data from blockchain
  const nullifiers = await fetchNullifiersFromBlock(blockNumber);
  const commitments = await fetchCommitmentsFromBlock(blockNumber);

  // One atomic write: rows + sync cursor commit (or roll back) together
  await insertScanBatch(chainDb, {
    chainID: 1,
    blockNumber,
    nullifiers,
    commitments,
  });
}
```

### Balance Calculation

Balances are not cached in the database — they are computed from unspent notes.

```typescript
import { getUnspentNotesByToken } from '@railgun-reloaded/storage/node';

async function getWalletBalance(walletDb: WalletDB, walletId: string, chainId: number, token: string) {
  const unspentNotes = await getUnspentNotesByToken(walletDb, walletId, chainId, token);
  return unspentNotes.reduce((sum, note) => sum + note.amount, 0n);
}
```

### Multi-Wallet Scanning

```typescript
import { getCommitmentsByBlockRange, getScanState, insertNotesBatch, listWallets, updateScanState } from '@railgun-reloaded/storage/node';

async function scanWallets(chainDb: ChainDB, walletDb: WalletDB, chainId: number) {
  const wallets = await listWallets(walletDb);

  for (const wallet of wallets) {
    // Get last scanned position
    const scanState = await getScanState(walletDb, wallet.id, chainId);
    const lastScannedBlock = scanState?.lastScannedBlock ?? 0n;

    // Fetch new commitments from chain.db
    const newCommitments = await getCommitmentsByBlockRange(
      chainDb,
      lastScannedBlock + 1n,
      lastScannedBlock + 1000n // Scan in chunks
    );

    // Decrypt commitments for this wallet
    const decryptedNotes = await decryptCommitments(wallet, newCommitments);

    // Insert notes
    await insertNotesBatch(walletDb, decryptedNotes);

    // Update scan state
    await updateScanState(walletDb, wallet.id, chainId, lastScannedBlock + 1000n);
  }
}
```

## Performance Considerations

### Write Performance
- Use batch operations (`insertNullifiersBatch`, `insertNotesBatch`) for bulk writes
- All batch operations use transactions internally

### Read Performance
- Critical indexes are pre-configured

### Database Size
- **chain.db**: ~1-2GB per year per chain (nullifiers + commitments + merkle trees)
- **wallet.db**: ~1-10MB per active wallet (depends on transaction count)

### Optimization

```typescript
import { optimizeChainDB, optimizeWalletDB } from '@railgun-reloaded/storage/node';

// Run periodically (e.g., after bulk imports)
await optimizeChainDB(chainDb, false); // ANALYZE only
await optimizeWalletDB(walletDb); // ANALYZE only

// Run VACUUM to reclaim space (slow)
await optimizeChainDB(chainDb, true); // ANALYZE + VACUUM
```

## Migrations

The SQL migration history under `drizzle/` is committed, append-only, and the
single source of truth for the schema. It is not regenerated by `build` or
`prepare`; two installs of the same commit always share the same history.

After changing a schema, generate the next migration, review it, and commit it
together with the schema change:

```bash
# Generate chain migrations
npm run db:generate:chain -- --name=<short-description>

# Generate wallet migrations
npm run db:generate:wallet -- --name=<short-description>

# Generate both (drizzle-kit picks migration names)
npm run db:generate
```

CI fails if the committed history under `drizzle/` does not match the schema.

Migrations are applied automatically on database creation (unless
`runMigrations: false`).

Databases created before the history was canonicalized (pre-`0000_init`) are
not upgradeable: delete the `.db` files and let them be recreated.

## Testing

```bash
# Run Node/shared storage tests (builds first)
npm test

# Run the real-browser adapter contract suite
npm run test:browser
```

Node tests run against in-memory databases (`path: ':memory:'`) via the
factories in `test/utils.ts`. Browser tests drive system Chrome through
Playwright and run the shared contract suite against `./browser`.

## Security Considerations

### Wallet Database Encryption
- **Current**: Application-level encryption (encrypt data before storing)
- **Future**: SQLCipher database-level encryption (requires `better-sqlite3-sqlcipher`)

### Backup Strategy
- **chain.db**: Can be deleted and resynced from blockchain
- **wallet.db**: CRITICAL - contains encrypted keys and private data
  - Encrypt backups
  - Store securely (encrypted cloud, hardware backup)
  - Test restoration regularly

### Key Management
- Never store plaintext keys in database
- `encryptedKeys` field should contain encrypted key bundle
- Decryption keys should be derived from user passphrase (not stored)

## Architecture

### Key Decisions
- **BigInt as TEXT**: Human-readable, arbitrary precision
- **Blobs as Uint8Array**: Efficient binary storage for hashes, with no Node `Buffer` dependency
- **Composite PKs**: Unique constraints on multi-column keys
- **Two Configs**: Separate migration paths for chain/wallet

## License

MIT

## Contributing

See the main RAILGUN Reloaded repository for contribution guidelines.
