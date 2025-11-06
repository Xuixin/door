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
   * Start replication for available server
   * Checks server status and starts appropriate replication
   * @returns 'primary' | 'secondary' | 'bothDown'
   */
  private async startReplicationForAvailableServer(): Promise<
    'primary' | 'secondary' | 'bothDown'
  > {
    const serverStatus = await this.replicationManager.checkServerStatus();

    if (serverStatus === 'primary') {
      // Check if already using primary server
      if (this._currentState === 'primary') {
        console.log(
          '⏭️ [ReplicationCoordinator] Already using primary server, skipping switch',
        );
        return 'primary';
      }
      console.log(
        '✅ [ReplicationCoordinator] Primary server available, starting primary replications...',
      );
      await this.databaseService.startReplication('primary');
      this._currentState = 'primary';
      this._replicationsStopped = false;
      this._replicationsStopped$.next(false);
      return 'primary';
    }

    if (serverStatus === 'secondary') {
      // Check if already using secondary server
      if (this._currentState === 'secondary') {
        console.log(
          '⏭️ [ReplicationCoordinator] Already using secondary server, skipping switch',
        );
        return 'secondary';
      }
      console.log(
        '✅ [ReplicationCoordinator] Secondary server available, starting secondary replications...',
      );
      await this.databaseService.startReplication('secondary');
      this._currentState = 'secondary';
      this._replicationsStopped = false;
      this._replicationsStopped$.next(false);
      return 'secondary';
    }

    // Both servers down
    console.log(
      '⚠️ [ReplicationCoordinator] Both servers unavailable, stopping all replications...',
    );
    await this.databaseService.stopReplication();
    this._currentState = 'stopped';
    this._replicationsStopped = true;
    this._replicationsStopped$.next(true);
    return 'bothDown';
  }

  /**
   * Handle server down - switch to alternative server or stop
   * @param downServer - 'primary' or 'secondary' - the server that is down
   */
  private async handleServerDown(
    downServer: 'primary' | 'secondary',
  ): Promise<void> {
    const alternativeServer =
      downServer === 'primary' ? 'secondary' : 'primary';
    const serverStatus = await this.replicationManager.checkServerStatus();

    if (serverStatus === alternativeServer) {
      // Alternative server is available
      if (this._currentState === alternativeServer) {
        console.log(
          `⏭️ [ReplicationCoordinator] Already using ${alternativeServer} server, skipping switch`,
        );
        return;
      }
      console.log(
        `✅ [ReplicationCoordinator] ${alternativeServer} server available, switching to ${alternativeServer}...`,
      );
      await this.databaseService.startReplication(alternativeServer);
      this._currentState = alternativeServer;
      this._replicationsStopped = false;
      this._replicationsStopped$.next(false);
    } else {
      // Both servers down
      console.warn(
        `⚠️ [ReplicationCoordinator] ${alternativeServer} server also unavailable, stopping all replications...`,
      );
      await this.databaseService.stopReplication();
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
      await this.databaseService.stopReplication();
      this._currentState = 'stopped';
      this._replicationsStopped = true;
      this._replicationsStopped$.next(true);
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Ensure replications are initialized
   * If replication states don't exist, reinitialize them
   */
  private async ensureReplicationsInitialized(): Promise<void> {
    const replicationStates = this.replicationManager.getAllReplicationStates();
    if (replicationStates.size === 0) {
      console.log(
        '🔄 [ReplicationCoordinator] Replication states not found, reinitializing...',
      );
      await this.databaseService.reinitializeReplications();
      console.log(
        '✅ [ReplicationCoordinator] Replications reinitialized successfully',
      );
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

      // Ensure replications are initialized before attempting to switch/start
      await this.ensureReplicationsInitialized();

      // Start replication for available server
      await this.startReplicationForAvailableServer();
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

      await this.handleServerDown('primary');
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

      await this.handleServerDown('secondary');
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
      await this.databaseService.stopReplication();
      this._currentState = 'stopped';
      this._replicationsStopped = true;
      this._replicationsStopped$.next(true);
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
      await this.databaseService.startReplication('primary');
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

      // Ensure replications are initialized before starting
      await this.ensureReplicationsInitialized();

      // Verify states exist after initialization
      const statesAfterInit = this.replicationManager.getAllReplicationStates();
      if (statesAfterInit.size === 0) {
        console.error(
          '❌ [ReplicationCoordinator] Replication states still not found after initialization',
        );
        return {
          success: false,
          message: 'Failed to initialize replications',
        };
      }

      // Start replication for available server
      const serverStatus = await this.startReplicationForAvailableServer();

      if (serverStatus === 'primary' || serverStatus === 'secondary') {
        return {
          success: true,
          server: serverStatus,
        };
      }

      // Both servers unavailable
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
    await this.databaseService.stopReplication();
    this._currentState = 'stopped';
    this._replicationsStopped = true;
    this._replicationsStopped$.next(true);
  }
}
