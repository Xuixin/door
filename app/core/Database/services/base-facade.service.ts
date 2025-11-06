import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { RxCollection } from 'rxdb';
import { DatabaseService } from './database.service';
import { COLLECTION_NAME_MAP } from '../replication/constants/replication.constants';

/**
 * Base class for all facade services in newDatabase architecture
 * Provides common patterns:
 * - Direct RxCollection access via DatabaseService
 * - Subscription management
 * - Automatic cleanup
 * - Error handling
 * - Database initialization waiting
 */
@Injectable()
export abstract class BaseFacadeService<T = any> implements OnDestroy {
  protected readonly databaseService: DatabaseService;
  protected subscriptions: Subscription[] = [];
  private _initialized = false;

  constructor(databaseService?: DatabaseService) {
    // Accept DatabaseService as constructor parameter
    // If not provided, try to inject (for backward compatibility)
    this.databaseService = databaseService ?? inject(DatabaseService);
  }

  /**
   * Get the collection name - must be implemented by subclasses
   */
  protected abstract getCollectionName(): string;

  /**
   * Initialize subscriptions - override in subclasses for custom setup
   * Called automatically when database is ready
   */
  protected abstract setupSubscriptions(): void;

  /**
   * Optional: Additional cleanup logic
   */
  protected onDestroy?(): void;

  /**
   * Get the RxCollection from DatabaseService
   * Returns null if database is not initialized yet
   */
  protected get collection(): RxCollection<T> | null {
    try {
      if (!this.databaseService.isInitialized()) {
        return null;
      }
      const db = (this.databaseService as any).db;
      if (!db) {
        return null;
      }

      const collectionName = this.getCollectionName();
      const dbCollectionName =
        COLLECTION_NAME_MAP[collectionName.toLowerCase()];
      if (!dbCollectionName) {
        console.log(
          `Unknown collection name: ${collectionName}, returning null`,
        );
        return null;
      }

      return (db[dbCollectionName] as RxCollection<T>) || null;
    } catch (error) {
      console.log(
        `${this.getCollectionName()} collection not available yet:`,
        error,
      );
      return null;
    }
  }

  /**
   * Check if service is initialized
   */
  protected get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Ensure service is initialized
   * Sets up subscriptions when database is ready
   */
  protected ensureInitialized(): void {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    this.initializeSubscriptions();
  }

  /**
   * Initialize subscriptions with proper async handling
   * Waits for database to be initialized before setting up subscriptions
   */
  private initializeSubscriptions(): void {
    // Wait for database to be ready
    this.waitForDatabase().then(() => {
      const collectionName = this.getCollectionName();
      console.log(`📊 Setting up ${collectionName} subscriptions...`);

      try {
        this.setupSubscriptions();
        console.log(`✅ ${collectionName} subscriptions setup completed`);
      } catch (error) {
        console.error(
          `❌ Error setting up ${collectionName} subscriptions:`,
          error,
        );
      }
    });
  }

  /**
   * Wait for database to be initialized
   */
  private async waitForDatabase(): Promise<void> {
    // Poll until database is initialized (max 30 seconds)
    const maxAttempts = 60;
    const delayMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (this.databaseService.isInitialized()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error(
      `Database initialization timeout after ${maxAttempts * delayMs}ms`,
    );
  }

  /**
   * Add subscription for automatic cleanup
   */
  protected addSubscription(subscription: Subscription): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Cleanup all subscriptions
   */
  ngOnDestroy(): void {
    this.subscriptions.forEach((subscription) => {
      if (subscription && !subscription.closed) {
        subscription.unsubscribe();
      }
    });
    this.subscriptions = [];

    // Call custom cleanup if provided
    if (this.onDestroy) {
      this.onDestroy();
    }
  }
}
