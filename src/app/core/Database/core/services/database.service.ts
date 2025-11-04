import { Injector, Injectable } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { TransactionReplicationService } from '../../collections/txn';
import { DeviceMonitoringReplicationService } from '../../collections/device-monitoring';
import { DeviceMonitoringHistoryReplicationService } from '../../collections/device-monitoring-history';
import { NetworkStatusService } from './network-status.service';
import { ClientIdentityService } from '../../../identity/client-identity.service';
import { AdapterProviderService } from '../factory';
import {
  RxDBAdapter,
  getAdapterSchemas,
  setupDebugRxDB,
} from '../adapters/rxdb';
import { RxTxnsDatabase } from '../types/database.types';
import { CollectionRegistry } from '../config/collection-registry';

let GLOBAL_DB_SERVICE: DatabaseService | undefined;
let initState: null | Promise<any> = null;
let DB_INSTANCE: RxTxnsDatabase;

/**
 * Replication service configuration
 */
interface ReplicationServiceConfig {
  collectionName: string;
  service: any;
  collectionKey: keyof RxTxnsDatabase['collections'];
  replicationId: string;
}

/**
 * Initialize replication services using collection registry
 * Returns array of service configs for parallel registration
 * Uses Angular Injector to properly create services with dependency injection
 */
function initializeReplicationServices(
  injector: Injector,
  networkStatusService: NetworkStatusService,
  identityService: ClientIdentityService,
): ReplicationServiceConfig[] {
  const configs: ReplicationServiceConfig[] = [];

  // Get all collections from registry
  const collections = CollectionRegistry.getAll();

  for (const metadata of collections) {
    let service: any;

    // Create appropriate replication service based on collection name
    // Use Injector.create() to properly handle dependency injection
    switch (metadata.collectionName) {
      case 'txn':
        service = injector.get(TransactionReplicationService);
        break;
      case 'device_monitoring':
        service = injector.get(DeviceMonitoringReplicationService);
        break;
      case 'device_monitoring_history':
        service = injector.get(DeviceMonitoringHistoryReplicationService);
        break;
      default:
        console.warn(
          `No replication service factory for collection: ${metadata.collectionName}`,
        );
        continue;
    }

    configs.push({
      collectionName: metadata.collectionName,
      service,
      collectionKey: metadata.collectionKey,
      replicationId: metadata.replicationId,
    });
  }

  return configs;
}

/**
 * Register replication service and return result
 */
async function registerReplication(
  config: ReplicationServiceConfig,
  dbInstance: RxTxnsDatabase,
): Promise<{ collectionName: string; success: boolean }> {
  try {
    const collection = dbInstance.collections[config.collectionKey];
    const replication = await config.service.register_replication(
      collection as any,
      config.replicationId,
    );
    return { collectionName: config.collectionName, success: !!replication };
  } catch (error) {
    console.error(
      `Error registering ${config.collectionName} replication:`,
      error,
    );
    return { collectionName: config.collectionName, success: false };
  }
}

/**
 * Set replication services in DatabaseService
 * Uses collection registry to map services to collection names
 */
function setReplicationServices(configs: ReplicationServiceConfig[]) {
  const dbService = GLOBAL_DB_SERVICE;
  if (!dbService) {
    console.error('❌ GLOBAL_DB_SERVICE is not initialized');
    return;
  }

  // Use registry to map collection names to setter methods
  configs.forEach((config) => {
    const metadata = CollectionRegistry.get(config.collectionName);
    if (!metadata) {
      console.warn(`Collection ${config.collectionName} not found in registry`);
      return;
    }

    // Map collection names to actual setter method names
    // Handle special cases where method names don't match serviceName pattern
    let methodName: keyof DatabaseService;
    switch (config.collectionName) {
      case 'txn':
        methodName = 'setReplicationService';
        break;
      case 'device_monitoring':
        methodName = 'setDeviceMonitoringReplicationService';
        break;
      case 'device_monitoring_history':
        methodName = 'setDeviceMonitoringHistoryReplicationService';
        break;
      default:
        // Fallback to dynamic method name based on service name
        methodName =
          `set${metadata.serviceName}ReplicationService` as keyof DatabaseService;
    }

    const method = dbService[methodName] as any;
    if (method && typeof method === 'function') {
      try {
        method.call(dbService, config.service);
      } catch (error) {
        console.error(
          `Error calling setter method ${String(methodName)} for collection ${config.collectionName}:`,
          error,
        );
      }
    } else {
      console.warn(
        `Setter method ${String(methodName)} not found for collection ${config.collectionName}`,
      );
      // Fallback: use setReplicationServiceByCollection directly
      if (
        GLOBAL_DB_SERVICE &&
        GLOBAL_DB_SERVICE.setReplicationServiceByCollection
      ) {
        GLOBAL_DB_SERVICE.setReplicationServiceByCollection(
          config.collectionName,
          config.service,
        );
      }
    }
  });
}

/**
 * Add timeout wrapper for async operations
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
        timeoutMs,
      ),
    ),
  ]);
}

/**
 * Initialize the database using the adapter pattern
 * This function sets up the database adapter and replication services
 * Designed to be resilient: app will boot even if initialization fails
 */
export async function initDatabase(injector: Injector): Promise<void> {
  if (!injector) {
    console.error('❌ initDatabase() injector missing');
    return;
  }

  // Prevent duplicate initialization
  if (initState) {
    console.log('⚠️ Database already initializing, waiting for completion...');
    try {
      await initState;
    } catch (error) {
      console.error('❌ Previous initialization failed:', error);
    }
    return;
  }

  // Create initialization promise with error handling
  initState = (async () => {
    try {
      const identityService = injector.get(ClientIdentityService);
      const adapterProvider = injector.get(
        AdapterProviderService,
      ) as AdapterProviderService;

      // Check if client ID exists, if not show device selection modal
      let clientId = await identityService.getClientId();
      let databaseName: string | undefined;

      if (!clientId) {
        // No client ID - need to select device
        console.log('📱 No client ID found, showing device selection modal...');

        // Get ModalController from injector
        const { ModalController } = await import('@ionic/angular');
        const modalController = injector.get(ModalController);

        // Get device API service
        const { DeviceApiService } = await import(
          '../../../api/graphql/device-api.service'
        );
        const deviceApiService = injector.get(DeviceApiService);

        // Get client type from environment
        const clientType = identityService.getClientType();

        try {
          // Show device selection modal
          const { DeviceSelectionModalComponent } = await import(
            '../../../../components/device-selection-modal/device-selection-modal.component'
          );

          const modal = await modalController.create({
            component: DeviceSelectionModalComponent,
            backdropDismiss: false,
            cssClass: 'device-selection-modal',
          });

          await modal.present();
          const result = await modal.onDidDismiss();

          if (!result.data || !result.data.id) {
            throw new Error(
              'Device selection was cancelled. Internet connection is required to select a device.',
            );
          }

          const selectedDevice = result.data;
          console.log('✅ Device selected:', selectedDevice);

          // Device should already be saved by the modal component
          // Verify it was saved
          clientId = await identityService.getClientId();
          if (!clientId) {
            throw new Error('Failed to save device information');
          }
        } catch (modalError: any) {
          console.error('❌ Device selection error:', modalError);
          throw new Error(
            modalError.message ||
              'Failed to select device. Internet connection is required.',
          );
        }
      }

      // Generate database name from client ID and type
      const clientType = await identityService.getClientTypeStored();
      databaseName = RxDBAdapter.generateDatabaseName(clientId!, clientType);
      console.log(`💾 Database name: ${databaseName}`);

      // Initialize adapter with schemas (with timeout)
      const schemas = getAdapterSchemas();
      const adapterConfig = {
        type: (environment.adapterType || 'rxdb') as any,
      };

      try {
        await withTimeout(
          adapterProvider.initialize(schemas, adapterConfig, databaseName),
          10000, // 10 second timeout for database initialization
          'Database adapter initialization',
        );

        // For backward compatibility, get the RxDB instance from RxDBAdapter
        const adapter = adapterProvider.getAdapter();
        if (adapter instanceof RxDBAdapter) {
          DB_INSTANCE = adapter.getRxDB();
        } else {
          console.error('❌ Expected RxDBAdapter for backward compatibility');
          return;
        }

        // Setup debug helper
        setupDebugRxDB(DB_INSTANCE, GLOBAL_DB_SERVICE);
        console.log('✅ Database initialized successfully');
      } catch (error: any) {
        console.error('❌ Database adapter initialization failed:', error);
        // Throw error - device selection is required, cannot continue without database
        throw error;
      }

      // Initialize replication services (non-blocking, don't await)
      // This allows app to boot even if replication registration fails
      Promise.resolve().then(async () => {
        try {
          const networkStatusService = injector.get(NetworkStatusService);
          const replicationConfigs = initializeReplicationServices(
            injector,
            networkStatusService,
            identityService,
          );

          // Set replication services in database service
          setReplicationServices(replicationConfigs);

          // Register all replications in parallel (non-blocking)
          // Don't throw on failures, just log them
          const replicationResults = await Promise.allSettled(
            replicationConfigs.map((config) =>
              registerReplication(config, DB_INSTANCE),
            ),
          );

          // Log results
          replicationResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
              const { collectionName, success } = result.value;
              const metadata = CollectionRegistry.get(collectionName);
              const displayName = metadata?.displayName || collectionName;
              if (success) {
                console.log(`✅ Replication registered: ${displayName}`);
              } else {
                console.warn(
                  `⚠️ Replication registration failed: ${displayName} (will retry when online)`,
                );
              }
            } else {
              const config = replicationConfigs[index];
              const metadata = CollectionRegistry.get(config.collectionName);
              const displayName =
                metadata?.displayName || config.collectionName;
              console.error(
                `❌ Replication registration error for ${displayName}:`,
                result.reason,
              );
            }
          });
        } catch (error) {
          console.error('❌ Error setting up replication services:', error);
          // Don't throw - replication can retry later
        }
      });
    } catch (error) {
      console.error('❌ Fatal error during database initialization:', error);
      // Throw error - device selection and database initialization are required
      throw error;
    }
  })();

  try {
    await initState;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    // Don't rethrow - app should still boot
  }
}

/**
 * Database Service
 * Provides access to the database instance and manages replication services
 * Uses the adapter pattern internally but maintains backward compatibility with RxDB API
 */
@Injectable()
export class DatabaseService {
  private replicationServices: Map<
    string,
    | TransactionReplicationService
    | DeviceMonitoringReplicationService
    | DeviceMonitoringHistoryReplicationService
  > = new Map();

  /**
   * Get all replication services (for monitoring)
   */
  getReplicationServices(): Map<
    string,
    | TransactionReplicationService
    | DeviceMonitoringReplicationService
    | DeviceMonitoringHistoryReplicationService
  > {
    return this.replicationServices;
  }

  constructor() {
    GLOBAL_DB_SERVICE = this;
  }

  /**
   * Set replication service by collection name
   * Uses collection registry for type-safe access
   */
  setReplicationServiceByCollection(
    collectionName: string,
    service: any,
  ): void {
    const metadata = CollectionRegistry.get(collectionName);
    if (!metadata) {
      console.warn(
        `Collection ${collectionName} not found in registry, using collection name as key`,
      );
      this.replicationServices.set(collectionName, service);
      return;
    }
    // Use collection name from registry (not service name) for consistency
    this.replicationServices.set(metadata.collectionName, service);
  }

  /**
   * Backward compatibility setters
   * These use collection registry internally
   */
  setReplicationService(service: TransactionReplicationService) {
    this.setReplicationServiceByCollection('txn', service);
  }

  setDeviceMonitoringReplicationService(
    service: DeviceMonitoringReplicationService,
  ) {
    this.setReplicationServiceByCollection('device_monitoring', service);
  }

  setDeviceMonitoringHistoryReplicationService(
    service: DeviceMonitoringHistoryReplicationService,
  ) {
    this.setReplicationServiceByCollection(
      'device_monitoring_history',
      service,
    );
  }

  /**
   * Check if database is initialized
   */
  get isInitialized(): boolean {
    return !!DB_INSTANCE;
  }

  /**
   * Get the RxDB database instance (for backward compatibility)
   * Note: This will only work when using RxDBAdapter
   * Returns undefined if database is not initialized (degraded mode)
   */
  get db(): RxTxnsDatabase | undefined {
    if (!DB_INSTANCE) {
      console.warn(
        '⚠️ Database not initialized yet. App is running in degraded mode.',
      );
      return undefined;
    }
    return DB_INSTANCE;
  }

  /**
   * หยุด replication ทั้งหมด
   */
  async stopReplication() {
    const stopPromises = Array.from(this.replicationServices.values()).map(
      async (service) => {
        if (service && typeof (service as any).stopReplication === 'function') {
          await (service as any).stopReplication();
          return true;
        }
        return false;
      },
    );

    await Promise.all(stopPromises);
    console.log('All GraphQL replications stopped');
  }

  /**
   * Restart all replications with new URLs (for failover)
   * Ensures all replications are stopped before starting new ones
   */
  async restartReplicationsWithUrls(urls: {
    http: string;
    ws: string;
  }): Promise<void> {
    console.log(
      `🔄 [DatabaseService] Restarting replications with URLs:`,
      urls,
    );

    // Get database instance
    const dbInstance = this.db;
    if (!dbInstance) {
      throw new Error('Database not initialized');
    }

    // Get all replication services
    const services = Array.from(this.replicationServices.entries());

    // Step 1: Stop ALL replications first
    console.log('🛑 [DatabaseService] Stopping all replications...');
    const stopPromises = services.map(async ([collectionName, service]) => {
      try {
        if (service && typeof (service as any).stopReplication === 'function') {
          console.log(`🛑 [DatabaseService] Stopping ${collectionName}...`);
          await (service as any).stopReplication();
          console.log(`✅ [DatabaseService] Stopped ${collectionName}`);
          return { collectionName, stopped: true };
        }
        return { collectionName, stopped: false };
      } catch (error) {
        console.warn(
          `⚠️ [DatabaseService] Error stopping ${collectionName}:`,
          error,
        );
        return { collectionName, stopped: false, error };
      }
    });

    const stopResults = await Promise.all(stopPromises);
    console.log(
      '🛑 [DatabaseService] All replications stop results:',
      stopResults,
    );

    // Step 2: Start ALL replications with new URLs
    console.log(
      '🚀 [DatabaseService] Starting all replications with new URLs...',
    );
    const restartPromises = services.map(async ([collectionName, service]) => {
      try {
        console.log(
          `🔄 [DatabaseService] Restarting replication for ${collectionName}...`,
        );

        // Stop existing replication
        if (service && typeof (service as any).stopReplication === 'function') {
          await (service as any).stopReplication();
        }

        // Get collection
        const metadata = CollectionRegistry.get(collectionName);
        if (!metadata) {
          console.warn(
            `⚠️ [DatabaseService] Collection ${collectionName} not found in registry`,
          );
          return { collectionName, success: false };
        }

        const collection = dbInstance.collections[metadata.collectionKey];
        if (!collection) {
          console.warn(
            `⚠️ [DatabaseService] Collection ${collectionName} not found in database`,
          );
          return { collectionName, success: false };
        }

        // Re-register with new URLs
        // Each replication service should handle URL override in its buildReplicationConfig
        // We need to pass URLs through a context or directly to the service
        if (
          service &&
          typeof (service as any).setReplicationUrls === 'function'
        ) {
          // If service has method to set URLs, use it
          (service as any).setReplicationUrls(urls);
        }

        // Register replication with new URLs
        const replication = await (service as any).register_replication(
          collection,
          metadata.replicationId,
          urls, // Pass URLs to registration
        );

        if (replication) {
          console.log(
            `✅ [DatabaseService] Replication restarted for ${collectionName}`,
          );
          return { collectionName, success: true };
        } else {
          console.warn(
            `⚠️ [DatabaseService] Replication registration returned null for ${collectionName}`,
          );
          return { collectionName, success: false };
        }
      } catch (error) {
        console.error(
          `❌ [DatabaseService] Error restarting replication for ${collectionName}:`,
          error,
        );
        return { collectionName, success: false };
      }
    });

    const results = await Promise.all(restartPromises);
    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    console.log(
      `🚀 [DatabaseService] All replications start results:`,
      results,
    );

    console.log(
      `✅ [DatabaseService] Replication restart completed: ${successCount} succeeded, ${failCount} failed`,
    );

    if (failCount > 0) {
      console.warn(
        `⚠️ [DatabaseService] Some replications failed to restart:`,
        results.filter((r) => !r.success).map((r) => r.collectionName),
      );
      throw new Error(`Failed to restart ${failCount} replications`);
    }

    console.log(
      '🎉 [DatabaseService] All replications successfully restarted with new URLs',
    );
  }

  /**
   * เช็คสถานะการเชื่อมต่อ
   */
  getOnlineStatus(): boolean {
    const statuses = Array.from(this.replicationServices.values())
      .map((service) => {
        if (service && typeof (service as any).getOnlineStatus === 'function') {
          return (service as any).getOnlineStatus();
        }
        return false;
      })
      .filter((status) => status === true);

    return statuses.length > 0;
  }
}
