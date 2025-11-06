import { Injectable, inject } from '@angular/core';
import { RxDatabase, RxCollection } from 'rxdb';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { environment } from 'src/environments/environment';
import {
  setupCollectionReplication,
  ReplicationConfig,
} from './replication-helper';
import { createReplicationConfigs } from '../config';
import { PRIMARY_IDENTIFIERS, SECONDARY_IDENTIFIERS } from '../constants';
import { isPrimaryIdentifier, isSecondaryIdentifier } from '../utils';
import { DeviceEventFacade } from '../../collection/device-event/facade.service';

interface DatabaseCollections {
  transaction: RxCollection;
  devicemonitoring: RxCollection;
  devicemonitoringhistory: RxCollection;
  device_event: RxCollection;
}

@Injectable({
  providedIn: 'root',
})
export class ReplicationManagerService {
  private replicationStates: Map<string, RxGraphQLReplicationState<any, any>> =
    new Map();
  private replicationMonitorService: any = null;

  /**
   * Set replication monitor service (called after initialization to avoid circular dependency)
   */
  setReplicationMonitorService(monitorService: any): void {
    this.replicationMonitorService = monitorService;
  }

  /**
   * Notify replication monitor about state changes
   */
  private notifyReplicationMonitor(): void {
    if (this.replicationMonitorService?.notifyStateChange) {
      this.replicationMonitorService.notifyStateChange();
    }
  }

  /**
   * Check server availability using HTTP request
   * @param url - Server URL to check
   * @returns Promise<boolean> - true if server is available
   */
  async checkServerAvailability(url: string): Promise<boolean> {
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
   * Check if both servers are down
   * @returns Promise<boolean> - true if both servers are unavailable
   */
  async checkBothServersDown(): Promise<boolean> {
    const primaryAvailable = await this.checkServerAvailability(
      environment.apiUrl,
    );
    const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
    const secondaryAvailable = await this.checkServerAvailability(secondaryUrl);

    return !primaryAvailable && !secondaryAvailable;
  }

  /**
   * Stop all replications gracefully without throwing errors
   * Cancels all replications (primary + secondary) without checking active state
   * Wraps each cancellation in try-catch to prevent errors
   */
  async stopAllReplicationsGracefully(): Promise<void> {
    console.log(
      '🛑 [ReplicationManager] Stopping all replications gracefully...',
    );
    const allStates = Array.from(this.replicationStates.values());

    // Cancel all replications - don't check active$ state
    // active$ only shows if pull/push operations are currently running
    // Replication may be waiting for next cycle even if active$ is false
    for (const state of allStates) {
      try {
        // Check if replication was started before canceling
        const wasStarted =
          (state as any).wasStarted ?? (state as any)._wasStarted ?? false;
        if (wasStarted) {
          await state.cancel();
        } else {
          console.log(
            '⏭️ [ReplicationManager] Replication not started, skipping cancel',
          );
        }
      } catch (error: any) {
        // Ignore errors if replication is already cancelled or not started
        console.warn(
          '⚠️ [ReplicationManager] Error cancelling replication (may already be stopped):',
          error.message,
        );
      }
    }

    // Clear replication states map
    this.replicationStates.clear();
    console.log('✅ [ReplicationManager] All replications stopped gracefully');

    // Notify replication monitor about state changes
    this.notifyReplicationMonitor();
  }

  /**
   * Initialize all replications
   * @param db - RxDatabase instance
   * @param useSecondary - Whether to use secondary server
   * @param serverId - Server ID for replication
   * @param deviceEventFacade - DeviceEventFacade instance for creating device events
   * @param emitPrimaryRecoveryFn - Function to emit primary recovery event
   */
  async initializeReplications(
    db: RxDatabase<DatabaseCollections>,
    useSecondary: boolean,
    serverId: string,
    deviceEventFacade: DeviceEventFacade,
    emitPrimaryRecoveryFn: () => Promise<void>,
  ): Promise<void> {
    // If replication states already exist, stop them gracefully before initializing new ones
    if (this.replicationStates.size > 0) {
      console.log(
        '🔄 [ReplicationManager] Stopping existing replications before initialization...',
      );
      await this.stopAllReplicationsGracefully();
    }

    // Create replication configs using the config factory
    const replicationConfigs = createReplicationConfigs(
      db,
      serverId,
      deviceEventFacade,
      emitPrimaryRecoveryFn,
    );

    // Check if both servers are down (offline mode) once before loop
    // If offline, all replications should have autoStart=false
    const bothServersDown = await this.checkBothServersDown();

    // Initialize all replications
    for (const config of replicationConfigs) {
      try {
        if (bothServersDown) {
          // Offline mode: Disable autoStart for all replications
          // They can be started manually when connection is restored
          config.autoStart = false;
          console.log(
            `⏸️ [ReplicationManager] Offline mode: ${config.name} autoStart=false`,
          );
        } else {
          // Set autoStart based on which server we're using
          if (useSecondary) {
            // Using secondary server - enable secondary replications, disable primary
            if (isSecondaryIdentifier(config.replicationIdentifier)) {
              config.autoStart = true; // Enable autoStart for secondary
            } else {
              config.autoStart = false; // Disable autoStart for primary
            }
          } else {
            // Using primary server - enable primary replications, disable secondary
            if (isPrimaryIdentifier(config.replicationIdentifier)) {
              config.autoStart = true; // Enable autoStart for primary
            } else {
              config.autoStart = false; // Disable autoStart for secondary
            }
          }
        }

        const replicationState = setupCollectionReplication(config);
        this.replicationStates.set(
          config.replicationIdentifier,
          replicationState,
        );

        // Log initial active state
        const initialActive =
          (replicationState as any).active$?.getValue?.() ?? false;
        console.log(
          `✅ [ReplicationManager] Replication initialized: ${config.name} (active: ${initialActive})`,
        );
      } catch (error) {
        console.error(
          `❌ [ReplicationManager] Failed to initialize replication: ${config.name}`,
          error,
        );
      }
    }

    // Replications with autoStart: true will start automatically
    // No need to manually call startSecondary() or startPrimary()
    if (useSecondary) {
      console.log(
        '✅ [ReplicationManager] Secondary replications initialized with autoStart: true',
      );
    } else {
      console.log(
        '✅ [ReplicationManager] Primary replications initialized with autoStart: true',
      );
    }

    // Notify replication monitor about state changes
    setTimeout(() => this.notifyReplicationMonitor(), 500);
  }

  /**
   * Start secondary replications (without canceling primary)
   * Use this when server is down at runtime - don't cancel inactive primary replications
   */
  async startSecondary(): Promise<void> {
    console.log('🔄 [ReplicationManager] Starting secondary replications...');

    for (const identifier of SECONDARY_IDENTIFIERS) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        try {
          // Check if replication is already active
          const isActive = (state as any).active$?.getValue?.() ?? false;

          if (!isActive) {
            // If not active, start it first
            if (typeof (state as any).start === 'function') {
              await (state as any).start();
              console.log(
                `✅ [ReplicationManager] Started secondary: ${identifier}`,
              );
            } else {
              // Fallback: use reSync if start() is not available
              state.reSync();
              console.log(
                `✅ [ReplicationManager] Re-synced secondary: ${identifier}`,
              );
            }
          } else {
            // Already active, just re-sync
            state.reSync();
            console.log(
              `✅ [ReplicationManager] Re-synced active secondary: ${identifier}`,
            );
          }
        } catch (error: any) {
          console.error(
            `❌ [ReplicationManager] Error starting secondary ${identifier}:`,
            error.message,
          );
        }
      } else {
        console.warn(
          `⚠️ [ReplicationManager] Secondary replication not found: ${identifier}`,
        );
      }
    }
  }

  /**
   * Start primary replications (without canceling secondary)
   * Use this when initializing with primary available
   */
  async startPrimary(): Promise<void> {
    console.log('🔄 [ReplicationManager] Starting primary replications...');

    for (const identifier of PRIMARY_IDENTIFIERS) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        // Re-sync to start replication
        state.reSync();
        console.log(`✅ [ReplicationManager] Started primary: ${identifier}`);
      } else {
        console.warn(
          `⚠️ [ReplicationManager] Primary replication not found: ${identifier}`,
        );
      }
    }
  }

  /**
   * Switch all replications from primary to secondary
   * Use this when server goes down at runtime (after initial startup)
   */
  async switchToSecondary(): Promise<void> {
    console.log(
      '🔄 [ReplicationManager] Switching to secondary replications...',
    );

    // Cancel all primary replications (only if they are active)
    await this.cancelPrimaryReplications();

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Start secondary replications
    await this.startSecondary();

    // Notify replication monitor about state changes
    setTimeout(() => this.notifyReplicationMonitor(), 200);
  }

  /**
   * Switch all replications from secondary back to primary
   * Use this when primary server recovers at runtime
   */
  async switchToPrimary(): Promise<void> {
    console.log('🔄 [ReplicationManager] Switching to primary replications...');

    // Cancel all secondary replications (only if they are active)
    await this.cancelSecondaryReplications();

    // Wait a bit for cleanup
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Start primary replications
    await this.startPrimary();

    // Notify replication monitor about state changes
    setTimeout(() => this.notifyReplicationMonitor(), 200);
  }

  /**
   * Cancel all secondary replications (keep primary active)
   */
  private async cancelSecondaryReplications(): Promise<void> {
    for (const identifier of SECONDARY_IDENTIFIERS) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        try {
          // Check if replication was started before canceling
          const wasStarted =
            (state as any).wasStarted ?? (state as any)._wasStarted ?? false;
          if (wasStarted) {
            await state.cancel();
            console.log(
              `🛑 [ReplicationManager] Cancelled secondary: ${identifier}`,
            );
          } else {
            console.log(
              `⏭️ [ReplicationManager] Secondary replication not started, skipping cancel: ${identifier}`,
            );
          }
        } catch (error: any) {
          console.warn(
            `⚠️ [ReplicationManager] Error cancelling secondary ${identifier}:`,
            error.message,
          );
        }
      } else {
        console.warn(
          `⚠️ [ReplicationManager] Secondary replication not found in map: ${identifier}`,
        );
      }
    }
  }

  /**
   * Cancel all primary replications (keep secondary active)
   */
  private async cancelPrimaryReplications(): Promise<void> {
    for (const identifier of PRIMARY_IDENTIFIERS) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        try {
          await state.cancel();
          console.log(
            `🛑 [ReplicationManager] Cancelled primary: ${identifier}`,
          );
        } catch (error: any) {
          console.warn(
            `⚠️ [ReplicationManager] Error cancelling primary ${identifier}:`,
            error.message,
          );
        }
      } else {
        console.warn(
          `⚠️ [ReplicationManager] Primary replication not found in map: ${identifier}`,
        );
      }
    }
  }

  /**
   * Get replication state by identifier
   */
  getReplicationState(
    identifier: string,
  ): RxGraphQLReplicationState<any, any> | null {
    return this.replicationStates.get(identifier) || null;
  }

  /**
   * Get all replication states
   */
  getAllReplicationStates(): Map<string, RxGraphQLReplicationState<any, any>> {
    return this.replicationStates;
  }

  /**
   * Stop all replications (for cleanup on app destroy)
   * Note: Don't check active$ - it only indicates if pull/push is currently running
   * We need to cancel all replications regardless of active$ state
   */
  async stopReplication(): Promise<void> {
    console.log('🛑 [ReplicationManager] Stopping all replications...');
    const allStates = Array.from(this.replicationStates.values());

    // Cancel all replications - don't check active$ state
    // active$ only shows if pull/push operations are currently running
    // Replication may be waiting for next cycle even if active$ is false
    for (const state of allStates) {
      try {
        // Check if replication was started before canceling
        const wasStarted =
          (state as any).wasStarted ?? (state as any)._wasStarted ?? false;
        if (wasStarted) {
          await state.cancel();
        } else {
          console.log(
            '⏭️ [ReplicationManager] Replication not started, skipping cancel',
          );
        }
      } catch (error: any) {
        // Ignore errors if replication is already cancelled or not started
        console.warn(
          '⚠️ [ReplicationManager] Error cancelling replication (may already be stopped):',
          error.message,
        );
      }
    }

    // Clear replication states map
    this.replicationStates.clear();
    console.log('✅ [ReplicationManager] All replications stopped');

    // Notify replication monitor about state changes
    this.notifyReplicationMonitor();
  }

  /**
   * Reinitialize replications (public method for reconnecting after offline)
   * Checks server availability and starts appropriate replications
   * @param db - RxDatabase instance
   * @param checkConnectionFn - Function to check server connection
   * @param serverId - Server ID for replication
   * @param deviceEventFacade - DeviceEventFacade instance for creating device events
   * @param emitPrimaryRecoveryFn - Function to emit primary recovery event
   */
  async reinitializeReplications(
    db: RxDatabase<DatabaseCollections>,
    checkConnectionFn: (url: string) => Promise<boolean>,
    serverId: string,
    deviceEventFacade: DeviceEventFacade,
    emitPrimaryRecoveryFn: () => Promise<void>,
  ): Promise<void> {
    const primaryAvailable = await checkConnectionFn(environment.apiUrl);
    let useSecondary = false;

    if (!primaryAvailable) {
      // Check secondary server availability
      const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
      const secondaryAvailable = await checkConnectionFn(secondaryUrl);

      if (!secondaryAvailable) {
        console.warn(
          '⚠️ [ReplicationManager] Both primary and secondary servers are unavailable!',
        );
        // Stop all replications gracefully instead of throwing error (offline-first behavior)
        await this.stopAllReplicationsGracefully();
        return;
      }

      useSecondary = true;
      // Set global flag for other services to use
      (window as any).__USE_SECONDARY_SERVER__ = true;
    } else {
      // Primary is available, clear the flag
      (window as any).__USE_SECONDARY_SERVER__ = false;
    }

    // Reinitialize using the same logic as initial setup
    await this.initializeReplications(
      db,
      useSecondary,
      serverId,
      deviceEventFacade,
      emitPrimaryRecoveryFn,
    );
    console.log('✅ [ReplicationManager] Replications reinitialized');

    // Notify replication monitor about state changes
    setTimeout(() => this.notifyReplicationMonitor(), 500);
  }
}
