import { RxCollection, RxDatabase } from 'rxdb';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { Observable, Subject } from 'rxjs';
import {
  ReplicationAdapter,
  ReplicationConfig,
  ReplicationStatus,
  ReplicationState,
  ReplicationEvent,
} from '../../adapter';
import { RxTxnsDatabase } from '../../types/database.types';

/**
 * RxDB implementation of ReplicationAdapter
 * Wraps GraphQL replication functionality
 */
export class RxDBReplicationAdapter implements ReplicationAdapter {
  private replications = new Map<string, RxGraphQLReplicationState<any, any>>();
  private events = new Map<string, Subject<ReplicationEvent>>();
  private statuses = new Map<string, ReplicationStatus>();

  constructor(private db?: RxTxnsDatabase) {}

  /**
   * Set the database instance (used after initialization)
   */
  setDatabase(db: RxTxnsDatabase) {
    (this as any).db = db;
  }

  async register(
    collectionName: string,
    config: ReplicationConfig,
  ): Promise<ReplicationState> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    const collection = (this.db as any)[collectionName] as RxCollection;
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    // Stop existing replication if it exists
    // Use stop() which safely handles WebSocket connection states
    if (this.replications.has(config.replicationId)) {
      console.log(
        `Stopping existing replication ${config.replicationId} before re-registering`,
      );
      await this.stop(config.replicationId);
    }

    // Extract GraphQL-specific configuration
    const graphqlConfig: any = {
      collection: collection as any,
      replicationIdentifier: config.replicationId,
      url: config.url || {},
      pull: config.pull || {},
      push: config.push || {},
      live: config.live !== false,
      retryTime: config.retryTime || 5000,
      autoStart: config.autoStart !== false,
      ...config,
    };

    // Create replication state
    const replicationState = replicateGraphQL<any, any>(graphqlConfig);

    // Store replication
    this.replications.set(config.replicationId, replicationState);

    // Create event subject
    const eventSubject = new Subject<ReplicationEvent>();
    this.events.set(config.replicationId, eventSubject);

    // Setup status tracking
    const status: ReplicationStatus = {
      replicationId: config.replicationId,
      isActive: true,
      isOnline: true,
    };
    this.statuses.set(config.replicationId, status);

    // Subscribe to replication events
    replicationState.received$.subscribe({
      next: (count) => {
        status.lastSyncAt = new Date();
        status.pendingPull = count;
        eventSubject.next({ type: 'received', document: null } as any);
        eventSubject.next({ type: 'pulled', count } as any);
      },
      error: (error) => {
        status.error = error.message;
        eventSubject.next({ type: 'error', error });
      },
    });

    replicationState.sent$.subscribe({
      next: (count) => {
        status.pendingPush = count;
        eventSubject.next({ type: 'pushed', count } as any);
      },
    });

    replicationState.active$.subscribe({
      next: (isActive) => {
        status.isActive = isActive;
        eventSubject.next({ type: 'active', isActive });
      },
    });

    replicationState.error$.subscribe({
      next: (error) => {
        status.error = error.message;
        eventSubject.next({ type: 'error', error });
      },
    });

    replicationState.canceled$.subscribe({
      next: () => {
        status.isActive = false;
        eventSubject.complete();
      },
    });

    // Return replication state wrapper
    return {
      replicationId: config.replicationId,
      status,
      received$: replicationState.received$,
      sent$: replicationState.sent$,
      error$: replicationState.error$,
      active$: replicationState.active$,
      canceled$: replicationState.canceled$,
    };
  }

  async stop(replicationId: string): Promise<void> {
    const replication = this.replications.get(replicationId);
    if (replication) {
      try {
        // Try to cancel replication
        // Note: cancel() may fail if WebSocket connection hasn't been established yet
        // This can happen if replication was registered but connection is still pending
        await replication.cancel();
      } catch (error: any) {
        // Ignore errors during cancel - this can happen if:
        // 1. WebSocket connection hasn't been established yet (missing value from map)
        // 2. Replication was already canceled
        // 3. Replication state is invalid
        console.warn(
          `Warning: Error canceling replication ${replicationId}:`,
          error?.message || error,
        );
      } finally {
        // Always clean up regardless of cancel success/failure
        this.replications.delete(replicationId);
        const status = this.statuses.get(replicationId);
        if (status) {
          status.isActive = false;
        }
        const events = this.events.get(replicationId);
        if (events) {
          events.complete();
          this.events.delete(replicationId);
        }
      }
    }
  }

  getStatus(replicationId: string): ReplicationStatus | undefined {
    return this.statuses.get(replicationId);
  }

  events$(replicationId: string): Observable<ReplicationEvent> {
    const eventSubject = this.events.get(replicationId);
    if (!eventSubject) {
      throw new Error(`Replication ${replicationId} not found`);
    }
    return eventSubject.asObservable();
  }

  async start(replicationId: string): Promise<void> {
    const replication = this.replications.get(replicationId);
    if (!replication) {
      throw new Error(`Replication ${replicationId} not found`);
    }

    // RxDB GraphQL replication starts automatically, but we can restart it
    // by canceling and re-registering if needed
    const status = this.statuses.get(replicationId);
    if (status && !status.isActive) {
      // Note: RxDB doesn't have a direct start method, so this is a limitation
      // The replication should have been started during register
      status.isActive = true;
    }
  }

  isActive(replicationId: string): boolean {
    const status = this.statuses.get(replicationId);
    return status?.isActive || false;
  }

  /**
   * Get the underlying RxGraphQLReplicationState
   * For backward compatibility during migration
   */
  getRxReplicationState(
    replicationId: string,
  ): RxGraphQLReplicationState<any, any> | undefined {
    return this.replications.get(replicationId);
  }
}
