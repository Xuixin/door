import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AdapterProviderService } from '../factory/adapter-provider.service';
import { CollectionAdapter } from '../adapter';
import { CollectionRegistry } from '../config/collection-registry';

/**
 * Base class for all facade services
 * Provides common patterns:
 * - Collection access with proper initialization
 * - Subscription management
 * - Automatic cleanup
 * - Error handling
 */
@Injectable()
export abstract class BaseFacadeService<T = any> implements OnDestroy {
  protected readonly adapterProvider: AdapterProviderService;

  private _initialized = false;
  protected subscriptions: Subscription[] = [];

  constructor(adapterProvider?: AdapterProviderService) {
    // Accept AdapterProviderService as constructor parameter
    // If not provided, try to inject (for backward compatibility)
    // But prefer constructor injection to avoid injection context issues
    this.adapterProvider = adapterProvider ?? inject(AdapterProviderService);
  }

  /**
   * Get the collection name - must be implemented by subclasses
   */
  protected abstract getCollectionName(): string;

  /**
   * Initialize subscriptions - override in subclasses for custom setup
   * Called automatically when adapter is ready
   */
  protected abstract setupSubscriptions(): void;

  /**
   * Optional: Additional cleanup logic
   */
  protected onDestroy?(): void;

  /**
   * Get the collection adapter
   * Returns null if adapter is not ready yet
   * Uses 'any' to allow collections that don't extend BaseDocument (e.g., LogClientDocument)
   */
  protected get collection(): CollectionAdapter<any> | null {
    try {
      if (!this.adapterProvider.isReady()) {
        return null;
      }
      const adapter = this.adapterProvider.getAdapter();
      const collectionName = this.getCollectionName();
      return adapter.getCollection<any>(collectionName);
    } catch (error) {
      console.warn(
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
   * Sets up subscriptions when adapter is ready
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
   * Waits for adapter to be ready before setting up subscriptions
   */
  private initializeSubscriptions(): void {
    this.adapterProvider
      .waitUntilReady()
      .then(() => {
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
      })
      .catch((error) => {
        console.error(
          `❌ Error waiting for adapter in ${this.getCollectionName()}:`,
          error,
        );
      });
  }

  /**
   * Add subscription for automatic cleanup
   */
  protected addSubscription(subscription: Subscription): void {
    this.subscriptions.push(subscription);
  }

  /**
   * Get collection metadata from registry
   */
  protected getCollectionMetadata() {
    const collectionName = this.getCollectionName();
    return CollectionRegistry.getOrThrow(collectionName);
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
