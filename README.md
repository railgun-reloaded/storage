# @reloaded/storage

Persistence layer for RAILGUN Reloaded using Drizzle ORM with SQLite.

## Overview

RAILGUN Reloaded uses a **two-database architecture** for optimal performance and data separation:

### chain.db - Public Blockchain State
- Shared across all wallets for a given chain
- Stores nullifiers, merkle tree nodes, commitments, sync state
- Large database (~1M+ entries per year)
- Can be deleted and resynced from blockchain
- No encryption needed (public data)

### wallet.db - Private Wallet Data
- One database per wallet
- Stores encrypted keys, decrypted notes, balances, scan state, transaction history
- Small database (~1K-10K entries)
- Critical for backup/restore
- Can be encrypted at rest

## Installation

```bash
pnpm add @reloaded/storage
```

## Quick Start

### Chain Database

```typescript
import { createChainDB, insertNullifiersBatch, nullifierExists } from '@reloaded/storage/chain';

// Create chain database (shared across wallets)
const chainDb = createChainDB({
  path: '~/.railgun/chains/1/chain.db', // Ethereum mainnet
});

// Insert nullifiers in batch
const nullifiers = [
  {
    nullifier: '0x123...',
    txid: '0xabc...',
    blockNumber: 18000000n,
    treeId: 0,
  },
  // ... more nullifiers
];

insertNullifiersBatch(chainDb, nullifiers);

// Check if nullifier exists (spent note)
const isSpent = nullifierExists(chainDb, '0x123...');
```

### Wallet Database

```typescript
import {
  createWalletDB,
  createWallet,
  insertNote,
  getUnspentNotes,
  recalculateBalance,
} from '@reloaded/storage/wallet';

// Create wallet database (per-wallet)
const walletDb = createWalletDB({
  path: '~/.railgun/wallets/my-wallet/wallet.db',
});

// Create wallet
createWallet(walletDb, {
  id: 'wallet-1',
  encryptedKeys: Buffer.from('...encrypted keys...'),
  name: 'My RAILGUN Wallet',
});

// Insert decrypted note
insertNote(walletDb, {
  commitment: '0x456...',
  walletId: 'wallet-1',
  nullifier: '0x789...',
  token: '0x0000000000000000000000000000000000000000', // ETH
  amount: 1000000000000000000n, // 1 ETH
  spent: false,
  blockNumber: 18000000n,
  treeId: 0,
  leafIndex: 12345n,
});

// Get unspent notes
const unspent = getUnspentNotes(walletDb, 'wallet-1');

// Recalculate balance
const ethToken = '0x0000000000000000000000000000000000000000';
const balance = recalculateBalance(walletDb, 'wallet-1', ethToken);
console.log(`Balance: ${balance} wei`);
```

## API Reference

### Chain Database

#### Factory

```typescript
createChainDB(config: ChainDBConfig): ChainDB
```

**ChainDBConfig:**
- `path: string` - Database file path (use `:memory:` for in-memory)
- `runMigrations?: boolean` - Run migrations on init (default: true)
- `migrationsFolder?: string` - Path to migrations (default: './drizzle/chain')
- `verbose?: boolean` - Enable logging (default: false)

#### Nullifier Operations

```typescript
// Check existence
nullifierExists(db: ChainDB, nullifier: string): boolean

// Batch insert
insertNullifiersBatch(db: ChainDB, records: NewNullifier[]): number

// Query by block range
getNullifiersByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Nullifier[]

// Delete from block (reorg)
deleteNullifiersFromBlock(db: ChainDB, fromBlock: bigint): number
```

#### Merkle Tree Operations

```typescript
// Get node
getMerkleNode(db: ChainDB, treeId: number, level: number, index: bigint): MerkleNode | undefined

// Batch insert
insertMerkleNodesBatch(db: ChainDB, nodes: NewMerkleNode[]): number

// Get sibling path for proof
getMerkleSiblingPath(db: ChainDB, treeId: number, leafIndex: bigint, depth: number): Uint8Array[]
```

#### Commitment Operations

```typescript
// Batch insert
insertCommitmentsBatch(db: ChainDB, records: NewCommitment[]): number

// Query by leaf range
getCommitmentsByLeafRange(db: ChainDB, treeId: number, fromIndex: bigint, toIndex: bigint): Commitment[]

// Query by block range
getCommitmentsByBlockRange(db: ChainDB, fromBlock: bigint, toBlock: bigint): Commitment[]

// Batch lookup
getCommitmentsByHashes(db: ChainDB, hashes: string[]): Commitment[]
```

#### Sync State

```typescript
// Get state
getSyncState(db: ChainDB, chainId: number): SyncState | undefined

// Update state
updateSyncState(db: ChainDB, chainId: number, lastBlock: bigint): void
```

#### Utilities

```typescript
// Get stats
getChainDBStats(db: ChainDB): { nullifiers: number, merkleNodes: number, commitments: number, merkleRoots: number }

// Optimize database
optimizeChainDB(db: ChainDB, vacuum?: boolean): void

// Backup
backupChainDB(db: ChainDB, backupPath: string): void

// Close
closeChainDB(db: ChainDB): void
```

### Wallet Database

#### Factory

```typescript
createWalletDB(config: WalletDBConfig): WalletDB
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
createWallet(db: WalletDB, wallet: NewWallet): string

// Get wallet
getWallet(db: WalletDB, walletId: string): Wallet | undefined

// List wallets
listWallets(db: WalletDB): Wallet[]

// Delete wallet (cascades to all data)
deleteWallet(db: WalletDB, walletId: string): number
```

#### Note Operations

```typescript
// Insert single note
insertNote(db: WalletDB, note: NewNote): void

// Batch insert
insertNotesBatch(db: WalletDB, notes: NewNote[]): number

// Get unspent notes
getUnspentNotes(db: WalletDB, walletId: string, chainId: number): Note[]

// Get unspent notes by token
getUnspentNotesByToken(db: WalletDB, walletId: string, chainId: number, token: string): Note[]

// Get note by scoped wallet/chain/commitment identity
getNoteByCommitment(db: WalletDB, identity: NoteIdentity): Note | undefined

// Get note by scoped chain/nullifier/tree identity
getNoteByNullifier(db: WalletDB, identity: NoteNullifierIdentity): Note | undefined

// Mark spent
markNoteSpent(db: WalletDB, identity: NoteIdentity, spentTxid: Uint8Array): number

// Batch mark spent
markNotesSpentBatch(db: WalletDB, identities: NoteIdentity[], spentTxid: Uint8Array): number
```

#### Balance Operations

```typescript
// Recalculate single balance
recalculateBalance(db: WalletDB, walletId: string, token: string): bigint

// Recalculate all balances
recalculateAllBalances(db: WalletDB, walletId: string): void

// Get balance
getBalance(db: WalletDB, walletId: string, token: string): Balance | undefined

// Get all balances
getAllBalances(db: WalletDB, walletId: string): Balance[]
```

#### Scan State

```typescript
// Get scan state
getScanState(db: WalletDB, walletId: string, chainId: number): ScanState | undefined

// Update scan state
updateScanState(db: WalletDB, walletId: string, chainId: number, lastScannedBlock: bigint): void
```

#### Transaction History

```typescript
// Insert transaction
insertTxHistory(db: WalletDB, tx: NewTxHistory): void

// Get history
getTxHistory(db: WalletDB, walletId: string, limit?: number): TxHistory[]
```

## Type Definitions

### Chain Types

```typescript
type Nullifier = {
  nullifier: string;
  txid: string;
  blockNumber: bigint;
  treeId: number;
  createdAt: Date;
};

type MerkleNode = {
  treeId: number;
  level: number;
  index: bigint;
  hash: Uint8Array;
  createdAt: Date;
};

type Commitment = {
  hash: string;
  treeId: number;
  leafIndex: bigint;
  blockNumber: bigint;
  txid: string;
  createdAt: Date;
};

type SyncState = {
  chainId: number;
  lastBlock: bigint;
  updatedAt: Date;
};
```

### Wallet Types

```typescript
type Wallet = {
  id: string;
  encryptedKeys: Uint8Array;
  name: string | null;
  createdAt: Date;
};

type Note = {
  commitment: string;
  walletId: string;
  nullifier: string;
  token: string;
  amount: bigint;
  spent: boolean;
  spentTxid: string | null;
  blockNumber: bigint;
  treeId: number;
  leafIndex: bigint;
  decryptedAt: Date;
};

type Balance = {
  walletId: string;
  token: string;
  amount: bigint;
  updatedAt: Date;
};

type TxHistory = {
  id: string;
  walletId: string;
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
import { deleteNullifiersFromBlock, deleteCommitmentsFromBlock } from '@reloaded/storage/chain';

function handleReorg(chainDb: ChainDB, reorgBlock: bigint) {
  // Delete all data from the reorged block onwards
  const deletedNullifiers = deleteNullifiersFromBlock(chainDb, reorgBlock);
  const deletedCommitments = deleteCommitmentsFromBlock(chainDb, reorgBlock);

  console.log(`Reorg: deleted ${deletedNullifiers} nullifiers, ${deletedCommitments} commitments`);

  // Update sync state to resync from reorg point
  updateSyncState(chainDb, 1, reorgBlock - 1n);
}
```

### Batch Operations for Sync

```typescript
import { insertNullifiersBatch, insertCommitmentsBatch } from '@reloaded/storage/chain';

async function syncBlock(chainDb: ChainDB, blockNumber: bigint) {
  // Fetch data from blockchain
  const nullifiers = await fetchNullifiersFromBlock(blockNumber);
  const commitments = await fetchCommitmentsFromBlock(blockNumber);

  // Batch insert with transaction (automatic in helpers)
  insertNullifiersBatch(chainDb, nullifiers);
  insertCommitmentsBatch(chainDb, commitments);

  // Update sync state
  updateSyncState(chainDb, 1, blockNumber);
}
```

### Merkle Proof Generation

```typescript
import { getMerkleSiblingPath } from '@reloaded/storage/chain';

function generateMerkleProof(chainDb: ChainDB, leafIndex: bigint) {
  const treeId = 0;
  const depth = 20; // RAILGUN tree depth

  // Get sibling hashes for proof
  const siblings = getMerkleSiblingPath(chainDb, treeId, leafIndex, depth);

  return {
    leafIndex,
    siblings,
  };
}
```

### Balance Calculation

```typescript
import { getUnspentNotes, recalculateBalance } from '@reloaded/storage/wallet';

function getWalletBalance(walletDb: WalletDB, walletId: string, token: string) {
  // Option 1: Calculate from notes (always accurate)
  const unspentNotes = getUnspentNotes(walletDb, walletId).filter(
    (note) => note.token === token
  );
  const balance = unspentNotes.reduce((sum, note) => sum + note.amount, 0n);

  // Option 2: Use cached balance (faster, may be stale)
  const cachedBalance = getBalance(walletDb, walletId, token);

  // Option 3: Recalculate and cache (recommended)
  const freshBalance = recalculateBalance(walletDb, walletId, token);

  return freshBalance;
}
```

### Multi-Wallet Scanning

```typescript
import { createWalletDB, getScanState, updateScanState } from '@reloaded/storage/wallet';
import { createChainDB, getCommitmentsByBlockRange } from '@reloaded/storage/chain';

async function scanWallets(chainDb: ChainDB, walletDbs: WalletDB[], chainId: number) {
  for (const walletDb of walletDbs) {
    const wallets = listWallets(walletDb);

    for (const wallet of wallets) {
      // Get last scanned position
      const scanState = getScanState(walletDb, wallet.id, chainId);
      const lastScannedBlock = scanState?.lastScannedBlock ?? 0n;

      // Fetch new commitments from chain.db
      const newCommitments = getCommitmentsByBlockRange(
        chainDb,
        lastScannedBlock + 1n,
        lastScannedBlock + 1000n // Scan in chunks
      );

      // Decrypt commitments for this wallet
      const decryptedNotes = await decryptCommitments(wallet, newCommitments);

      // Insert notes
      insertNotesBatch(walletDb, decryptedNotes);

      // Update scan state
      updateScanState(walletDb, wallet.id, chainId, lastScannedBlock + 1000n);

      // Recalculate balances
      recalculateAllBalances(walletDb, wallet.id);
    }
  }
}
```

## Performance Considerations

### Write Performance
- Use batch operations (`insertNullifiersBatch`, `insertNotesBatch`) for bulk writes
- All batch operations use transactions internally

### Read Performance
- Critical indexes are pre-configured
- Use cached balances instead of recalculating from notes
- Consider connection pooling for multi-threaded applications

### Database Size
- **chain.db**: ~1-2GB per year per chain (nullifiers + commitments + nodes)
- **wallet.db**: ~1-10MB per active wallet (depends on transaction count)

### Optimization

```typescript
import { optimizeChainDB, optimizeWalletDB } from '@reloaded/storage';

// Run periodically (e.g., after bulk imports)
optimizeChainDB(chainDb, false); // ANALYZE only
optimizeWalletDB(walletDb); // ANALYZE only

// Run VACUUM to reclaim space (slow)
optimizeChainDB(chainDb, true); // ANALYZE + VACUUM
```

## Migrations

Generate migrations after schema changes:

```bash
# Generate chain migrations
pnpm db:generate:chain

# Generate wallet migrations
pnpm db:generate:wallet

# Generate both
pnpm db:generate
```

Migrations are applied automatically on database creation (unless `runMigrations: false`).

## Testing

```bash
# Run tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test -- --coverage
```

### Test Utilities

```typescript
import { createTestChainDB, createTestWalletDB, createTestNote } from '@reloaded/storage/test/setup';

// In-memory databases for testing
const chainDb = createTestChainDB();
const walletDb = createTestWalletDB();

// Test data factories
const note = createTestNote({ amount: 1000n });
```

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

See [DESIGN.md](./DESIGN.md) for detailed design decisions and schema analysis.

### Key Decisions
- **BigInt as TEXT**: Human-readable, arbitrary precision
- **Blobs as Buffer**: Efficient binary storage for hashes
- **Composite PKs**: Unique constraints on multi-column keys
- **Two Configs**: Separate migration paths for chain/wallet

## Roadmap

- [ ] SQLCipher integration for wallet.db encryption
- [ ] Database pruning (remove old nullifiers/commitments)
- [ ] Snapshot import/export for fast chain.db bootstrap
- [ ] Query optimization and prepared statement caching
- [ ] Multi-wallet connection pooling
- [ ] Compression for ciphertext storage (if added)

## License

MIT

## Contributing

See the main RAILGUN Reloaded repository for contribution guidelines.
