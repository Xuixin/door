import type { RxTxnsDatabase } from '../types/database.types';

/**
 * Collection metadata configuration
 */
export interface CollectionMetadata {
  /** Collection name in database (e.g., 'txn', 'device_monitoring') */
  collectionName: string;
  /** Database collection key (for RxDB compatibility) */
  collectionKey: keyof RxTxnsDatabase['collections'];
  /** Unique replication identifier */
  replicationId: string;
  /** Human-readable service name */
  serviceName: string;
  /** Display name for UI */
  displayName: string;
  /** Optional description */
  description?: string;
}

/**
 * Collection Registry
 * Centralized registry for all database collections
 * Single source of truth for collection names, replication IDs, and metadata
 *
 * TODO: Enhanced with auto-discovery in Phase 3
 */
export class CollectionRegistry {
  /**
   * All registered collections
   */
  private static readonly collections: Map<string, CollectionMetadata> =
    new Map([
      [
        'txn',
        {
          collectionName: 'txn',
          collectionKey: 'txn',
          replicationId: 'txn-graphql-replication',
          serviceName: 'Transaction',
          displayName: 'Transaction',
          description: 'Transaction collection for managing entries and exits',
        },
      ],
      [
        'device_monitoring',
        {
          collectionName: 'device_monitoring',
          collectionKey: 'device_monitoring',
          replicationId: 'device-monitoring-graphql-replication',
          serviceName: 'DeviceMonitoring',
          displayName: 'Device Monitoring',
          description:
            'Device monitoring collection for tracking device status and metadata',
        },
      ],
      [
        'device_monitoring_history',
        {
          collectionName: 'device_monitoring_history',
          collectionKey: 'device_monitoring_history',
          replicationId: 'device-monitoring-history-graphql-replication',
          serviceName: 'DeviceMonitoringHistory',
          displayName: 'Device Monitoring History',
          description:
            'Device monitoring history collection - revision history of device-monitoring',
        },
      ],
    ]);

  /**
   * Get collection metadata by name
   */
  static get(name: string): CollectionMetadata | undefined {
    return this.collections.get(name);
  }

  /**
   * Get collection metadata by name (throws if not found)
   */
  static getOrThrow(name: string): CollectionMetadata {
    const metadata = this.get(name);
    if (!metadata) {
      throw new Error(`Collection "${name}" not found in registry`);
    }
    return metadata;
  }

  /**
   * Get collection metadata by replication ID
   */
  static getByReplicationId(
    replicationId: string,
  ): CollectionMetadata | undefined {
    return Array.from(this.collections.values()).find(
      (meta) => meta.replicationId === replicationId,
    );
  }

  /**
   * Get collection metadata by service name
   */
  static getByServiceName(serviceName: string): CollectionMetadata | undefined {
    return Array.from(this.collections.values()).find(
      (meta) => meta.serviceName === serviceName,
    );
  }

  /**
   * Get all registered collections
   */
  static getAll(): CollectionMetadata[] {
    return Array.from(this.collections.values());
  }

  /**
   * Get all collection names
   */
  static getAllNames(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Check if collection exists
   */
  static has(name: string): boolean {
    return this.collections.has(name);
  }

  /**
   * Register a new collection (for future use)
   */
  static register(metadata: CollectionMetadata): void {
    if (this.collections.has(metadata.collectionName)) {
      console.warn(
        `Collection "${metadata.collectionName}" already registered, overwriting...`,
      );
    }
    this.collections.set(metadata.collectionName, metadata);
  }
}

/**
 * Type-safe collection name constants
 */
export const COLLECTION_NAMES = {
  TXN: 'txn',
  DEVICE_MONITORING: 'device_monitoring',
  DEVICE_MONITORING_HISTORY: 'device_monitoring_history',
} as const;

/**
 * Type for collection names
 */
export type CollectionName =
  (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];
