import { Observable } from 'rxjs';

/**
 * Replication status information
 */
export interface ReplicationStatus {
  replicationId: string;
  isActive: boolean;
  isOnline: boolean;
  lastSyncAt?: Date;
  pendingPull?: number;
  pendingPush?: number;
  error?: string;
}

/**
 * Replication configuration
 */
export interface ReplicationConfig {
  replicationId: string;
  collectionName: string;
  pull?: {
    batchSize?: number;
    query?: any;
    modifier?: (doc: any) => any;
  };
  push?: {
    batchSize?: number;
    modifier?: (doc: any) => any;
  };
  live?: boolean;
  retryTime?: number;
  autoStart?: boolean;
  [key: string]: any; // Allow backend-specific options
}

/**
 * Replication event types
 */
export type ReplicationEvent =
  | { type: 'active'; isActive: boolean }
  | { type: 'error'; error: Error }
  | { type: 'pulled'; count: number }
  | { type: 'pushed'; count: number }
  | { type: 'sync'; synced: number }
  | { type: 'rejected'; document: any; reason: string }
  | { type: 'received'; document: any };

/**
 * Replication state information
 */
export interface ReplicationState {
  replicationId: string;
  status: ReplicationStatus;
  received$: Observable<number>;
  sent$: Observable<number>;
  error$: Observable<Error>;
  active$: Observable<boolean>;
  canceled$: Observable<void>;
}

/**
 * Replication adapter for sync operations
 * Abstracts replication logic from specific backend implementations
 */
export interface ReplicationAdapter {
  /**
   * Register replication for a collection
   * @param collectionName - Name of the collection to replicate
   * @param config - Replication configuration
   * @returns Promise that resolves to replication state
   */
  register(
    collectionName: string,
    config: ReplicationConfig,
  ): Promise<ReplicationState>;

  /**
   * Stop replication
   * @param replicationId - Unique identifier for the replication to stop
   */
  stop(replicationId: string): Promise<void>;

  /**
   * Get replication status
   * @param replicationId - Unique identifier for the replication
   * @returns Current replication status or undefined if not found
   */
  getStatus(replicationId: string): ReplicationStatus | undefined;

  /**
   * Subscribe to replication events
   * @param replicationId - Unique identifier for the replication
   * @returns Observable that emits replication events
   */
  events$(replicationId: string): Observable<ReplicationEvent>;

  /**
   * Start a stopped replication
   * @param replicationId - Unique identifier for the replication to start
   */
  start(replicationId: string): Promise<void>;

  /**
   * Check if replication is active
   * @param replicationId - Unique identifier for the replication
   */
  isActive(replicationId: string): boolean;
}
