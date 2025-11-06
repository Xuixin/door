import { Injectable, signal, computed, inject } from '@angular/core';
import { RxCollection } from 'rxdb';
import { BaseFacadeService } from '../../services/base-facade.service';
import { ReplicationStateMonitorService } from '../../replication/services/replication-state-monitor.service';

export interface TransactionStats {
  total: number;
  pending: number;
  in: number;
  out: number;
}

/**
 * Transaction Service
 * Manages transaction data and replication sync using newDatabase architecture
 */
@Injectable({
  providedIn: 'root',
})
export class TransactionService extends BaseFacadeService<any> {
  private readonly replicationMonitor = inject(ReplicationStateMonitorService);

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
    // Initialize subscriptions when database is ready
    this.ensureInitialized();
  }

  protected getCollectionName(): string {
    return 'transaction';
  }

  /**
   * Setup database and replication subscriptions
   */
  protected setupSubscriptions(): void {
    const collection = this.collection;
    if (!collection) {
      console.log('Transaction collection not available yet');
      return;
    }

    // Load initial data immediately
    this.findAll().catch((error) => {
      console.error('❌ Error loading initial transactions:', error);
    });

    // Subscribe to local database changes using RxCollection
    const dbSubscription = collection.find().$.subscribe({
      next: (txns: any[]) => {
        console.log('📊 Local database updated:', txns.length, 'transactions');
        // Filter out deleted documents
        const activeTxns = txns.filter((doc: any) => !(doc as any)._deleted);
        this._transactions.set(activeTxns as any[]);
      },
      error: (error: any) => {
        console.error('❌ Error in database subscription:', error);
      },
    });
    this.addSubscription(dbSubscription);

    // Subscribe to replication events if available
    try {
      const replicationReceived$ =
        this.replicationMonitor.getCollectionReplicationReceived$(
          'transaction',
        );
      if (replicationReceived$) {
        const replicationSubscription = replicationReceived$.subscribe({
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
    } catch (error) {
      console.log('⚠️ Could not subscribe to replication events:', error);
    }
  }

  /**
   * Find all transactions
   */
  async findAll() {
    const collection = this.collection;
    if (!collection) {
      console.log(
        '⚠️ Transaction collection not available, returning empty array',
      );
      return [];
    }
    try {
      const txns = await collection.find().exec();
      // Filter out deleted documents
      const activeTxns = txns.filter((doc) => !(doc as any)._deleted);
      this._transactions.set(activeTxns as any[]);
      return activeTxns as any[];
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
      console.log('⚠️ Transaction collection not available');
      return null;
    }
    try {
      const txn = await collection.findOne(id).exec();
      if (txn && !(txn as any)._deleted) {
        return txn as any;
      }
      return null;
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
      console.log('⚠️ Transaction collection not available');
      return [];
    }
    try {
      const txns = await collection
        .find({
          selector: { status } as any,
        })
        .exec();
      // Filter out deleted documents
      return txns.filter((doc) => !(doc as any)._deleted) as any[];
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
    const txn = await collection.findOne(id).exec();
    if (!txn) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    await txn.update(updates);
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
    const txn = await collection.findOne(id).exec();
    if (!txn) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    await txn.remove();
    return txn;
  }

  /**
   * Force delete a transaction (permanent removal from database)
   */
  async forceDelete(id: string) {
    const collection = this.collection;
    if (!collection) {
      throw new Error('Transaction collection not available');
    }
    const txn = await collection.findOne(id).exec();
    if (!txn) {
      throw new Error(`Transaction with id ${id} not found`);
    }
    await txn.remove();
    return txn;
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
    const txns = await collection.find().exec();
    // Filter out deleted documents
    const activeTxns = txns.filter((doc) => !(doc as any)._deleted);
    this._transactions.set(activeTxns as any[]);
    console.log('✅ Manually refreshed transactions:', activeTxns.length);
    return activeTxns as any[];
  }
}
