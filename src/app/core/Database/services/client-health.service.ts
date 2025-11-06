import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subscription, distinctUntilChanged } from 'rxjs';
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
  private readonly coordinator = inject(ReplicationCoordinatorService);
  private networkSubscription?: Subscription;

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

    // If offline initially, notify coordinator
    if (!initialOnline) {
      // Wait a bit for DB to initialize if needed
      setTimeout(async () => {
        await this.handleOffline();
      }, 2000); // Wait 2 seconds for DB initialization
    }
  }

  /**
   * Handle when network goes offline
   * Delegate to coordinator
   */
  private async handleOffline(): Promise<void> {
    await this.coordinator.handleNetworkOffline();
  }

  /**
   * Handle when network comes back online
   * Delegate to coordinator
   */
  private async handleOnline(): Promise<void> {
    await this.coordinator.handleNetworkOnline();
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
    console.log('🛑 [ClientHealth] Client health monitoring stopped');
  }
}
