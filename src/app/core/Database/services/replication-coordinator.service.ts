import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { DatabaseService } from './database.service';
import { NetworkStatusService } from './network-status.service';
import { ReplicationManagerService } from '../replication/services/replication-manager.service';
import { environment } from 'src/environments/environment';

export type ReplicationState = 'primary' | 'secondary' | 'stopped';

export interface ManualStartResult {
  success: boolean;
  server?: 'primary' | 'secondary';
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReplicationCoordinatorService {
  private readonly databaseService = inject(DatabaseService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly replicationManager = inject(ReplicationManagerService);

  private _currentState: ReplicationState = 'stopped';
  private _isProcessing = false;
  private _replicationsStopped = false;
  private readonly _replicationsStopped$ = new BehaviorSubject<boolean>(false);

  /**
   * Observable for components to subscribe to replication stopped state
   */
  public readonly replicationsStopped$ =
    this._replicationsStopped$.asObservable();

  /**
   * Get current replication state
   */
  getCurrentState(): ReplicationState {
    return this._currentState;
  }

  /**
   * Check if coordinator is currently processing an operation
   */
  isProcessing(): boolean {
    return this._isProcessing;
  }

  /**
   * Check if replications are currently stopped
   */
  isReplicationsStopped(): boolean {
    return this._replicationsStopped;
  }

  /**
   * Ensure not processing to prevent concurrent operations
   */
  private ensureNotProcessing(): void {
    if (this._isProcessing) {
      throw new Error(
        'Replication coordinator is already processing an operation',
      );
    }
  }

  /**
   * Check server availability using HTTP request
   */
  private async checkServerAvailability(url: string): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

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
      return response.ok;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Stop all replications gracefully without throwing errors
   */
  private async stopAllReplicationsGracefully(): Promise<void> {
    try {
      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping replication stop',
        );
        return;
      }

      await this.replicationManager.stopAllReplicationsGracefully();
      this._currentState = 'stopped';
      this._replicationsStopped = true;
      this._replicationsStopped$.next(true);
      console.log(
        '✅ [ReplicationCoordinator] All replications stopped gracefully',
      );
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error stopping replications gracefully:',
        error.message,
      );
      // Still update state to stopped even if there was an error
      this._currentState = 'stopped';
      this._replicationsStopped = true;
      this._replicationsStopped$.next(true);
    }
  }

  /**
   * Handle network offline event
   * Stop all replications gracefully
   */
  async handleNetworkOffline(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping network offline handling',
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '📴 [ReplicationCoordinator] Network offline - stopping all replications...',
      );
      await this.stopAllReplicationsGracefully();
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle network online event
   * Check servers and start appropriate replications
   */
  async handleNetworkOnline(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping network online handling',
      );
      return;
    }

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Database not initialized, skipping network online handling',
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '📶 [ReplicationCoordinator] Network online - checking servers and starting replications...',
      );

      // Check primary server first
      const primaryAvailable = await this.checkServerAvailability(
        environment.apiUrl,
      );

      if (primaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Primary server available, starting primary replications...',
        );
        await this.databaseService.switchToPrimary();
        this._currentState = 'primary';
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false);
      } else {
        // Check secondary server
        const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
        const secondaryAvailable =
          await this.checkServerAvailability(secondaryUrl);

        if (secondaryAvailable) {
          console.log(
            '✅ [ReplicationCoordinator] Secondary server available, starting secondary replications...',
          );
          await this.databaseService.switchToSecondary();
          this._currentState = 'secondary';
          this._replicationsStopped = false;
          this._replicationsStopped$.next(false);
        } else {
          console.warn(
            '⚠️ [ReplicationCoordinator] Both servers unavailable, stopping all replications...',
          );
          await this.stopAllReplicationsGracefully();
        }
      }
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error handling network online:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle primary server down event
   * Switch to secondary if available, else stop all
   */
  async handlePrimaryServerDown(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping primary server down handling',
      );
      return;
    }

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Database not initialized, skipping primary server down handling',
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '🔴 [ReplicationCoordinator] Primary server down - checking secondary...',
      );

      // Check secondary server availability
      const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
      const secondaryAvailable =
        await this.checkServerAvailability(secondaryUrl);

      if (secondaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Secondary server available, switching to secondary...',
        );
        await this.databaseService.switchToSecondary();
        this._currentState = 'secondary';
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false);
      } else {
        console.warn(
          '⚠️ [ReplicationCoordinator] Secondary server also unavailable, stopping all replications...',
        );
        await this.stopAllReplicationsGracefully();
      }
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error handling primary server down:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle secondary server down event
   * Check if primary available, else stop all
   */
  async handleSecondaryServerDown(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping secondary server down handling',
      );
      return;
    }

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Database not initialized, skipping secondary server down handling',
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '🔴 [ReplicationCoordinator] Secondary server down - checking primary...',
      );

      // Check primary server availability
      const primaryAvailable = await this.checkServerAvailability(
        environment.apiUrl,
      );

      if (primaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Primary server available, switching to primary...',
        );
        await this.databaseService.switchToPrimary();
        this._currentState = 'primary';
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false);
      } else {
        console.warn(
          '⚠️ [ReplicationCoordinator] Primary server also unavailable, stopping all replications...',
        );
        await this.stopAllReplicationsGracefully();
      }
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error handling secondary server down:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle both servers down event
   * Stop all replications gracefully
   */
  async handleBothServersDown(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping both servers down handling',
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '🔴 [ReplicationCoordinator] Both servers down - stopping all replications...',
      );
      await this.stopAllReplicationsGracefully();
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle primary recovery event
   * Switch from secondary to primary
   */
  async handlePrimaryRecovery(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping primary recovery handling',
      );
      return;
    }

    if (!this.databaseService.isInitialized()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Database not initialized, skipping primary recovery handling',
      );
      return;
    }

    // Only switch if currently using secondary
    if (this._currentState !== 'secondary') {
      console.log(
        `⏭️ [ReplicationCoordinator] Not using secondary (current: ${this._currentState}), skipping primary recovery`,
      );
      return;
    }

    this._isProcessing = true;
    try {
      console.log(
        '✅ [ReplicationCoordinator] Primary server recovered - switching to primary...',
      );
      await this.databaseService.switchToPrimary();
      this._currentState = 'primary';
      this._replicationsStopped = false;
      this._replicationsStopped$.next(false);
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error handling primary recovery:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle manual start request (from HomePage)
   * Check servers and start appropriate replications
   */
  async handleManualStart(): Promise<ManualStartResult> {
    if (this._isProcessing) {
      return {
        success: false,
        message: 'Another operation is already in progress',
      };
    }

    if (!this.databaseService.isInitialized()) {
      return {
        success: false,
        message: 'Database is not initialized',
      };
    }

    this._isProcessing = true;
    try {
      console.log(
        '🔄 [ReplicationCoordinator] Manual start requested - checking servers...',
      );

      // Check primary server first
      const primaryAvailable = await this.checkServerAvailability(
        environment.apiUrl,
      );

      if (primaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Primary server available, starting primary replications...',
        );
        await this.databaseService.switchToPrimary();
        this._currentState = 'primary';
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false);
        return {
          success: true,
          server: 'primary',
        };
      }

      // Check secondary server
      const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
      const secondaryAvailable =
        await this.checkServerAvailability(secondaryUrl);

      if (secondaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Secondary server available, starting secondary replications...',
        );
        await this.databaseService.switchToSecondary();
        this._currentState = 'secondary';
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false);
        return {
          success: true,
          server: 'secondary',
        };
      }

      // Both servers unavailable
      console.warn(
        '⚠️ [ReplicationCoordinator] Both servers unavailable, cannot start replications',
      );
      return {
        success: false,
        message: 'Both servers are unavailable',
      };
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error during manual start:',
        error.message,
      );
      return {
        success: false,
        message: error.message || 'Unknown error occurred',
      };
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Check if both servers are down
   */
  async areBothServersDown(): Promise<boolean> {
    return this.replicationManager.checkBothServersDown();
  }

  /**
   * Handle app destroy - cleanup all replications
   */
  async handleAppDestroy(): Promise<void> {
    console.log(
      '🛑 [ReplicationCoordinator] App destroying - stopping all replications...',
    );
    await this.stopAllReplicationsGracefully();
  }
}
