import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DatabaseService } from './database.service';
import { NetworkStatusService } from './network-status.service';
import { environment } from 'src/environments/environment';
import { checkGraphQLConnection } from '../replication/utils/connection.utils';

/**
 * Replication Coordinator Service
 * Centralized control for all replication lifecycle operations
 *
 * This service coordinates replication start/stop/switch decisions based on:
 * - Network status (online/offline)
 * - Server health (primary/secondary availability)
 * - Manual requests (from UI)
 *
 * All other services (ClientHealthService, ServerHealthService, etc.) should
 * emit events/requests to this coordinator instead of directly controlling replications.
 */
@Injectable({
  providedIn: 'root',
})
export class ReplicationCoordinatorService {
  private readonly databaseService = inject(DatabaseService);
  private readonly networkStatus = inject(NetworkStatusService);

  // Track current replication state
  private _isProcessing = false; // Prevent concurrent operations
  private _lastOperation: 'start' | 'stop' | 'switch' | null = null;
  private _replicationsStopped = false; // Track if replications were stopped due to both servers down

  // Expose state for components to subscribe
  private _replicationsStopped$ = new BehaviorSubject<boolean>(false);
  public readonly replicationsStopped$: Observable<boolean> =
    this._replicationsStopped$.asObservable();

  /**
   * Get current replications stopped state
   */
  isReplicationsStopped(): boolean {
    return this._replicationsStopped;
  }

  /**
   * Handle network going offline
   * Stop all replications gracefully
   */
  async handleNetworkOffline(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping network offline',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'stop';

    try {
      console.log(
        '📴 [ReplicationCoordinator] Network offline - stopping all replications...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      await this.databaseService.stopAllReplicationsGracefully();
      console.log(
        '✅ [ReplicationCoordinator] All replications stopped (offline)',
      );
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error stopping replications:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle network coming back online
   * Check server availability and start appropriate replications
   */
  async handleNetworkOnline(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping network online',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'start';

    try {
      console.log(
        '📶 [ReplicationCoordinator] Network online - checking servers and starting replications...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));

      const result = await this.checkAndStartReplications();

      // Clear stopped flag if successfully started
      if (result.success) {
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false); // Emit state change
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
   * Handle primary server going down
   * Switch to secondary if available, otherwise stop all replications
   */
  async handlePrimaryServerDown(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping primary server down',
      );
      return;
    }

    // If replications already stopped, skip to avoid duplicate operations
    if (this._replicationsStopped) {
      console.log(
        '⏭️ [ReplicationCoordinator] Replications already stopped, skipping primary server down',
      );
      return;
    }

    // Check if network is offline - ClientHealthService will handle it
    if (!this.networkStatus.isOnline()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Network is offline, ClientHealthService will handle',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'switch';

    try {
      console.log(
        '🔄 [ReplicationCoordinator] Primary server down - switching to secondary...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      // Check if secondary server is available
      const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
      const secondaryAvailable = await checkGraphQLConnection(secondaryUrl);

      if (secondaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Secondary server available, switching...',
        );
        this._replicationsStopped = false; // Clear flag when switching
        this._replicationsStopped$.next(false); // Emit state change
        await this.databaseService.switchToSecondary();
      } else {
        console.log(
          '⚠️ [ReplicationCoordinator] Secondary server also unavailable, stopping all replications',
        );
        await this.databaseService.stopAllReplicationsGracefully();
        this._replicationsStopped = true; // Set flag after stopping
        this._replicationsStopped$.next(true); // Emit state change
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
   * Handle secondary server going down
   * Check if primary is available, otherwise stop all replications
   */
  async handleSecondaryServerDown(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping secondary server down',
      );
      return;
    }

    // Check if network is offline - ClientHealthService will handle it
    if (!this.networkStatus.isOnline()) {
      console.log(
        '⏭️ [ReplicationCoordinator] Network is offline, ClientHealthService will handle',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'switch';

    try {
      console.log(
        '🔄 [ReplicationCoordinator] Secondary server down - checking primary...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      // Check if primary server is available
      const primaryAvailable = await checkGraphQLConnection(environment.apiUrl);

      if (primaryAvailable) {
        console.log(
          '✅ [ReplicationCoordinator] Primary server available, switching...',
        );
        this._replicationsStopped = false; // Clear flag when switching
        this._replicationsStopped$.next(false); // Emit state change
        await this.databaseService.switchToPrimary();
      } else {
        console.log(
          '⚠️ [ReplicationCoordinator] Primary server also unavailable, stopping all replications',
        );
        await this.databaseService.stopAllReplicationsGracefully();
        this._replicationsStopped = true; // Set flag after stopping
        this._replicationsStopped$.next(true); // Emit state change
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
   * Handle both servers going down
   * Stop all replications gracefully
   * No need to check connection - we already know both servers are down
   */
  async handleBothServersDown(): Promise<void> {
    // If already stopped, skip to avoid duplicate operations
    if (this._replicationsStopped) {
      console.log(
        '⏭️ [ReplicationCoordinator] Replications already stopped, skipping duplicate stop',
      );
      return;
    }

    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping both servers down',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'stop';

    try {
      console.log(
        '🛑 [ReplicationCoordinator] Both servers down - stopping all replications...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      await this.databaseService.stopAllReplicationsGracefully();
      this._replicationsStopped = true; // Set flag after stopping
      this._replicationsStopped$.next(true); // Emit state change
      console.log(
        '✅ [ReplicationCoordinator] All replications stopped (both servers down)',
      );
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error stopping replications:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Handle primary server recovery
   * Switch from secondary to primary if currently using secondary
   */
  async handlePrimaryRecovery(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping primary recovery',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'switch';

    try {
      console.log(
        '🔄 [ReplicationCoordinator] Primary server recovered - switching from secondary to primary...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      // Verify primary is actually available
      const primaryAvailable = await checkGraphQLConnection(environment.apiUrl);
      if (!primaryAvailable) {
        console.log(
          '⚠️ [ReplicationCoordinator] Primary server not actually available yet, skipping switch',
        );
        return;
      }

      await this.databaseService.switchToPrimary();
      this._replicationsStopped = false; // Clear flag when switching
      this._replicationsStopped$.next(false); // Emit state change
      console.log('✅ [ReplicationCoordinator] Switched to primary server');
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
   * Handle manual start request (from UI)
   * Check server availability and start appropriate replications
   * Returns object with success status and message
   */
  async handleManualStart(): Promise<{
    success: boolean;
    message: string;
  }> {
    if (this._isProcessing) {
      return {
        success: false,
        message: 'กำลังดำเนินการอยู่ กรุณารอสักครู่',
      };
    }

    this._isProcessing = true;
    this._lastOperation = 'start';

    try {
      console.log('🔄 [ReplicationCoordinator] Manual start requested...');

      if (!this.databaseService.isInitialized()) {
        return {
          success: false,
          message: 'Database ยังไม่พร้อม',
        };
      }

      const result = await this.checkAndStartReplications();

      // Clear stopped flag if successfully started
      if (result.success) {
        this._replicationsStopped = false;
        this._replicationsStopped$.next(false); // Emit state change
      }

      return result;
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error in manual start:',
        error.message,
      );
      return {
        success: false,
        message: 'เกิดข้อผิดพลาดในการเริ่มต้น Replication',
      };
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Check server availability and start appropriate replications
   * Internal helper method
   */
  private async checkAndStartReplications(): Promise<{
    success: boolean;
    message: string;
  }> {
    // Check primary server first
    const primaryAvailable = await checkGraphQLConnection(environment.apiUrl);
    if (primaryAvailable) {
      console.log(
        '✅ [ReplicationCoordinator] Primary server available, starting primary replications...',
      );
      try {
        await this.databaseService.startPrimary();
        return {
          success: true,
          message: 'เชื่อมต่อกับ Primary Server สำเร็จ',
        };
      } catch (error: any) {
        console.error(
          '❌ [ReplicationCoordinator] Error starting primary replications:',
          error.message,
        );
        return {
          success: false,
          message: 'เกิดข้อผิดพลาดในการเริ่มต้น Primary Replication',
        };
      }
    }

    // Check secondary server
    const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
    const secondaryAvailable = await checkGraphQLConnection(secondaryUrl);
    if (secondaryAvailable) {
      console.log(
        '✅ [ReplicationCoordinator] Secondary server available, starting secondary replications...',
      );
      try {
        await this.databaseService.startSecondary();
        return {
          success: true,
          message: 'เชื่อมต่อกับ Secondary Server สำเร็จ',
        };
      } catch (error: any) {
        console.error(
          '❌ [ReplicationCoordinator] Error starting secondary replications:',
          error.message,
        );
        return {
          success: false,
          message: 'เกิดข้อผิดพลาดในการเริ่มต้น Secondary Replication',
        };
      }
    }

    // Both servers unavailable
    console.log('⚠️ [ReplicationCoordinator] Both servers are unavailable');
    return {
      success: false,
      message:
        'ไม่สามารถเชื่อมต่อกับทั้ง Primary และ Secondary Server ได้ กรุณาลองใหม่อีกครั้ง',
    };
  }

  /**
   * Handle app destroy/cleanup
   * Stop all replications gracefully
   */
  async handleAppDestroy(): Promise<void> {
    if (this._isProcessing) {
      console.log(
        '⏭️ [ReplicationCoordinator] Already processing, skipping app destroy',
      );
      return;
    }

    this._isProcessing = true;
    this._lastOperation = 'stop';

    try {
      console.log(
        '🛑 [ReplicationCoordinator] App destroying - stopping all replications...',
      );

      if (!this.databaseService.isInitialized()) {
        console.log(
          '⏭️ [ReplicationCoordinator] Database not initialized, skipping',
        );
        return;
      }

      await this.databaseService.stopReplication();
      console.log(
        '✅ [ReplicationCoordinator] All replications stopped (app destroy)',
      );
    } catch (error: any) {
      console.error(
        '❌ [ReplicationCoordinator] Error stopping replications on app destroy:',
        error.message,
      );
    } finally {
      this._isProcessing = false;
    }
  }
}
