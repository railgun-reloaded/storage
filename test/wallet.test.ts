import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTestWalletDB,
  createTestWallet,
  createTestNote,
  resetTestCounters,
} from './setup';
import {
  createWallet,
  getWallet,
  listWallets,
  deleteWallet,
  insertNote,
  insertNotesBatch,
  getUnspentNotes,
  getUnspentNotesByToken,
  getNoteByCommitment,
  markNoteSpent,
  markNotesSpentBatch,
  recalculateBalance,
  getBalance,
  getAllBalances,
  recalculateAllBalances,
  updateScanState,
  getScanState,
  insertTxHistory,
  getTxHistory,
  getWalletDBStats,
} from '../src/wallet/index';

describe('Wallet Database', () => {
  beforeEach(() => {
    resetTestCounters();
  });

  describe('Wallets', () => {
    it('should create and retrieve wallet', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();

      createWallet(db, wallet);

      const retrieved = getWallet(db, wallet.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(wallet.id);
      expect(retrieved?.name).toBe(wallet.name);
    });

    it('should list all wallets', () => {
      const db = createTestWalletDB();
      const wallet1 = createTestWallet();
      const wallet2 = createTestWallet();

      createWallet(db, wallet1);
      createWallet(db, wallet2);

      const wallets = listWallets(db);

      expect(wallets.length).toBe(2);
    });

    it('should delete wallet', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();

      createWallet(db, wallet);

      const deleted = deleteWallet(db, wallet.id);

      expect(deleted).toBe(1);
      expect(getWallet(db, wallet.id)).toBeUndefined();
    });
  });

  describe('Notes', () => {
    it('should insert and retrieve note', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const note = createTestNote({ walletId: wallet.id });

      createWallet(db, wallet);
      insertNote(db, note);

      const retrieved = getNoteByCommitment(db, note.commitment);

      expect(retrieved).toBeDefined();
      expect(retrieved?.commitment).toBe(note.commitment);
      expect(retrieved?.amount).toBe(note.amount);
    });

    it('should batch insert notes', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const notes = [
        createTestNote({ walletId: wallet.id }),
        createTestNote({ walletId: wallet.id }),
        createTestNote({ walletId: wallet.id }),
      ];

      createWallet(db, wallet);
      const count = insertNotesBatch(db, notes);

      expect(count).toBe(3);
    });

    it('should get unspent notes', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const notes = [
        createTestNote({ walletId: wallet.id, spent: false }),
        createTestNote({ walletId: wallet.id, spent: false }),
        createTestNote({ walletId: wallet.id, spent: true }),
      ];

      createWallet(db, wallet);
      insertNotesBatch(db, notes);

      const unspent = getUnspentNotes(db, wallet.id);

      expect(unspent.length).toBe(2);
      expect(unspent.every((n) => !n.spent)).toBe(true);
    });

    it('should get unspent notes by token', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const ethToken = '0x0000000000000000000000000000000000000000';
      const daiToken = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const notes = [
        createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
        createTestNote({ walletId: wallet.id, token: ethToken, spent: false }),
        createTestNote({ walletId: wallet.id, token: daiToken, spent: false }),
      ];

      createWallet(db, wallet);
      insertNotesBatch(db, notes);

      const ethNotes = getUnspentNotesByToken(db, wallet.id, ethToken);

      expect(ethNotes.length).toBe(2);
      expect(ethNotes.every((n) => n.token === ethToken)).toBe(true);
    });

    it('should mark note as spent', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const note = createTestNote({ walletId: wallet.id, spent: false });
      const spentTxid = '0xspent123';

      createWallet(db, wallet);
      insertNote(db, note);

      markNoteSpent(db, note.commitment, spentTxid);

      const retrieved = getNoteByCommitment(db, note.commitment);

      expect(retrieved?.spent).toBe(true);
      expect(retrieved?.spentTxid).toBe(spentTxid);
    });

    it('should batch mark notes as spent', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const notes = [
        createTestNote({ walletId: wallet.id, spent: false }),
        createTestNote({ walletId: wallet.id, spent: false }),
      ];
      const commitments = notes.map((n) => n.commitment);
      const spentTxid = '0xspent456';

      createWallet(db, wallet);
      insertNotesBatch(db, notes);

      const count = markNotesSpentBatch(db, commitments, spentTxid);

      expect(count).toBe(2);
      const unspent = getUnspentNotes(db, wallet.id);
      expect(unspent.length).toBe(0);
    });
  });

  describe('Balances', () => {
    it('should recalculate balance from notes', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const token = '0x0000000000000000000000000000000000000000';
      const notes = [
        createTestNote({ walletId: wallet.id, token, amount: 100n, spent: false }),
        createTestNote({ walletId: wallet.id, token, amount: 200n, spent: false }),
        createTestNote({ walletId: wallet.id, token, amount: 300n, spent: true }),
      ];

      createWallet(db, wallet);
      insertNotesBatch(db, notes);

      const balance = recalculateBalance(db, wallet.id, token);

      expect(balance).toBe(300n); // 100 + 200, spent note excluded

      const retrieved = getBalance(db, wallet.id, token);
      expect(retrieved?.amount).toBe(300n);
    });

    it('should recalculate all balances', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const ethToken = '0x0000000000000000000000000000000000000000';
      const daiToken = '0x6B175474E89094C44Da98b954EedeAC495271d0F';

      const notes = [
        createTestNote({ walletId: wallet.id, token: ethToken, amount: 100n, spent: false }),
        createTestNote({ walletId: wallet.id, token: ethToken, amount: 200n, spent: false }),
        createTestNote({ walletId: wallet.id, token: daiToken, amount: 500n, spent: false }),
      ];

      createWallet(db, wallet);
      insertNotesBatch(db, notes);

      recalculateAllBalances(db, wallet.id);

      const balances = getAllBalances(db, wallet.id);

      expect(balances.length).toBe(2);
      const ethBalance = balances.find((b) => b.token === ethToken);
      const daiBalance = balances.find((b) => b.token === daiToken);

      expect(ethBalance?.amount).toBe(300n);
      expect(daiBalance?.amount).toBe(500n);
    });

    it('should handle zero balance', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const token = '0x0000000000000000000000000000000000000000';

      createWallet(db, wallet);

      const balance = recalculateBalance(db, wallet.id, token);

      expect(balance).toBe(0n);
    });
  });

  describe('Scan State', () => {
    it('should set and get scan state', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const chainId = 1;

      createWallet(db, wallet);
      updateScanState(db, wallet.id, chainId, 1000n);

      const state = getScanState(db, wallet.id, chainId);

      expect(state).toBeDefined();
      expect(state?.lastScannedBlock).toBe(1000n);
    });

    it('should update existing scan state', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const chainId = 1;

      createWallet(db, wallet);
      updateScanState(db, wallet.id, chainId, 1000n);
      updateScanState(db, wallet.id, chainId, 2000n);

      const state = getScanState(db, wallet.id, chainId);

      expect(state?.lastScannedBlock).toBe(2000n);
    });

    it('should support multi-chain scan state', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();

      createWallet(db, wallet);
      updateScanState(db, wallet.id, 1, 1000n); // Ethereum
      updateScanState(db, wallet.id, 137, 5000n); // Polygon

      const ethState = getScanState(db, wallet.id, 1);
      const polyState = getScanState(db, wallet.id, 137);

      expect(ethState?.lastScannedBlock).toBe(1000n);
      expect(polyState?.lastScannedBlock).toBe(5000n);
    });
  });

  describe('Transaction History', () => {
    it('should insert and retrieve transaction history', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const tx = {
        id: 'tx-1',
        walletId: wallet.id,
        type: 'shield' as const,
        txid: '0xtx123',
        blockNumber: 1000n,
        timestamp: new Date(),
      };

      createWallet(db, wallet);
      insertTxHistory(db, tx);

      const history = getTxHistory(db, wallet.id);

      expect(history.length).toBe(1);
      expect(history[0].id).toBe(tx.id);
      expect(history[0].type).toBe('shield');
    });

    it('should return transactions in descending order', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const txs = [
        {
          id: 'tx-1',
          walletId: wallet.id,
          type: 'shield' as const,
          txid: '0xtx1',
          blockNumber: 1000n,
          timestamp: new Date(),
        },
        {
          id: 'tx-2',
          walletId: wallet.id,
          type: 'transfer' as const,
          txid: '0xtx2',
          blockNumber: 2000n,
          timestamp: new Date(),
        },
        {
          id: 'tx-3',
          walletId: wallet.id,
          type: 'unshield' as const,
          txid: '0xtx3',
          blockNumber: 3000n,
          timestamp: new Date(),
        },
      ];

      createWallet(db, wallet);
      for (const tx of txs) {
        insertTxHistory(db, tx);
      }

      const history = getTxHistory(db, wallet.id);

      expect(history.length).toBe(3);
      expect(history[0].blockNumber).toBe(3000n); // Most recent first
      expect(history[1].blockNumber).toBe(2000n);
      expect(history[2].blockNumber).toBe(1000n);
    });
  });

  describe('Database Stats', () => {
    it('should return correct stats', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const notes = [
        createTestNote({ walletId: wallet.id, spent: false }),
        createTestNote({ walletId: wallet.id, spent: false }),
        createTestNote({ walletId: wallet.id, spent: true }),
      ];

      createWallet(db, wallet);
      insertNotesBatch(db, notes);
      recalculateAllBalances(db, wallet.id);

      const stats = getWalletDBStats(db, wallet.id);

      expect(stats.notes).toBe(3);
      expect(stats.unspentNotes).toBe(2);
      expect(stats.balances).toBe(1); // All notes same token
    });
  });

  describe('Cascade Delete', () => {
    it('should cascade delete wallet data', () => {
      const db = createTestWalletDB();
      const wallet = createTestWallet();
      const note = createTestNote({ walletId: wallet.id });

      createWallet(db, wallet);
      insertNote(db, note);
      recalculateAllBalances(db, wallet.id);

      deleteWallet(db, wallet.id);

      expect(getWallet(db, wallet.id)).toBeUndefined();
      expect(getNoteByCommitment(db, note.commitment)).toBeUndefined();
      expect(getAllBalances(db, wallet.id).length).toBe(0);
    });
  });
});
