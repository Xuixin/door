import { Injectable, inject, signal, computed } from '@angular/core';
import { environment } from 'src/environments/environment';
import { DatabaseService } from './database.service';
import { DeviceMonitoringHistoryFacade } from '../../collections/device-monitoring-history/facade.service';

export type ServerType = 'primary' | 'secondary';

/**
 * Replication Failover Service
 * Manages automatic failover from primary to secondary server with dynamic checkpoint switching
 *
 * Features:
 * - Primary (10102): Uses server_updated_at checkpoint
 * - Secondary (3001): Uses cloud_updated_at checkpoint
 * - Automatic checkpoint field detection based on server URL
 * - Device monitoring status-based primary recovery detection
 *
 * Recovery mechanism:
 * - Transaction replication monitors device-monitoring status when connected to 3001
 * - When serverId='111' status becomes 'online', automatically switches back to primary
 */
@Injectable({
  providedIn: 'root',
})
export class ReplicationFailoverService {
  private readonly databaseService = inject(DatabaseService);
  private readonly deviceMonitoringHistoryFacade = inject(
    DeviceMonitoringHistoryFacade,
  );

  // Reactive state using Angular Signals
  private readonly _currentServer = signal<ServerType>('primary');
  private readonly _primaryServerStatus = signal<boolean>(true);
  private readonly _isFailoverActive = signal<boolean>(false);
  private readonly _isSwitching = signal<boolean>(false);

  // Public readonly signals
  public readonly currentServer = this._currentServer.asReadonly();
  public readonly primaryServerStatus = this._primaryServerStatus.asReadonly();
  public readonly isFailoverActive = this._isFailoverActive.asReadonly();
  public readonly isSwitching = this._isSwitching.asReadonly();

  // Computed signals
  public readonly isOnSecondary = computed(
    () => this._currentServer() === 'secondary',
  );

  /**
   * Get current server URLs based on active server
   */
  getCurrentUrls(): { http: string; ws: string } {
    const server = this._currentServer();
    if (server === 'secondary') {
      return {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      };
    }
    return {
      http: environment.apiUrl,
      ws: environment.wsUrl,
    };
  }

  /**
   * Get primary server URLs
   */
  getPrimaryUrls(): { http: string; ws: string } {
    return {
      http: environment.apiUrl,
      ws: environment.wsUrl,
    };
  }

  /**
   * Get secondary server URLs
   */
  getSecondaryUrls(): { http: string; ws: string } {
    return {
      http: environment.apiSecondaryUrl || environment.apiUrl,
      ws: environment.wsSecondaryUrl || environment.wsUrl,
    };
  }

  /**
   * Stop all active replications
   */
  async stopAllReplications(): Promise<void> {
    console.log('🛑 [Failover] Stopping all replications...');
    try {
      await this.databaseService.stopReplication();
      console.log('✅ [Failover] All replications stopped');
    } catch (error) {
      console.error('❌ [Failover] Error stopping replications:', error);
      throw error;
    }
  }

  /**
   * Restart all replications with specified URLs
   */
  async restartReplicationsWithUrls(urls: {
    http: string;
    ws: string;
  }): Promise<void> {
    console.log(`🔄 [Failover] Restarting replications with URLs:`, urls);
    // This will be implemented in DatabaseService
    // For now, this is a placeholder that will call DatabaseService method
    throw new Error(
      'restartReplicationsWithUrls must be implemented in DatabaseService',
    );
  }

  /**
   * Switch to secondary server
   * Updated to use new checkpoint switching system
   */
  async switchToSecondary(): Promise<void> {
    if (this._isSwitching()) {
      console.log('⚠️ [Failover] Already switching servers, skipping...');
      return;
    }

    if (this._currentServer() === 'secondary') {
      console.log('ℹ️ [Failover] Already on secondary server');
      return;
    }

    try {
      this._isSwitching.set(true);
      console.log('🔄 [Failover] Starting failover to secondary server...');

      await this.stopAllReplications();

      const secondaryUrls = this.getSecondaryUrls();
      console.log('📡 [Failover] Secondary URLs:', secondaryUrls);
      console.log(
        '🔄 [Failover] Will use cloud_updated_at checkpoint for secondary server',
      );

      await this.databaseService.restartReplicationsWithUrls(secondaryUrls);

      this._currentServer.set('secondary');
      this._isFailoverActive.set(true);
      console.log('✅ [Failover] Switched to secondary server');

      // Step 5: Start secondary service root
      await this.startSecondaryServiceRoot();

      // Step 6: Log to history
      await this.deviceMonitoringHistoryFacade.appendSecondaryServerOnlineRev(
        secondaryUrls.http,
      );

      console.log(
        '✅ [Failover] Failover to secondary completed with checkpoint switching',
      );
    } catch (error) {
      console.error('❌ [Failover] Error switching to secondary:', error);
      throw error;
    } finally {
      this._isSwitching.set(false);
    }
  }

  /**
   * Switch back to primary server
   * Updated to use new checkpoint switching system
   */
  async switchToPrimary(): Promise<void> {
    if (this._isSwitching()) {
      console.log('⚠️ [Failover] Already switching servers, skipping...');
      return;
    }

    if (this._currentServer() === 'primary') {
      console.log('ℹ️ [Failover] Already on primary server');
      return;
    }

    try {
      this._isSwitching.set(true);
      console.log('🔄 [Failover] Switching back to primary server...');

      // Step 1: Stop all replications from current server
      console.log(
        '🛑 [Failover] Stopping all replications from current server...',
      );
      await this.stopAllReplications();
      console.log('✅ [Failover] All replications stopped');

      // Step 2: Get primary URLs
      const primaryUrls = this.getPrimaryUrls();
      console.log('📡 [Failover] Primary URLs:', primaryUrls);
      console.log(
        '🔄 [Failover] Will use server_updated_at checkpoint for primary server',
      );

      // Step 3: Restart replications with primary URLs
      // The new checkpoint system will automatically use server_updated_at for :10102
      await this.databaseService.restartReplicationsWithUrls(primaryUrls);

      // Step 4: Update state
      this._currentServer.set('primary');
      this._isFailoverActive.set(false);
      console.log('✅ [Failover] Switched back to primary server');

      // Step 5: Log to device monitoring history
      await this.deviceMonitoringHistoryFacade.appendPrimaryServerConnectedRev();

      console.log(
        '✅ [Failover] Switch to primary completed with checkpoint switching',
      );
    } catch (error) {
      console.error('❌ [Failover] Error switching to primary:', error);
      throw error;
    } finally {
      this._isSwitching.set(false);
    }
  }

  /**
   * Start secondary service root
   * Placeholder for actual service root implementation
   */
  async startSecondaryServiceRoot(): Promise<void> {
    console.log('🚀 [Failover] Starting secondary service root...');
    // TODO: Implement actual service root logic on secondary server
    console.log('✅ [Failover] Secondary service root started (placeholder)');
  }
}
