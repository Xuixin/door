import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subscription, distinctUntilChanged, filter } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { ReplicationCoordinatorService } from './replication-coordinator.service';

/**
 * Client Health Service
 * Manages client-side network status and replication lifecycle
 *
 * Features:
 * - Monitors network online/offline status
 * - Stops replications when offline
 * - Reinitializes replications when back online
 */
@Injectable({
  providedIn: 'root',
})
export class ClientHealthService implements OnDestroy {
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly replicationCoordinator = inject(
    ReplicationCoordinatorService,
  );
  private networkSubscription?: Subscription;
  private isReplicationStopped = false; // Track if we stopped replication due to offline

  constructor() {
    this.initialize();
  }

  /**
   * Initialize network monitoring
   */
  private initialize(): void {
    console.log('🔌 [ClientHealth] Initializing client health monitoring...');

    // Subscribe to network status changes
    // Don't filter by DB initialization - we'll check it in the handlers
    this.networkSubscription = this.networkStatus.isOnline$
      .pipe(
        distinctUntilChanged(), // Only emit when status actually changes
      )
      .subscribe((isOnline) => {
        console.log(
          `📡 [ClientHealth] Network status changed: ${isOnline ? 'ONLINE' : 'OFFLINE'}`,
        );
        if (isOnline) {
          this.handleOnline();
        } else {
          this.handleOffline();
        }
      });

    // Handle initial state
    const initialOnline = this.networkStatus.isOnline();
    console.log(
      `🔌 [ClientHealth] Initial state: ${initialOnline ? 'ONLINE' : 'OFFLINE'}`,
    );

    // If offline initially and DB is already initialized, stop replication
    if (!initialOnline) {
      // Wait a bit for DB to initialize if needed
      setTimeout(async () => {
        // Check if database is initialized via coordinator
        await this.handleOffline();
      }, 2000); // Wait 2 seconds for DB initialization
    }
  }

  /**
   * Handle when network goes offline
   * Delegate to ReplicationCoordinatorService
   */
  private async handleOffline(): Promise<void> {
    console.log(
      '📴 [ClientHealth] Network is OFFLINE - delegating to coordinator...',
    );

    await this.replicationCoordinator.handleNetworkOffline();
    this.isReplicationStopped = true;
  }

  /**
   * Handle when network comes back online
   * Delegate to ReplicationCoordinatorService
   */
  private async handleOnline(): Promise<void> {
    console.log(
      '📶 [ClientHealth] Network is ONLINE - delegating to coordinator...',
    );

    // Only reinitialize if we actually stopped replication due to offline
    if (!this.isReplicationStopped) {
      console.log(
        'ℹ️ [ClientHealth] Replications were not stopped by offline event, skipping reinit',
      );
      return;
    }

    await this.replicationCoordinator.handleNetworkOnline();
    this.isReplicationStopped = false;
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
    console.log('🛑 [ClientHealth] Client health monitoring stopped');
  }
}
