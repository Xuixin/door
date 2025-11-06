import { Injectable } from '@angular/core';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { DatabaseService } from '../../services/database.service';
import { Observable, combineLatest, of, BehaviorSubject, Subject } from 'rxjs';
import { map, startWith, distinctUntilChanged } from 'rxjs/operators';
import {
  REPLICATION_IDENTIFIERS,
  COLLECTION_IDENTIFIER_MAP,
} from '../constants/replication.constants';
import {
  getCollectionFromIdentifier,
  getNameFromIdentifier,
  getUrlFromIdentifier,
  getServerFromIdentifier,
  getCollectionIdentifierMapping,
} from '../utils/replication.utils';

export interface ReplicationStateInfo {
  identifier: string;
  name: string;
  collection: string;
  server: 'primary' | 'secondary';
  isInitialized: boolean;
  isActive: boolean;
  isConnected: boolean;
  isStopped: boolean;
  isPaused: boolean;
  url: string;
  error?: any;
  lastActiveTime?: number;
  lastConnectedTime?: number;
}

// Track WebSocket connection status per replication
const connectionStatusMap = new Map<string, BehaviorSubject<boolean>>();

// Track wasStarted state per replication (event-based)
const wasStartedMap = new Map<string, BehaviorSubject<boolean>>();

export interface AllReplicationsState {
  replications: ReplicationStateInfo[];
  primaryActive: number;
  secondaryActive: number;
  primaryConnected: number;
  secondaryConnected: number;
  totalActive: number;
  totalConnected: number;
  allPrimaryActive: boolean;
  allSecondaryActive: boolean;
  currentServer: 'primary' | 'secondary' | 'mixed' | 'none';
}

@Injectable({
  providedIn: 'root',
})
export class ReplicationStateMonitorService {
  // Subject to emit when replication state changes (switch/start/stop/reinit)
  private stateChangeSubject = new Subject<void>();

  constructor(private databaseService: DatabaseService) {
    // Initialize wasStarted tracking for all replications
    this.initializeWasStartedTracking();

    // Register this service with DatabaseService to receive state change notifications
    this.databaseService.setReplicationMonitorService(this);
  }

  /**
   * Initialize tracking for wasStarted state of all replications
   * Called when replication is created or reinitialized
   */
  private initializeWasStartedTracking(): void {
    const allStates = this.databaseService.getAllReplicationStates();
    const identifiers = REPLICATION_IDENTIFIERS;

    for (const identifier of identifiers) {
      const state = allStates.get(identifier);
      if (state) {
        // Get current wasStarted value
        const wasStarted = (state as any).wasStarted ?? false;

        if (!wasStartedMap.has(identifier)) {
          // Create BehaviorSubject with initial wasStarted value
          const wasStartedSubject = new BehaviorSubject<boolean>(wasStarted);
          wasStartedMap.set(identifier, wasStartedSubject);
        } else {
          // Update existing subject if value changed
          const currentValue = wasStartedMap.get(identifier)?.getValue();
          if (currentValue !== wasStarted) {
            wasStartedMap.get(identifier)?.next(wasStarted);
          }
        }
      } else if (!state && wasStartedMap.has(identifier)) {
        // Replication removed, mark as not started
        wasStartedMap.get(identifier)?.next(false);
      }
    }
  }

  /**
   * Update wasStarted state for a replication (called by DatabaseService events)
   */
  updateWasStartedState(identifier: string, wasStarted: boolean): void {
    if (!wasStartedMap.has(identifier)) {
      wasStartedMap.set(identifier, new BehaviorSubject<boolean>(wasStarted));
    } else {
      wasStartedMap.get(identifier)?.next(wasStarted);
    }
    // Emit state change event
    this.stateChangeSubject.next();
  }

  /**
   * Notify that replication states have changed (switch/start/stop/reinit)
   * Called by DatabaseService after operations
   */
  notifyStateChange(): void {
    // Reinitialize tracking to sync with current state
    this.initializeWasStartedTracking();
    // Emit state change event
    this.stateChangeSubject.next();
  }

  /**
   * Get state of a single replication
   */
  getReplicationState(identifier: string): ReplicationStateInfo | null {
    const state = this.databaseService.getReplicationState(identifier);
    if (!state) {
      return null;
    }

    const server = getServerFromIdentifier(identifier);
    const collection = getCollectionFromIdentifier(identifier);

    try {
      // Use wasStarted instead of active$ to determine if replication is running
      // wasStarted = true means replication is active and will continue to pull/push
      // active$ only tells us if replication is currently pulling/pushing (between operations)
      const wasStarted = (state as any).wasStarted ?? false;
      const isActive = wasStarted; // replication is active if wasStarted = true
      const isStopped = state.isStopped?.() ?? false;
      const isPaused = state.isPaused?.() ?? false;

      // Get connection status from our tracking map
      // If not tracked yet, initialize it
      if (!connectionStatusMap.has(identifier)) {
        connectionStatusMap.set(
          identifier,
          new BehaviorSubject<boolean>(false),
        );
        // Subscribe to wasStarted changes (event-based)
        const wasStarted$ = this.getWasStartedObservable(identifier);
        wasStarted$.subscribe((started: boolean) => {
          const connectionSubject = connectionStatusMap.get(identifier);
          if (connectionSubject) {
            // If started and not stopped/paused, consider it connected
            const connected = started && !isStopped && !isPaused;
            connectionSubject.next(connected);
          }
        });
      }

      const connectionSubject = connectionStatusMap.get(identifier);
      const isConnected =
        (connectionSubject?.getValue() ?? false) &&
        isActive &&
        !isStopped &&
        !isPaused;

      return {
        identifier,
        name: getNameFromIdentifier(identifier),
        collection,
        server,
        isInitialized: true,
        isActive,
        isConnected,
        isStopped,
        isPaused,
        url: getUrlFromIdentifier(identifier),
        lastActiveTime: isActive ? Date.now() : undefined,
        lastConnectedTime: isConnected ? Date.now() : undefined,
      };
    } catch (error) {
      return {
        identifier,
        name: getNameFromIdentifier(identifier),
        collection,
        server,
        isInitialized: true,
        isActive: false,
        isConnected: false,
        isStopped: true,
        isPaused: false,
        url: getUrlFromIdentifier(identifier),
        error,
      };
    }
  }

  /**
   * Update connection status for a replication (called by WebSocket event handlers)
   */
  updateConnectionStatus(identifier: string, connected: boolean): void {
    if (!connectionStatusMap.has(identifier)) {
      connectionStatusMap.set(
        identifier,
        new BehaviorSubject<boolean>(connected),
      );
    } else {
      connectionStatusMap.get(identifier)?.next(connected);
    }
  }

  /**
   * Get state of all replications
   */
  getAllReplicationsState(): AllReplicationsState {
    const replications: ReplicationStateInfo[] = [];

    // Get all 6 replication identifiers
    const identifiers = REPLICATION_IDENTIFIERS;

    for (const identifier of identifiers) {
      const info = this.getReplicationState(identifier);
      if (info) {
        replications.push(info);
      } else {
        // Replication not initialized yet
        replications.push({
          identifier,
          name: getNameFromIdentifier(identifier),
          collection: getCollectionFromIdentifier(identifier),
          server: getServerFromIdentifier(identifier),
          isInitialized: false,
          isActive: false,
          isConnected: false,
          isStopped: true,
          isPaused: false,
          url: getUrlFromIdentifier(identifier),
        });
      }
    }

    // Calculate summary
    const primaryStates = replications.filter((r) => r.server === 'primary');
    const secondaryStates = replications.filter(
      (r) => r.server === 'secondary',
    );

    const primaryActive = primaryStates.filter((r) => r.isActive).length;
    const secondaryActive = secondaryStates.filter((r) => r.isActive).length;
    const primaryConnected = primaryStates.filter((r) => r.isConnected).length;
    const secondaryConnected = secondaryStates.filter(
      (r) => r.isConnected,
    ).length;

    const totalActive = primaryActive + secondaryActive;
    const totalConnected = primaryConnected + secondaryConnected;

    const allPrimaryActive =
      primaryStates.length > 0 && primaryActive === primaryStates.length;
    const allSecondaryActive =
      secondaryStates.length > 0 && secondaryActive === secondaryStates.length;

    // Determine current server
    let currentServer: 'primary' | 'secondary' | 'mixed' | 'none' = 'none';
    if (allPrimaryActive && secondaryActive === 0) {
      currentServer = 'primary';
    } else if (allSecondaryActive && primaryActive === 0) {
      currentServer = 'secondary';
    } else if (primaryActive > 0 || secondaryActive > 0) {
      currentServer = 'mixed';
    }

    return {
      replications,
      primaryActive,
      secondaryActive,
      primaryConnected,
      secondaryConnected,
      totalActive,
      totalConnected,
      allPrimaryActive,
      allSecondaryActive,
      currentServer,
    };
  }

  /**
   * Create observable from wasStarted state (event-based)
   * Uses BehaviorSubject that updates when replication state changes
   */
  private getWasStartedObservable(identifier: string): Observable<boolean> {
    if (!wasStartedMap.has(identifier)) {
      // Initialize if not exists
      const state = this.databaseService.getReplicationState(identifier);
      const wasStarted = (state as any)?.wasStarted ?? false;
      wasStartedMap.set(identifier, new BehaviorSubject<boolean>(wasStarted));
    }
    return wasStartedMap
      .get(identifier)!
      .asObservable()
      .pipe(distinctUntilChanged());
  }

  /**
   * Get observable that emits state updates
   * Uses wasStarted instead of active$ to determine if replication is running
   * Event-based: emits when replication state changes (switch/start/stop/reinit)
   */
  getStateObservable(): Observable<AllReplicationsState> {
    // Initialize tracking first
    this.initializeWasStartedTracking();

    const identifiers = REPLICATION_IDENTIFIERS;

    // Create observables for each replication's wasStarted state (event-based)
    const observables: Observable<boolean>[] = identifiers.map((identifier) =>
      this.getWasStartedObservable(identifier),
    );

    // Combine all wasStarted observables
    const wasStartedChanges$ = combineLatest(observables);

    // Also listen to state change events (switch/start/stop/reinit)
    const stateChanges$ = this.stateChangeSubject.asObservable();

    // Emit when any wasStarted changes OR when state changes occur
    return combineLatest([wasStartedChanges$, stateChanges$]).pipe(
      map(() => this.getAllReplicationsState()),
      startWith(this.getAllReplicationsState()),
    );
  }

  /**
   * Get state for a specific collection
   */
  getCollectionState(collectionName: string): {
    primary: ReplicationStateInfo | null;
    secondary: ReplicationStateInfo | null;
  } {
    const mapping = getCollectionIdentifierMapping(collectionName);
    if (!mapping) {
      return { primary: null, secondary: null };
    }

    return {
      primary: this.getReplicationState(mapping.primary),
      secondary: this.getReplicationState(mapping.secondary),
    };
  }

  /**
   * Get a formatted summary of all replication states (for debugging/logging)
   */
  getFormattedSummary(): string {
    const state = this.getAllReplicationsState();
    const lines: string[] = [];

    lines.push('📊 Replication State Summary');
    lines.push('='.repeat(50));
    lines.push(`Current Server: ${state.currentServer.toUpperCase()}`);
    lines.push(`Total Active: ${state.totalActive}/6`);
    lines.push(`Total Connected: ${state.totalConnected}/6`);
    lines.push(`Primary Active: ${state.primaryActive}/3`);
    lines.push(`Secondary Active: ${state.secondaryActive}/3`);
    lines.push('');

    lines.push('Individual Replications:');
    lines.push('-'.repeat(50));
    for (const repl of state.replications) {
      const status = [
        repl.isInitialized ? '✅' : '❌',
        repl.isActive ? '🟢' : '⚫',
        repl.isConnected ? '🔗' : '🔌',
      ].join(' ');

      lines.push(
        `${status} ${repl.name.padEnd(35)} | Server: ${repl.server.padEnd(8)} | URL: ${repl.url}`,
      );
    }

    return lines.join('\n');
  }

  /**
   * Log formatted summary to console
   */
  logSummary(): void {
    console.log(this.getFormattedSummary());
  }

  /**
   * Get a simple object representation for easy inspection
   */
  getSimpleState(): {
    currentServer: string;
    totalActive: number;
    totalConnected: number;
    replications: Array<{
      name: string;
      server: string;
      initialized: boolean;
      active: boolean;
      connected: boolean;
      url: string;
    }>;
  } {
    const state = this.getAllReplicationsState();
    return {
      currentServer: state.currentServer,
      totalActive: state.totalActive,
      totalConnected: state.totalConnected,
      replications: state.replications.map((r) => ({
        name: r.name,
        server: r.server,
        initialized: r.isInitialized,
        active: r.isActive,
        connected: r.isConnected,
        url: r.url,
      })),
    };
  }

  /**
   * Get replication received$ observable for a specific replication identifier
   * Returns null if replication is not found
   */
  getReplicationReceived$(identifier: string): Observable<any> | null {
    const state = this.databaseService.getReplicationState(identifier);
    if (!state || !(state as any).received$) {
      return null;
    }
    return (state as any).received$;
  }

  /**
   * Get combined replication received$ observable for a collection
   * Combines both primary and secondary replication received$ events
   */
  getCollectionReplicationReceived$(
    collectionName: string,
  ): Observable<any> | null {
    const mapping = getCollectionIdentifierMapping(collectionName);
    if (!mapping) {
      return null;
    }

    const primaryState = this.databaseService.getReplicationState(
      mapping.primary,
    );
    const secondaryState = this.databaseService.getReplicationState(
      mapping.secondary,
    );

    const observables: Observable<any>[] = [];

    if (primaryState && (primaryState as any).received$) {
      observables.push((primaryState as any).received$);
    }

    if (secondaryState && (secondaryState as any).received$) {
      observables.push((secondaryState as any).received$);
    }

    if (observables.length === 0) {
      return null;
    }

    // Combine all received$ observables and merge them
    return combineLatest(observables).pipe(
      map((results) => {
        // Flatten array of results
        const flattened: any[] = [];
        results.forEach((result) => {
          if (Array.isArray(result)) {
            flattened.push(...result);
          } else if (result) {
            flattened.push(result);
          }
        });
        return flattened;
      }),
    );
  }
}
