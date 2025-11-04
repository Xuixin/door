import { Injectable, Injector, signal } from '@angular/core';
import { DBAdapter, SchemaDefinition } from '../adapter';
import { AdapterFactory, AdapterConfig } from './adapter-factory';

/**
 * Adapter Provider Service
 * Provides access to the database adapter instance through Angular dependency injection.
 * Manages adapter lifecycle and initialization.
 */
@Injectable({
  providedIn: 'root',
})
export class AdapterProviderService {
  private adapter?: DBAdapter;
  private isInitialized = signal(false);
  private initializationPromise?: Promise<void>;

  constructor(private injector: Injector) {}

  /**
   * Initialize the adapter with schemas
   * @param schemas - Schema definitions for collections
   * @param config - Optional adapter configuration (defaults to rxdb)
   * @param databaseName - Optional database name (if not provided, uses default from environment)
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(
    schemas: SchemaDefinition[],
    config?: AdapterConfig,
    databaseName?: string,
  ): Promise<void> {
    if (this.isInitialized()) {
      console.warn('Adapter already initialized');
      return;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize(
      schemas,
      config,
      databaseName,
    );
    await this.initializationPromise;
  }

  private async _initialize(
    schemas: SchemaDefinition[],
    config?: AdapterConfig,
    databaseName?: string,
  ): Promise<void> {
    try {
      const adapterConfig = config || AdapterFactory.getDefaultConfig();

      console.log(
        'AdapterProviderService: Creating adapter',
        adapterConfig.type,
      );

      this.adapter = await AdapterFactory.create(adapterConfig, this.injector);

      await this.adapter.initialize(schemas, databaseName);

      this.isInitialized.set(true);
      console.log('AdapterProviderService: Initialization complete');
    } catch (error) {
      console.error('AdapterProviderService: Initialization error', error);
      throw error;
    }
  }

  /**
   * Get the database adapter instance
   * @returns DBAdapter instance
   * @throws Error if adapter not initialized
   */
  getAdapter(): DBAdapter {
    if (!this.adapter || !this.isInitialized()) {
      throw new Error(
        'Adapter not initialized. Call initialize() first or wait for APP_INITIALIZER.',
      );
    }
    return this.adapter;
  }

  /**
   * Check if adapter is initialized
   * @returns true if adapter is ready
   */
  isReady(): boolean {
    return this.isInitialized() && this.adapter?.isReady() === true;
  }

  /**
   * Wait for adapter to be ready
   * @param timeout - Maximum time to wait in milliseconds
   * @returns Promise that resolves when adapter is ready
   */
  async waitUntilReady(timeout: number = 5000): Promise<void> {
    if (this.isReady()) {
      return;
    }

    if (this.initializationPromise) {
      await Promise.race([
        this.initializationPromise.then(() => {
          if (this.adapter) {
            return this.adapter.waitUntilReady(timeout);
          }
        }),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error('Adapter initialization timeout')),
            timeout,
          ),
        ),
      ]);
    } else {
      throw new Error('Adapter initialization not started');
    }
  }

  /**
   * Close the adapter and cleanup resources
   */
  async close(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
      this.adapter = undefined;
      this.isInitialized.set(false);
      this.initializationPromise = undefined;
    }
  }
}
