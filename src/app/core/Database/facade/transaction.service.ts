import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { DatabaseService } from '../rxdb.service';
import { TransactionReplicationService } from '../replication';
import { Subscription } from 'rxjs';

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
export class TransactionService implements OnDestroy {
  private readonly databaseService = inject(DatabaseService);
  private readonly replicationService = inject(TransactionReplicationService);
  private dbSubscription?: Subscription;
  private replicationSubscription?: Subscription;

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
    // Setup subscriptions after database is ready
    setTimeout(() => {
      this.setupSubscriptions();
    }, 2000);
  }

  ngOnDestroy() {
    if (this.dbSubscription) {
      this.dbSubscription.unsubscribe();
    }
    if (this.replicationSubscription) {
      this.replicationSubscription.unsubscribe();
    }
  }

  /**
   * Setup database and replication subscriptions
   */
  private setupSubscriptions() {
    try {
      console.log('📊 Setting up transaction subscriptions...');

      // Subscribe to local database changes
      this.dbSubscription = this.databaseService.db.txn.find().$.subscribe({
        next: (txns) => {
          console.log(
            '📊 Local database updated:',
            txns.length,
            'transactions',
          );
          this._transactions.set(txns);
        },
        error: (error) => {
          console.error('❌ Error in database subscription:', error);
        },
      });

      // Subscribe to replication events if available
      if (this.replicationService.replicationState) {
        this.replicationSubscription =
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
      }

      console.log('✅ Transaction subscriptions setup completed');
    } catch (error) {
      console.error('❌ Error setting up subscriptions:', error);
    }
  }

  /**
   * Find all transactions
   */
  async findAll() {
    try {
      const txns = await this.databaseService.db.txn.find().exec();
      this._transactions.set(txns);
      return txns;
    } catch (error) {
      console.error('❌ Error finding all transactions:', error);
      throw error;
    }
  }

  /**
   * Find transaction by ID
   */
  async findById(id: string) {
    try {
      const txn = await this.databaseService.db.txn
        .findOne({ selector: { id } } as any)
        .exec();
      return txn;
    } catch (error) {
      console.error('❌ Error finding transaction by id:', error);
      throw error;
    }
  }

  /**
   * Find transactions by status
   */
  async findByStatus(status: string) {
    try {
      const txns = await this.databaseService.db.txn
        .find({ selector: { status } } as any)
        .exec();
      return txns;
    } catch (error) {
      console.error('❌ Error finding transactions by status:', error);
      throw error;
    }
  }

  /**
   * Create a new transaction
   */
  async create(transaction: any) {
    try {
      const txn = await this.databaseService.db.txn.insert(transaction);
      return txn;
    } catch (error) {
      console.error('❌ Error creating transaction:', error);
      throw error;
    }
  }

  /**
   * Update an existing transaction
   */
  async update(id: string, updates: Partial<any>) {
    try {
      const txn = await this.databaseService.db.txn
        .findOne({ selector: { id } } as any)
        .exec();

      if (txn) {
        await (txn as any).update(updates);
        return txn;
      }
      throw new Error('Transaction not found');
    } catch (error) {
      console.error('❌ Error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Delete a transaction
   */
  async delete(id: string) {
    try {
      const txn = await this.databaseService.db.txn
        .findOne({ selector: { id } } as any)
        .exec();

      if (txn) {
        await (txn as any).remove();
        return true;
      }
      throw new Error('Transaction not found');
    } catch (error) {
      console.error('❌ Error deleting transaction:', error);
      throw error;
    }
  }

  /**
   * Force delete a transaction (permanent removal from database)
   */
  async forceDelete(id: string) {
    try {
      const txn = await this.databaseService.db.txn
        .findOne({ selector: { id } } as any)
        .exec();

      if (txn) {
        await (txn as any).remove();
        return true;
      }
      throw new Error('Transaction not found');
    } catch (error) {
      console.error('❌ Error force deleting transaction:', error);
      throw error;
    }
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
    try {
      console.log('🔄 Manually refreshing transactions...');
      const txns = await this.databaseService.db.txn.find().exec();
      this._transactions.set(txns);
      console.log('✅ Manually refreshed transactions:', txns.length);
      return txns;
    } catch (error) {
      console.error('❌ Error refreshing transactions:', error);
      throw error;
    }
  }
}
