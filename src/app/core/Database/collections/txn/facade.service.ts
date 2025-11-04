import { Injectable, signal, computed, inject } from '@angular/core';
import { TransactionReplicationService } from './replication.service';
import { BaseFacadeService } from '../../core/base/base-facade.service';
import { COLLECTION_NAMES } from '../../core/config/collection-registry';

export interface TransactionStats {
  total: number;
  pending: number;
  in: number;
  out: number;
}

/**
 * Transaction Service
 * Manages transaction data and replication sync
 */
@Injectable({
  providedIn: 'root',
})
export class TransactionService extends BaseFacadeService<any> {
  private readonly replicationService = inject(TransactionReplicationService);

  // Signals for reactive data
  private _transactions = signal<any[]>([]);
  public readonly transactions = this._transactions.asReadonly();

  // Computed signals for statistics
  public readonly stats = computed<TransactionStats>(() => {
    const txns = this._transactions();
    return {
      total: txns.length,
      pending: txns.filter((t: any) => t.status === 'PENDING').length,
      in: txns.filter((t: any) => t.status === 'IN').length,
      out: txns.filter((t: any) => t.status === 'OUT').length,
    };
  });

  // Computed signal for recent transactions (last 5)
  public readonly recentTransactions = computed(() => {
    return this._transactions().slice(0, 5);
  });

  constructor() {
    super();
    // Initialize subscriptions when adapter is ready
    this.ensureInitialized();
  }

  protected getCollectionName(): string {
    return COLLECTION_NAMES.TXN;
  }

  /**
   * Setup database and replication subscriptions
   */
  protected setupSubscriptions(): void {
    const collection = this.collection;
    if (!collection) {
      console.warn('Transaction collection not available yet');
      return;
    }

    // Load initial data immediately
    this.findAll().catch((error) => {
      console.error('❌ Error loading initial transactions:', error);
    });

    // Subscribe to local database changes using adapter
    const dbSubscription = collection.find$().subscribe({
      next: (txns) => {
        console.log('📊 Local database updated:', txns.length, 'transactions');
        this._transactions.set(txns as any[]);
      },
      error: (error) => {
        console.error('❌ Error in database subscription:', error);
      },
    });
    this.addSubscription(dbSubscription);

    // Subscribe to replication events if available
    if (this.replicationService.replicationState) {
      const replicationSubscription =
        this.replicationService.replicationState.received$.subscribe({
          next: (received) => {
            console.log('🔄 Replication received:', received);
            // Refresh transactions when replication receives data
            this.refreshTransactions();
          },
          error: (error) => {
            console.error('❌ Error in replication subscription:', error);
          },
        });
      this.addSubscription(replicationSubscription);
    }
  }

  /**
   * Find all transactions
   */
  async findAll() {
    const collection = this.collection;
    if (!collection) {
      console.warn(
        '⚠️ Transaction collection not available, returning empty array',
      );
      return [];
    }
    try {
      const txns = await collection.find();
      this._transactions.set(txns as any[]);
      return txns as any[];
    } catch (error) {
      console.error('❌ Error finding transactions:', error);
      return [];
    }
  }

  /**
   * Find transaction by ID
   */
  async findById(id: string) {
    const collection = this.collection;
    if (!collection) {
      console.warn('⚠️ Transaction collection not available');
      return null;
    }
    try {
      const txn = await collection.findOne(id);
      return txn as any;
    } catch (error) {
      console.error('❌ Error finding transaction by ID:', error);
      return null;
    }
  }

  /**
   * Find transactions by status
   */
  async findByStatus(status: string) {
    const collection = this.collection;
    if (!collection) {
      console.warn('⚠️ Transaction collection not available');
      return [];
    }
    try {
      const txns = await collection.find({ status } as any);
      return txns as any[];
    } catch (error) {
      console.error('❌ Error finding transactions by status:', error);
      return [];
    }
  }

  /**
   * Create a new transaction
   */
  async create(transaction: any) {
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const txn = await collection.insert(transaction);
    return txn as any;
  }

  /**
   * Update an existing transaction
   */
  async update(id: string, updates: Partial<any>) {
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const txn = await collection.update(id, updates);
    return txn as any;
  }

  /**
   * Delete a transaction
   */
  async delete(id: string) {
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const deleted = await collection.delete(id, false); // Soft delete
    return deleted;
  }

  /**
   * Force delete a transaction (permanent removal from database)
   */
  async forceDelete(id: string) {
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const deleted = await collection.delete(id, true); // Hard delete
    return deleted;
  }

  /**
   * Get transactions by status (computed signal version)
   */
  getTransactionsByStatus(status: string) {
    return computed(() =>
      this._transactions().filter((t: any) => t.status === status),
    );
  }

  /**
   * Manually refresh transactions
   */
  async refreshTransactions() {
    console.log('🔄 Manually refreshing transactions...');
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const txns = await collection.find();
    this._transactions.set(txns as any[]);
    console.log('✅ Manually refreshed transactions:', txns.length);
    return txns as any[];
  }
}
