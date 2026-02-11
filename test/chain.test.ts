import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestChainDB,
  createTestNullifier,
  createTestMerkleNode,
  createTestCommitment,
  resetTestCounters,
} from './setup';
import {
  insertNullifiersBatch,
  nullifierExists,
  deleteNullifiersFromBlock,
  insertMerkleNodesBatch,
  getMerkleNode,
  getMerkleSiblingPath,
  insertCommitmentsBatch,
  getCommitmentsByLeafRange,
  updateSyncState,
  getSyncState,
  getChainDBStats,
} from '../src/chain/index';

describe('Chain Database', () => {
  beforeEach(() => {
    resetTestCounters();
  });

  describe('Nullifiers', () => {
    it('should insert and check nullifier existence', () => {
      const db = createTestChainDB();
      const nullifier = createTestNullifier();

      insertNullifiersBatch(db, [nullifier]);

      expect(nullifierExists(db, nullifier.nullifier)).toBe(true);
      expect(nullifierExists(db, '0xnonexistent')).toBe(false);
    });

    it('should batch insert nullifiers', () => {
      const db = createTestChainDB();
      const nullifiers = [
        createTestNullifier(),
        createTestNullifier(),
        createTestNullifier(),
      ];

      const count = insertNullifiersBatch(db, nullifiers);

      expect(count).toBe(3);
      nullifiers.forEach((n) => {
        expect(nullifierExists(db, n.nullifier)).toBe(true);
      });
    });

    it('should handle duplicate nullifiers (idempotent)', () => {
      const db = createTestChainDB();
      const nullifier = createTestNullifier();

      const count1 = insertNullifiersBatch(db, [nullifier]);
      const count2 = insertNullifiersBatch(db, [nullifier]);

      expect(count1).toBe(1);
      expect(count2).toBe(0); // Duplicate ignored
    });

    it('should delete nullifiers from block (reorg)', () => {
      const db = createTestChainDB();
      const nullifiers = [
        createTestNullifier({ blockNumber: 100n }),
        createTestNullifier({ blockNumber: 101n }),
        createTestNullifier({ blockNumber: 102n }),
      ];

      insertNullifiersBatch(db, nullifiers);

      const deleted = deleteNullifiersFromBlock(db, 101n);

      expect(deleted).toBe(2);
      expect(nullifierExists(db, nullifiers[0].nullifier)).toBe(true);
      expect(nullifierExists(db, nullifiers[1].nullifier)).toBe(false);
      expect(nullifierExists(db, nullifiers[2].nullifier)).toBe(false);
    });
  });

  describe('Merkle Nodes', () => {
    it('should insert and retrieve merkle node', () => {
      const db = createTestChainDB();
      const node = createTestMerkleNode({ treeId: 0, level: 1, index: 5n });

      insertMerkleNodesBatch(db, [node]);

      const retrieved = getMerkleNode(db, 0, 1, 5n);

      expect(retrieved).toBeDefined();
      expect(retrieved?.hash).toEqual(node.hash);
    });

    it('should batch insert merkle nodes', () => {
      const db = createTestChainDB();
      const nodes = [
        createTestMerkleNode({ level: 0, index: 0n }),
        createTestMerkleNode({ level: 0, index: 1n }),
        createTestMerkleNode({ level: 1, index: 0n }),
      ];

      const count = insertMerkleNodesBatch(db, nodes);

      expect(count).toBe(3);
    });

    it('should get merkle sibling path', () => {
      const db = createTestChainDB();
      const depth = 4;

      // Create a small tree: depth 4, leafIndex 5
      // Path: 5 -> 2 -> 1 -> 0
      // Siblings: 4, 3, 0, 1
      const nodes = [
        // Level 0 (leaves)
        createTestMerkleNode({ level: 0, index: 4n, hash: Buffer.from('04'.repeat(32), 'hex') }),
        createTestMerkleNode({ level: 0, index: 5n, hash: Buffer.from('05'.repeat(32), 'hex') }),
        // Level 1
        createTestMerkleNode({ level: 1, index: 2n, hash: Buffer.from('12'.repeat(32), 'hex') }),
        createTestMerkleNode({ level: 1, index: 3n, hash: Buffer.from('13'.repeat(32), 'hex') }),
        // Level 2
        createTestMerkleNode({ level: 2, index: 0n, hash: Buffer.from('20'.repeat(32), 'hex') }),
        createTestMerkleNode({ level: 2, index: 1n, hash: Buffer.from('21'.repeat(32), 'hex') }),
        // Level 3
        createTestMerkleNode({ level: 3, index: 1n, hash: Buffer.from('31'.repeat(32), 'hex') }),
      ];

      insertMerkleNodesBatch(db, nodes);

      const siblings = getMerkleSiblingPath(db, 0, 5n, depth);

      expect(siblings.length).toBe(depth);
      expect(siblings[0]).toEqual(Buffer.from('04'.repeat(32), 'hex')); // Sibling at level 0
      expect(siblings[1]).toEqual(Buffer.from('13'.repeat(32), 'hex')); // Sibling at level 1
      expect(siblings[2]).toEqual(Buffer.from('20'.repeat(32), 'hex')); // Sibling at level 2
      expect(siblings[3]).toEqual(Buffer.from('31'.repeat(32), 'hex')); // Sibling at level 3
    });
  });

  describe('Commitments', () => {
    it('should insert and query commitments', () => {
      const db = createTestChainDB();
      const commitments = [
        createTestCommitment({ leafIndex: 10n }),
        createTestCommitment({ leafIndex: 11n }),
        createTestCommitment({ leafIndex: 12n }),
      ];

      insertCommitmentsBatch(db, commitments);

      const range = getCommitmentsByLeafRange(db, 0, 10n, 11n);

      expect(range.length).toBe(2);
      expect(range[0].leafIndex).toBe(10n);
      expect(range[1].leafIndex).toBe(11n);
    });

    it('should handle empty batch', () => {
      const db = createTestChainDB();

      const count = insertCommitmentsBatch(db, []);

      expect(count).toBe(0);
    });
  });

  describe('Sync State', () => {
    it('should set and get sync state', () => {
      const db = createTestChainDB();

      updateSyncState(db, 1, 1000n);

      const state = getSyncState(db, 1);

      expect(state).toBeDefined();
      expect(state?.lastBlock).toBe(1000n);
    });

    it('should update existing sync state', () => {
      const db = createTestChainDB();

      updateSyncState(db, 1, 1000n);
      updateSyncState(db, 1, 2000n);

      const state = getSyncState(db, 1);

      expect(state?.lastBlock).toBe(2000n);
    });
  });

  describe('Database Stats', () => {
    it('should return correct stats', () => {
      const db = createTestChainDB();

      insertNullifiersBatch(db, [createTestNullifier(), createTestNullifier()]);
      insertMerkleNodesBatch(db, [createTestMerkleNode()]);
      insertCommitmentsBatch(db, [createTestCommitment()]);

      const stats = getChainDBStats(db);

      expect(stats.nullifiers).toBe(2);
      expect(stats.merkleNodes).toBe(1);
      expect(stats.commitments).toBe(1);
    });
  });
});
