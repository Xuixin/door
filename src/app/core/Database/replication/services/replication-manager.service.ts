import { Injectable, inject, Injector } from '@angular/core';
import { RxDatabase, RxCollection } from 'rxdb';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { removeGraphQLWebSocketRef } from 'rxdb/plugins/replication-graphql';
import { environment } from 'src/environments/environment';
import {
  setupCollectionReplication,
  ReplicationConfig,
} from './replication-helper';
import { createReplicationConfigs } from '../config';
import { PRIMARY_IDENTIFIERS, SECONDARY_IDENTIFIERS } from '../constants';
import { isPrimaryIdentifier, isSecondaryIdentifier } from '../utils';
import { DeviceEventFacade } from '../../collection/device-event/facade.service';
import { ReplicationCoordinatorService } from '../../services/replication-coordinator.service';

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
  private injector = inject(Injector);

  // State tracking
  private _isStarted: boolean = false;
  private _currentServerType: 'primary' | 'secondary' | null = null;

  /**
   * Get wasStarted flag from replication state
   */
  private getWasStarted(state: RxGraphQLReplicationState<any, any>): boolean {
    return (state as any).wasStarted ?? (state as any)._wasStarted ?? false;
  }

  /**
   * Set wasStarted flag on replication state
   */
  private setWasStarted(
    state: RxGraphQLReplicationState<any, any>,
    value: boolean,
  ): void {
    (state as any).wasStarted = value;
    (state as any)._wasStarted = value;
  }

  /**
   * Close WebSocket connection if needed
   * Only closes if replication was started (wasStarted check)
   */
  private async closeReplicationWebSocketIfNeeded(
    state: RxGraphQLReplicationState<any, any>,
  ): Promise<void> {
    // Check if replication was started before closing WebSocket
    const wasStarted = this.getWasStarted(state);
    if (!wasStarted) {
      return; // Don't close WebSocket if replication was never started
    }

    const wsUrl = (state as any).url?.ws;
    if (wsUrl) {
      await this.closeReplicationWebSocket(wsUrl);
    }
  }

  /**
   * Handle replication cancel error
   */
  private handleReplicationCancelError(error: any, identifier: string): void {
    if (
      error?.message?.includes('is closed') ||
      error?.message?.includes('RxStorageInstance')
    ) {
      console.warn(
        `⚠️ [ReplicationManager] Storage already closed for ${identifier}, skipping cancel`,
      );
    } else {
      throw error;
    }
  }

  /**
   * Cancel a single replication
   */
  private async cancelSingleReplication(
    identifier: string,
    state: RxGraphQLReplicationState<any, any>,
  ): Promise<void> {
    try {
      // Check if replication was started before closing WebSocket
      const wasStarted = this.getWasStarted(state);

      if (wasStarted) {
        // Close WebSocket connection if needed (only if was started)
        await this.closeReplicationWebSocketIfNeeded(state);

        // Wait a bit to ensure WebSocket is fully closed before canceling
        await new Promise((resolve) => setTimeout(resolve, 200));

        try {
          await state.cancel();
          // Reset wasStarted flag after canceling
          this.setWasStarted(state, false);
          console.log(
            `✅ [ReplicationManager] Cancelled replication: ${identifier}`,
          );
        } catch (cancelError: any) {
          this.handleReplicationCancelError(cancelError, identifier);
        }
      }
    } catch (error: any) {
      // Handle errors gracefully
      if (
        error?.message?.includes('is closed') ||
        error?.message?.includes('RxStorageInstance')
      ) {
        console.warn(
          `⚠️ [ReplicationManager] Storage already closed for replication, skipping`,
        );
      } else {
        console.warn(
          `⚠️ [ReplicationManager] Error cancelling replication ${identifier}:`,
          error.message,
        );
      }
    }
  }

  /**
   * Close WebSocket connection for a replication
   * Uses RxDB's removeGraphQLWebSocketRef to properly close WebSocket
   * @param wsUrl - WebSocket URL to close
   * @returns Promise that resolves when WebSocket is closed
   */
  private async closeReplicationWebSocket(wsUrl: string): Promise<void> {
    try {
      // Remove WebSocket reference - this will close the connection if refCount reaches 0
      // Use queueMicrotask to prevent blocking
      await new Promise<void>((resolve) => {
        queueMicrotask(() => {
          try {
            removeGraphQLWebSocketRef(wsUrl);
            console.log(`🔌 [ReplicationManager] Closed WebSocket: ${wsUrl}`);
            // Wait a bit to ensure WebSocket is closed
            setTimeout(() => resolve(), 100);
          } catch (error: any) {
            // WebSocket might already be closed or not exist
            console.warn(
              `⚠️ [ReplicationManager] Error closing WebSocket ${wsUrl}:`,
              error.message,
            );
            resolve(); // Resolve anyway to continue
          }
        });
      });
    } catch (error: any) {
      console.warn(
        `⚠️ [ReplicationManager] Error in closeReplicationWebSocket:`,
        error.message,
      );
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
   * Check server status and return which server can be used
   * @returns Promise<'primary' | 'secondary' | 'bothDown'>
   */
  async checkServerStatus(): Promise<'primary' | 'secondary' | 'bothDown'> {
    const primaryAvailable = await this.checkServerAvailability(
      environment.apiUrl,
    );
    if (primaryAvailable) {
      return 'primary';
    }

    const secondaryUrl = environment.apiSecondaryUrl || environment.apiUrl;
    const secondaryAvailable = await this.checkServerAvailability(secondaryUrl);
    if (secondaryAvailable) {
      return 'secondary';
    }

    return 'bothDown';
  }

  /**
   * Get current started state
   */
  isStarted(): boolean {
    return this._isStarted;
  }

  /**
   * Get current server type
   */
  getCurrentServerType(): 'primary' | 'secondary' | null {
    return this._currentServerType;
  }

  /**
   * Check if replication can be closed/stopped
   */
  canClose(): boolean {
    return this._isStarted;
  }

  /**
   * Check if replication can be started
   */
  canStart(): boolean {
    return !this._isStarted || this.replicationStates.size === 0;
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
      await this.stopReplication();
    }

    // Create replication configs using the config factory
    const replicationConfigs = createReplicationConfigs(
      db,
      serverId,
      deviceEventFacade,
      emitPrimaryRecoveryFn,
    );

    // Set autoStart=false for all replications - will be started explicitly via startReplication()
    // Initialize all replications
    for (const config of replicationConfigs) {
      try {
        config.autoStart = false;

        // Use lazy injection to avoid circular dependency
        const replicationCoordinator = this.injector.get(
          ReplicationCoordinatorService,
        );
        const replicationState = setupCollectionReplication(
          config,
          replicationCoordinator,
        );

        // Track wasStarted flag - will be set to true when actually started
        this.setWasStarted(replicationState, false);

        this.replicationStates.set(
          config.replicationIdentifier,
          replicationState,
        );
      } catch (error) {
        console.error(
          `❌ [ReplicationManager] Failed to initialize replication: ${config.name}`,
          error,
        );
      }
    }

    const status = await this.checkServerStatus();
    if (status === 'primary') {
      await this.startReplication('primary');
    } else if (status === 'secondary') {
      await this.startReplication('secondary');
    } else {
      console.warn(
        '⚠️ [ReplicationManager] Both servers down, cannot start replication',
      );
    }
  }

  /**
   * Get replication states data for logging
   * Returns array of objects with replication identifier and active status
   */
  getReplicationStatesData(): Array<{ [key: string]: boolean }> {
    const statesData: Array<{ [key: string]: boolean }> = [];

    Array.from(this.replicationStates.entries()).forEach(
      ([identifier, state]) => {
        const isActive = (state as any).active$?.getValue?.() ?? false;
        const wasStarted = this.getWasStarted(state);
        statesData.push({
          [identifier]: isActive || wasStarted,
        });
      },
    );

    return statesData;
  }

  /**
   * Log replication states data
   */
  logReplicationStates(): void {
    const statesData = this.getReplicationStatesData();
    console.log('📊 [ReplicationManager] Summary:', {
      total: statesData.length,
      started: this._isStarted,
      serverType: this._currentServerType,
      states: statesData,
    });
  }

  /**
   * Start replication - single entry point with state checking
   * @param serverType - 'primary' or 'secondary', if not provided will check server status
   */
  async startReplication(serverType?: 'primary' | 'secondary'): Promise<void> {
    // Check if already started with same server type
    if (this._isStarted && this._currentServerType === serverType) {
      console.log(
        `⏭️ [ReplicationManager] Already started with ${serverType}, skipping`,
      );
      return;
    }

    // If no serverType provided, check server status
    if (!serverType) {
      const status = await this.checkServerStatus();
      if (status === 'bothDown') {
        console.warn(
          '⚠️ [ReplicationManager] Both servers down, cannot start replication',
        );
        return;
      }
      serverType = status;
    }

    // If already started with different server type, stop current first
    if (this._isStarted && this._currentServerType !== serverType) {
      console.log(
        `🔄 [ReplicationManager] Switching from ${this._currentServerType} to ${serverType}...`,
      );
      await this.stopReplication();
      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Check if replication states exist
    if (this.replicationStates.size === 0) {
      console.warn(
        '⚠️ [ReplicationManager] No replication states found, cannot start. Reinitialization required.',
      );
      // Reset state flags since states are cleared
      this._isStarted = false;
      this._currentServerType = null;
      return;
    }

    // Start replications
    await this._startReplicationsByIdentifiers(
      serverType === 'primary' ? PRIMARY_IDENTIFIERS : SECONDARY_IDENTIFIERS,
      serverType,
    );

    // Update state
    this._isStarted = true;
    this._currentServerType = serverType;
  }

  /**
   * Start replications by identifiers (internal helper)
   */
  private async _startReplicationsByIdentifiers(
    identifiers: readonly string[],
    serverType: 'primary' | 'secondary',
  ): Promise<void> {
    console.log(
      `🔄 [ReplicationManager] Starting ${serverType} replications...`,
    );

    for (const identifier of identifiers) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        try {
          // Check if replication was already started
          const wasStarted = this.getWasStarted(state);

          if (wasStarted) {
            console.log(
              `⏭️ [ReplicationManager] ${serverType} replication ${identifier} already started, skipping`,
            );
            continue;
          }

          if (serverType === 'secondary') {
            // For secondary, check if replication is already active
            const isActive = (state as any).active$?.getValue?.() ?? false;

            if (!isActive) {
              // If not active, try to start it first
              if (typeof (state as any).start === 'function') {
                await (state as any).start();
                this.setWasStarted(state, true);
                console.log(
                  `✅ [ReplicationManager] Started ${serverType}: ${identifier}`,
                );
              } else {
                // Fallback: use reSync if start() is not available
                state.reSync();
                this.setWasStarted(state, true);
                console.log(
                  `✅ [ReplicationManager] Re-synced ${serverType}: ${identifier}`,
                );
              }
            } else {
              // Already active, just re-sync and track wasStarted
              state.reSync();
              this.setWasStarted(state, true);
              console.log(
                `✅ [ReplicationManager] Re-synced active ${serverType}: ${identifier}`,
              );
            }
          } else {
            // For primary, just re-sync to start replication
            state.reSync();
            this.setWasStarted(state, true);
            console.log(
              `✅ [ReplicationManager] Started ${serverType}: ${identifier}`,
            );
          }
        } catch (error: any) {
          console.error(
            `❌ [ReplicationManager] Error starting ${serverType} ${identifier}:`,
            error.message,
          );
        }
      } else {
        console.warn(
          `⚠️ [ReplicationManager] ${serverType} replication not found: ${identifier}`,
        );
      }
    }
  }

  /**
   * Cancel replications by identifiers
   */
  private async cancelReplicationsByIdentifiers(
    identifiers: readonly string[],
    serverType: 'primary' | 'secondary',
  ): Promise<void> {
    for (const identifier of identifiers) {
      const state = this.replicationStates.get(identifier);
      if (state) {
        await this.cancelSingleReplication(identifier, state);
      } else {
        console.warn(
          `⚠️ [ReplicationManager] ${serverType} replication not found in map: ${identifier}`,
        );
      }
    }
  }

  /**
   * Cancel all secondary replications (keep primary active)
   */
  private async cancelSecondaryReplications(): Promise<void> {
    await this.cancelReplicationsByIdentifiers(
      SECONDARY_IDENTIFIERS,
      'secondary',
    );
  }

  /**
   * Cancel all primary replications (keep secondary active)
   */
  private async cancelPrimaryReplications(): Promise<void> {
    await this.cancelReplicationsByIdentifiers(PRIMARY_IDENTIFIERS, 'primary');
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
   * Stop all replications - single entry point with state checking
   * Note: Don't check active$ - it only indicates if pull/push is currently running
   * We need to cancel all replications regardless of active$ state
   */
  async stopReplication(): Promise<void> {
    // Check if already stopped
    if (!this._isStarted) {
      console.log(
        '⏭️ [ReplicationManager] Already stopped, skipping stop operation',
      );
      return;
    }

    console.log('🛑 [ReplicationManager] Stopping all replications...');
    const allStates = Array.from(this.replicationStates.entries());

    // Cancel all replications - don't check active$ state
    // active$ only shows if pull/push operations are currently running
    // Replication may be waiting for next cycle even if active$ is false
    for (const [identifier, state] of allStates) {
      await this.cancelSingleReplication(identifier, state);
    }

    // Update state
    this._isStarted = false;
    this._currentServerType = null;

    // Clear replication states map
    this.replicationStates.clear();
    console.log('✅ [ReplicationManager] All replications stopped');
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
        console.log(
          '⚠️ [ReplicationManager] Both primary and secondary servers are unavailable!',
        );

        useSecondary = false;
      } else {
        useSecondary = true;
        // Set global flag for other services to use
        (window as any).__USE_SECONDARY_SERVER__ = true;
      }
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
  }
}
