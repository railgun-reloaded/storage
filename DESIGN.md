# Storage Package Design Analysis

## Overview
Two-database architecture for RAILGUN Reloaded persistence layer using Drizzle ORM with SQLite.

## Key Design Decisions

### 1. BigInt Storage Strategy

**Problem:** SQLite doesn't natively support JavaScript BigInt (64-bit+). Ethereum block numbers and leaf indexes can exceed 2^31.

**Solution:** Use TEXT storage with Drizzle's `text()` mode `{ mode: 'bigint' }`
- Stores as decimal string in SQLite
- Automatic conversion to/from BigInt in JavaScript
- Human-readable in raw database queries
- No precision loss for arbitrary large integers

**Alternative Rejected:** BLOB storage (8 bytes) - limited to int64, requires manual serialization

### 2. Blob Storage for Hashes

**Problem:** Merkle node hashes are 32-byte Uint8Array. Commitments and nullifiers are hex strings.

**Solution:**
- Merkle nodes: `blob({ mode: 'buffer' })` - efficient binary storage
- Nullifiers/commitments: TEXT as hex strings - easier debugging, existing format
- Encrypted keys: `blob({ mode: 'buffer' })` - binary encrypted data

### 3. Index Strategy

**Critical Indexes:**

**chain.db:**
- `nullifiers(nullifier)` - PK, auto-indexed for spent checks
- `nullifiers(blockNumber)` - for pruning/reorg handling
- `merkle_nodes(treeId, level, index)` - composite PK for node lookups
- `commitments(treeId, leafIndex)` - for range scans during sync
- `commitments(blockNumber)` - for reorg handling

**wallet.db:**
- `notes(commitment)` - PK for deduplication
- `notes(walletId, spent)` - fast unspent note queries
- `notes(nullifier)` - lookup by nullifier
- `notes(token)` - filter by token type
- `balances(walletId, token)` - composite PK for balance lookups
- `scan_state(walletId, chainId)` - composite PK for multi-chain
- `tx_history(walletId, blockNumber)` - chronological queries

### 4. Composite Primary Keys

**merkle_nodes:** `(treeId, level, index)` as composite PK
- Uniquely identifies a node in the tree structure
- treeId: which merkle tree (0, 1, 2...)
- level: tree depth (0 = leaves, increases upward)
- index: position at that level

**balances:** `(walletId, token)` as composite PK
- One balance entry per wallet per token
- Enables efficient upserts

**scan_state:** `(walletId, chainId)` as composite PK
- Multi-chain support
- Each wallet tracks progress per chain independently

### 5. Two Database Files

**chain.db** - Public blockchain state
- Location: `~/.railgun/chains/{chainId}/chain.db`
- Shared across all wallets
- Can be deleted and resynced
- Large (millions of nullifiers)
- No encryption needed (public data)

**wallet.db** - Private wallet data
- Location: `~/.railgun/wallets/{walletId}/wallet.db`
- One per wallet
- Small (only user's notes)
- Encrypted at rest (future: SQLCipher or column-level)
- Critical for backup/restore

### 6. Migration Strategy

**Two separate Drizzle configs:**
- `drizzle.chain.config.ts` → migrations in `drizzle/chain/`
- `drizzle.wallet.config.ts` → migrations in `drizzle/wallet/`

**Migration workflow:**
```bash
# Generate migrations
pnpm drizzle-kit generate:sqlite --config=drizzle.chain.config.ts
pnpm drizzle-kit generate:sqlite --config=drizzle.wallet.config.ts

# Apply migrations (runtime)
import { migrate as migrateChain } from 'drizzle-orm/better-sqlite3/migrator'
migrateChain(chainDb, { migrationsFolder: 'drizzle/chain' })
```

### 7. Batch Operations

**Problem:** Syncing writes thousands of records per block.

**Solution:** Transaction helpers with batch inserts
```typescript
// Batch insert 1000 nullifiers in one transaction
db.transaction(() => {
  db.insert(nullifiers).values(records).execute()
})
```

Drizzle supports `.values([...])` for bulk inserts.

### 8. Encryption Approach

**Phase 1 (Current):** Application-level encryption
- Consuming code encrypts data before calling storage APIs
- `encryptedKeys` field stores pre-encrypted blob
- Storage layer is encryption-agnostic

**Phase 2 (Future):** SQLCipher integration
- Transparent database-level encryption
- Requires `better-sqlite3-sqlcipher` binding
- Key derivation from user passphrase

### 9. Type Safety Considerations

**Drizzle inference:**
```typescript
// Inferred types from schema
type Nullifier = typeof nullifiers.$inferSelect
type NewNullifier = typeof nullifiers.$inferInsert

// Export these for consuming packages
export type { Nullifier, NewNullifier, ... }
```

**BigInt handling in TypeScript:**
- All BigInt fields properly typed as `bigint` not `number`
- Consumers must use `123n` literal syntax
- JSON serialization requires custom replacer

### 10. Query Helper Design Philosophy

**Principles:**
- Expose Drizzle database instance for advanced queries
- Provide helpers for common patterns only
- Keep storage layer thin - business logic belongs elsewhere
- Focus on performance-critical operations (batch, transactions)

**Included helpers:**
- Batch operations (insert many nullifiers, nodes, commitments)
- Transaction wrappers
- Common queries (unspent notes, balance calculation)
- Sync state management

**Not included:**
- Complex business logic
- Proof generation
- Cryptographic operations

## Schema Edge Cases

### Nullifier Duplicates
- PK prevents duplicates at DB level
- Malicious relayers might submit duplicate nullifiers
- INSERT OR IGNORE pattern for idempotency

### Merkle Tree Reorgs
- Chain reorg requires rolling back nullifiers/commitments
- Include `blockNumber` on all chain data
- Query: `DELETE WHERE blockNumber > reorgBlock`

### Wallet Migration
- Upgrading wallet.db schema while preserving data
- Drizzle migrations handle this
- Export/import functionality for backup (future)

### Multi-Tree Support
- RAILGUN may have multiple merkle trees
- `treeId` field distinguishes them
- Each tree has independent leaves/roots

### Note Scanning Race Conditions
- Multiple wallets scanning same chain.db concurrently
- SQLite handles with WAL mode (Write-Ahead Logging)
- Enable with `PRAGMA journal_mode = WAL`

## Performance Considerations

### Expected Data Volumes
- Nullifiers: ~1M per year per chain
- Merkle nodes: ~2M per tree (depth 20, full tree)
- Commitments: ~1M per year per chain
- Notes (per wallet): ~1000-10000
- Balances (per wallet): ~10-100 tokens

### Query Patterns
- Hot path: nullifier existence checks (proof generation)
- Hot path: merkle node lookups (proof generation)
- Warm path: unspent notes query (balance display)
- Cold path: transaction history (UI display)

### Optimization Strategies
- Prepared statements (Drizzle handles this)
- Appropriate indexes (see section 3)
- Batch inserts with transactions
- WAL mode for concurrent reads during writes
- ANALYZE after bulk imports

## Testing Strategy

### In-Memory Databases
```typescript
import Database from 'better-sqlite3'

const db = new Database(':memory:')
```

### Test Utilities
- Factory functions for test data
- Helper to create populated test databases
- Snapshot testing for schema migrations

### Test Coverage
- Schema constraints (FK, PK, unique)
- Batch insert performance
- Transaction rollback
- Migration up/down
- Concurrent access (WAL mode)

## Future Enhancements

1. **Pruning:** Remove old nullifiers/commitments to bound database size
2. **Archival:** Export historical data to cold storage
3. **Compression:** BLOB compression for ciphertexts
4. **Sharding:** Multiple chain.db files for different block ranges
5. **Replication:** Sync chain.db across devices
6. **Analytics:** Query layer for transaction analysis

## Open Questions

1. Should we store ciphertexts in chain.db for wallet recovery scenarios?
   - Pro: Enables scanning without external node
   - Con: Massive storage increase (~200 bytes per commitment)
   - Decision: **No, fetch from node/IPFS during recovery**

2. Should we store merkle tree roots?
   - Pro: Fast root retrieval for proof verification
   - Con: Can be recomputed from tree
   - Decision: **Add `merkle_roots` table for caching**

3. Transaction history metadata schema?
   - JSON blob vs structured columns
   - Decision: **JSON for flexibility, add columns as needed**

4. Multi-chain in single chain.db or separate files?
   - Decision: **Separate files per chain (path-based)**
