import { Injectable, inject } from '@angular/core';
import { createRxDatabase, RxDatabase, RxCollection } from 'rxdb';
import { environment } from 'src/environments/environment';
import { ClientIdentityService } from './../../../services/client-identity.service';
import { TXN_SCHEMA } from '../collection/txn/schema';
import { DEVICE_MONITORING_SCHEMA } from '../collection/device-monitoring/schema';
import { DEVICE_MONITORING_HISTORY_SCHEMA } from '../collection/device-monitoring-history/schema';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { DEVICE_EVENT_SCHEMA } from '../collection/device-event/schema';
import { ReplicationManagerService } from '../replication';

interface DatabaseCollections {
  transaction: RxCollection;
  devicemonitoring: RxCollection;
  devicemonitoringhistory: RxCollection;
  device_event: RxCollection;
}

environment.addRxDBPlugins();

@Injectable({
  providedIn: 'root',
})
export class DatabaseService {
  private db: RxDatabase<DatabaseCollections> | null = null;
  private readonly identity = inject(ClientIdentityService);
  private readonly replicationManager = inject(ReplicationManagerService);
  private _initializing = false; // Prevent concurrent initialization
  private _initializationPromise: Promise<void> | null = null; // Track ongoing initialization

  // Event emitter for primary recovery
  private primaryRecoveryListeners: Set<() => void | Promise<void>> = new Set();

  /**
   * Set replication monitor service (called after initialization to avoid circular dependency)
   * Delegates to ReplicationManagerService
   */
  setReplicationMonitorService(monitorService: any): void {
    this.replicationManager.setReplicationMonitorService(monitorService);
  }

  /**
   * Initialize database and collections
   * Will skip if clientId is not available yet (waits for device-selection-modal)
   * Prevents duplicate initialization on refresh
   */
  async initializeDatabase(): Promise<void> {
    // If already initialized, return immediately
    if (this.db) {
      console.log('✅ [NewDatabase] Database already initialized');
      return;
    }

    // If currently initializing, wait for existing initialization to complete
    if (this._initializing && this._initializationPromise) {
      console.log(
        '⏳ [NewDatabase] Database initialization in progress, waiting...',
      );
      await this._initializationPromise;
      return;
    }

    // Start initialization
    this._initializing = true;
    this._initializationPromise = this._doInitialize();

    try {
      await this._initializationPromise;
    } finally {
      this._initializing = false;
      this._initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _doInitialize(): Promise<void> {
    // Double-check after waiting
    if (this.db) {
      console.log('✅ [NewDatabase] Database already initialized (after wait)');
      return;
    }

    // Get client ID for database name
    let clientId = await this.identity.getClientId();
    if (!clientId) {
      console.log(
        '⏸️ [NewDatabase] Client ID not available yet. Waiting for device selection...',
      );
      return; // Skip initialization - will be called again after device selection
    }

    const clientType = await this.identity.getClientTypeStored();
    const databaseName = `${clientType}-${clientId}`;
    console.log(`💾 [NewDatabase] Database name: ${databaseName}`);

    try {
      // Create RxDB database
      // RxDB will automatically handle existing databases - it won't overwrite
      this.db = await createRxDatabase<DatabaseCollections>({
        name: databaseName,
        storage: environment.getRxStorage(),
        multiInstance: environment.multiInstance || false,
      });

      // Check if collections already exist
      const existingCollections = Object.keys(this.db.collections);
      if (existingCollections.length > 0) {
        console.log(
          `✅ [NewDatabase] Database exists with collections: ${existingCollections.join(', ')}`,
        );
      } else {
        // Add collections only if they don't exist
        // RxDB will throw error if collection already exists, so we catch it
        try {
          await this.db.addCollections({
            transaction: {
              schema: TXN_SCHEMA as any,
            },
            devicemonitoring: {
              schema: DEVICE_MONITORING_SCHEMA as any,
            },
            devicemonitoringhistory: {
              schema: DEVICE_MONITORING_HISTORY_SCHEMA as any,
            },
            device_event: {
              schema: DEVICE_EVENT_SCHEMA as any,
            },
          });
          console.log('✅ [NewDatabase] Collections added to database');
        } catch (colError: any) {
          // Collection might already exist (e.g., from previous initialization)
          // Check if collections were actually added
          const collectionsAfter = Object.keys(this.db.collections);
          if (collectionsAfter.length > 0) {
            console.log(
              `✅ [NewDatabase] Collections already exist: ${collectionsAfter.join(', ')}`,
            );
          } else {
            // Re-throw if collections were not added
            console.error(
              '❌ [NewDatabase] Failed to add collections:',
              colError.message,
            );
            throw colError;
          }
        }
      }

      console.log('✅ [NewDatabase] Database and collections initialized');

      // Initialize replications using ReplicationManagerService
      // Check server availability first
      const primaryAvailable = await this.checkConnection(environment.apiUrl);
      let useSecondary = false;

      if (!primaryAvailable) {
        // Check secondary server availability
        const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
        const secondaryAvailable = await this.checkConnection(secondaryUrl);

        if (!secondaryAvailable) {
          console.error(
            '❌ [NewDatabase] Both primary and secondary servers are unavailable!',
          );
          throw new Error(
            'Cannot connect to any GraphQL server. Please check server availability.',
          );
        }

        useSecondary = true;
        // Set global flag for other services to use
        (window as any).__USE_SECONDARY_SERVER__ = true;
      } else {
        // Primary is available, clear the flag
        (window as any).__USE_SECONDARY_SERVER__ = false;
      }

      const serverId =
        (await this.identity.getClientId()) || environment.serverId;

      // Initialize replications using ReplicationManagerService
      await this.replicationManager.initializeReplications(
        this.db,
        useSecondary,
        serverId,
        () => this.emitPrimaryRecoveryEvent(),
      );
    } catch (error: any) {
      console.error(
        '❌ [NewDatabase] Error during database initialization:',
        error,
      );
      // Reset state on error so it can be retried
      this.db = null;
      throw error;
    }
  }

  /**
   * Check connection to GraphQL server
   */
  private async checkConnection(url: string): Promise<boolean> {
    try {
      console.log(`🔍 [NewDatabase] Checking connection to server: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // timeout 5 วินาที

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: '{ __typename }', // Simple introspection query
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        console.log(
          `✅ [NewDatabase] Connection to GraphQL server successful: ${url}`,
        );
        return true;
      } else {
        console.warn(
          `⚠️ [NewDatabase] GraphQL server responded with error: ${response.status} (${url})`,
        );
        return false;
      }
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Get database instance
   */
  getDatabase(): RxDatabase<DatabaseCollections> | null {
    return this.db;
  }

  /**
   * Get collection by name
   */
  getCollection(name: keyof DatabaseCollections): RxCollection | null {
    return this.db?.collections[name] || null;
  }

  /**
   * Get replication state by identifier
   * Delegates to ReplicationManagerService
   */
  getReplicationState(
    identifier: string,
  ): RxGraphQLReplicationState<any, any> | null {
    return this.replicationManager.getReplicationState(identifier);
  }

  /**
   * Get all replication states
   * Delegates to ReplicationManagerService
   */
  getAllReplicationStates(): Map<string, RxGraphQLReplicationState<any, any>> {
    return this.replicationManager.getAllReplicationStates();
  }

  /**
   * Switch all replications from primary to secondary
   * Delegates to ReplicationManagerService
   */
  async switchToSecondary(): Promise<void> {
    return this.replicationManager.switchToSecondary();
  }

  /**
   * Switch all replications from secondary back to primary
   * Delegates to ReplicationManagerService
   */
  async switchToPrimary(): Promise<void> {
    return this.replicationManager.switchToPrimary();
  }

  /**
   * Check if database is initialized
   */
  isInitialized(): boolean {
    return this.db !== null;
  }

  /**
   * Stop all replications (for cleanup on app destroy)
   * Delegates to ReplicationManagerService
   */
  async stopReplication(): Promise<void> {
    return this.replicationManager.stopReplication();
  }

  /**
   * Reinitialize replications (public method for reconnecting after offline)
   * Checks server availability and starts appropriate replications
   * Delegates to ReplicationManagerService
   */
  async reinitializeReplications(): Promise<void> {
    if (!this.db) {
      throw new Error('Database must be initialized first');
    }

    const serverId =
      (await this.identity.getClientId()) || environment.serverId;

    return this.replicationManager.reinitializeReplications(
      this.db,
      (url: string) => this.checkConnection(url),
      serverId,
      () => this.emitPrimaryRecoveryEvent(),
    );
  }

  /**
   * Subscribe to primary recovery events
   * Called when primary server is detected as ONLINE while using secondary
   */
  onPrimaryRecovery(callback: () => void | Promise<void>): () => void {
    this.primaryRecoveryListeners.add(callback);
    // Return unsubscribe function
    return () => {
      this.primaryRecoveryListeners.delete(callback);
    };
  }

  /**
   * Emit primary recovery event
   * All registered listeners will be called
   */
  private async emitPrimaryRecoveryEvent(): Promise<void> {
    console.log(
      `📢 [DatabaseService] Emitting primary recovery event to ${this.primaryRecoveryListeners.size} listener(s)`,
    );

    const promises = Array.from(this.primaryRecoveryListeners).map((callback) =>
      Promise.resolve(callback()),
    );

    await Promise.all(promises);
    console.log('✅ [DatabaseService] Primary recovery event handled');
  }
}
