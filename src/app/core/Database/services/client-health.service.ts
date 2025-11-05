import { Injectable, inject, OnDestroy } from '@angular/core';
import { Subscription, distinctUntilChanged, filter } from 'rxjs';
import { NetworkStatusService } from './network-status.service';
import { DatabaseService } from './database.service';
import { environment } from 'src/environments/environment';

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
  private readonly databaseService = inject(DatabaseService);
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
        if (this.databaseService.isInitialized()) {
          console.log(
            '⚠️ [ClientHealth] Started offline and DB is initialized, stopping replications...',
          );
          await this.handleOffline();
        }
      }, 2000); // Wait 2 seconds for DB initialization
    }
  }

  /**
   * Handle when network goes offline
   * Stop all replications to prevent errors
   */
  private async handleOffline(): Promise<void> {
    console.log(
      '📴 [ClientHealth] Network is OFFLINE - stopping replications...',
    );

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ClientHealth] Database not initialized, skipping replication stop',
      );
      return;
    }

    try {
      // Get all replication states
      const allStates = this.databaseService.getAllReplicationStates();
      const replicationCount = allStates.size;

      if (replicationCount === 0) {
        console.log('ℹ️ [ClientHealth] No replications found to stop');
        this.isReplicationStopped = false; // No replications to stop
        return;
      }

      console.log(
        `🛑 [ClientHealth] Stopping ${replicationCount} replication(s)...`,
      );

      // Cancel all replications directly (don't check active state)
      // active$ only indicates if replication is currently running pull/push operations
      // We need to cancel ALL replications when offline, regardless of active$ state
      // because replication may be waiting for next pull/push cycle
      const cancelPromises: Promise<void>[] = [];
      for (const [identifier, state] of allStates.entries()) {
        cancelPromises.push(
          (async () => {
            try {
              // Always cancel - don't check active$ because replication may be waiting
              await state.cancel();
              console.log(
                `✅ [ClientHealth] Cancelled replication: ${identifier}`,
              );
            } catch (error: any) {
              // Ignore errors if replication is already cancelled or not started
              console.warn(
                `⚠️ [ClientHealth] Error cancelling ${identifier} (may already be stopped):`,
                error.message,
              );
            }
          })(),
        );
      }

      await Promise.all(cancelPromises);
      this.isReplicationStopped = true;
      console.log('✅ [ClientHealth] All replications stopped (offline mode)');
    } catch (error: any) {
      console.error(
        '❌ [ClientHealth] Error stopping replications:',
        error.message,
      );
    }
  }

  /**
   * Handle when network comes back online
   * Reinitialize replications
   */
  private async handleOnline(): Promise<void> {
    console.log(
      '📶 [ClientHealth] Network is ONLINE - reinitializing replications...',
    );

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ClientHealth] Database not initialized, skipping replication init',
      );
      return;
    }

    // Only reinitialize if we actually stopped replication due to offline
    if (!this.isReplicationStopped) {
      console.log(
        'ℹ️ [ClientHealth] Replications were not stopped by offline event, skipping reinit',
      );
      return;
    }

    try {
      // Wait a bit for network to stabilize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Reinitialize replications completely
      await this.databaseService.reinitializeReplications();

      this.isReplicationStopped = false;
    } catch (error: any) {
      console.error(
        '❌ [ClientHealth] Error reinitializing replications:',
        error.message,
      );
      // Don't reset flag on error, so we can retry next time
    }
  }

  /**
   * Manually start replications based on server availability
   */
  private async manualStartReplications(): Promise<void> {
    // Check which server is available
    const primaryAvailable = await this.checkServer(environment.apiUrl);

    if (primaryAvailable) {
      console.log(
        '🔄 [ClientHealth] Primary server available, starting primary replications...',
      );
      await this.databaseService.switchToPrimary();
    } else {
      const secondaryAvailable = await this.checkServer(
        environment.apiSecondaryUrl || environment.apiUrl,
      );
      if (secondaryAvailable) {
        console.log(
          '🔄 [ClientHealth] Secondary server available, starting secondary replications...',
        );
        await this.databaseService.switchToSecondary();
      } else {
        console.error(
          '❌ [ClientHealth] No server available, cannot start replications',
        );
      }
    }
  }

  /**
   * Check if server is reachable
   */
  private async checkServer(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ __typename }' }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
    console.log('🛑 [ClientHealth] Client health monitoring stopped');
  }
}
