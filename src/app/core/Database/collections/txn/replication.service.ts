import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { RxTxnCollection } from './types';
import { RxTxnDocumentType } from './schema';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { ClientIdentityService } from '../../../identity/client-identity.service';
import { BaseReplicationService } from '../../core/base/base-replication.service';
import { ReplicationConfig } from '../../core/adapter';
import {
  ReplicationConfigBuilder,
  ReplicationConfigOptions,
} from '../../core/config/replication-config-builder';
import {
  PUSH_TRANSACTION_MUTATION,
  PULL_TRANSACTION_QUERY,
  STREAM_TRANSACTION_SUBSCRIPTION,
} from './query-builder';
import { environment } from 'src/environments/environment';
import { DeviceMonitoringHistoryFacade } from '../device-monitoring-history/facade.service';
import { DeviceMonitoringFacade } from '../device-monitoring/facade.service';
import { ReplicationFailoverService } from '../../core/services/replication-failover.service';

/**
 * Transaction-specific GraphQL replication service
 * Extends BaseReplicationService for transaction collection replication
 *
 * Features:
 * - Dynamic checkpoint switching (server_updated_at for 10102, cloud_updated_at for 3001)
 * - Automatic failover detection and switching
 * - Device status-based primary recovery (NEW: replaces HTTP health checks)
 * - WebSocket connection monitoring and retry logic
 */
@Injectable({
  providedIn: 'root',
})
export class TransactionReplicationService extends BaseReplicationService<RxTxnDocumentType> {
  private wsRetryCount = 0;
  private isConnected = false;
  private lastConnectedTime = 0;
  private readonly CONNECTION_DEBOUNCE_MS = 5000; // 5 seconds debounce
  private connectionProcessingPromise: Promise<void> | null = null;

  constructor(
    networkStatus: NetworkStatusService,
    private readonly identity: ClientIdentityService,
    private readonly deviceMonitoringHistoryFacade: DeviceMonitoringHistoryFacade,
    private readonly deviceMonitoringFacade: DeviceMonitoringFacade,
    private readonly failoverService: ReplicationFailoverService,
  ) {
    super(networkStatus);
    this.collectionName = 'txn';
  }

  /**
   * Handle connected event (separate method to prevent concurrent processing)
   */
  private async handleConnected(event: any, timestamp: number): Promise<void> {
    // Mark as connected and update timestamp
    this.isConnected = true;
    this.lastConnectedTime = timestamp;

    // Reset retry count on successful connection
    this.wsRetryCount = 0;

    try {
      // Check last entry with type='primary-server-connect' to avoid duplicates
      const lastEntry = await this.deviceMonitoringHistoryFacade.getLastByType(
        'primary-server-connect',
      );

      // Only append if last entry is not already 'PRIMARY_SERVER_CONNECT'
      // or if there's no previous entry
      if (!lastEntry || lastEntry.status !== 'PRIMARY_SERVER_CONNECT') {
        await this.deviceMonitoringHistoryFacade.appendPrimaryServerConnectedRev();
        console.log(
          'WebSocket connected (status changed):',
          event,
          `retryCount: ${this.wsRetryCount}`,
          `lastStatus: ${lastEntry?.status || 'none'}`,
        );
      } else {
        console.log(
          'WebSocket connected (already connected, skipping append):',
          event,
          `retryCount: ${this.wsRetryCount}`,
          `lastStatus: ${lastEntry.status}`,
        );
      }

      // Check if we're on secondary and primary is back, switch back to primary
      if (this.failoverService.isOnSecondary()) {
        console.log(
          '🔄 [TxnReplication] Connected while on secondary, will monitor device status for primary recovery...',
        );
      }
    } catch (error) {
      console.error(
        'Error checking/appending primary server connected rev:',
        error,
      );
      // Don't mark as disconnected on error - connection is still valid
    }
  }

  /**
   * Build replication configuration for adapter
   * Uses ReplicationConfigBuilder to reduce code duplication
   */
  protected buildReplicationConfig(): ReplicationConfig & Record<string, any> {
    // Use currentUrls if set (for failover), otherwise use environment defaults
    const urls = this.currentUrls || undefined;

    const options: ReplicationConfigOptions = {
      collectionName: 'txn',
      replicationId: this.replicationIdentifier,
      batchSize: 5,
      urls: urls, // Pass URLs for failover support
      pullQueryBuilder: (checkpoint: any, limit: number) => {
        // Use dynamic checkpoint and query based on current URL
        const currentUrl =
          this.currentUrls?.http || urls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          PULL_TRANSACTION_QUERY,
          currentUrl,
        );
        return {
          query: modifiedQuery,
          variables: {
            input: {
              checkpoint: ReplicationConfigBuilder.buildCheckpointInputForUrl(
                checkpoint,
                currentUrl,
              ),
              limit: limit || 5,
            },
          },
        };
      },
      streamQueryBuilder: (headers: any) => {
        // Use dynamic query based on current URL
        const currentUrl =
          this.currentUrls?.http || urls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          STREAM_TRANSACTION_SUBSCRIPTION,
          currentUrl,
        );
        return {
          query: modifiedQuery,
          variables: {},
        };
      },
      responseModifier: (() => {
        const currentUrl =
          this.currentUrls?.http || urls?.http || environment.apiUrl;
        return ReplicationConfigBuilder.createResponseModifierForUrl(
          ['pullTransaction', 'streamTransaction'],
          currentUrl,
        );
      })(),
      pullModifier: (doc: any) => {
        if (doc.status === 'OUT') {
          return {
            ...doc,
            _deleted: true,
          };
        }
        return {
          ...doc,
          door_permission:
            typeof doc.door_permission === 'string'
              ? doc.door_permission.split(',').map((s: any) => s.trim())
              : doc.door_permission,
        };
      },
      wsOnEvents: {
        closed: async (event: any) => {
          // Mark as disconnected when closed
          this.isConnected = false;

          const eventCode = event.code;
          // Increment retry count only for abnormal closures (1006)
          if (eventCode === 1006) {
            this.wsRetryCount++;
            // Only log to monitoring after 5 consecutive failures
            if (this.wsRetryCount >= 6) {
              await this.deviceMonitoringHistoryFacade.appendPrimaryServerDownRev(
                event.code,
                event.reason,
              );
              await this.deviceMonitoringFacade.handlePrimaryServerDown();

              // Trigger failover to secondary server
              console.log(
                '🔄 [TxnReplication] Primary server down, triggering failover...',
              );
              try {
                await this.failoverService.switchToSecondary();
              } catch (failoverError) {
                console.error(
                  '❌ [TxnReplication] Failover error:',
                  failoverError,
                );
              }
            }
          } else {
            this.wsRetryCount = 0;
          }
          console.log(
            'WebSocket closed:',
            event,
            `retryCount: ${this.wsRetryCount}`,
          );
        },
        connected: async (event: any) => {
          const now = Date.now();

          // Debounce: Only process if not already connected or if enough time has passed
          if (
            this.isConnected &&
            now - this.lastConnectedTime < this.CONNECTION_DEBOUNCE_MS
          ) {
            console.log(
              'WebSocket connected (debounced, already connected recently):',
              event,
              `retryCount: ${this.wsRetryCount}`,
            );
            return;
          }

          // If already processing a connection, wait for it to complete
          if (this.connectionProcessingPromise) {
            console.log(
              'WebSocket connected (already processing, waiting):',
              event,
            );
            await this.connectionProcessingPromise;
            return;
          }

          // Process connection (prevent concurrent processing)
          this.connectionProcessingPromise = this.handleConnected(event, now);
          try {
            await this.connectionProcessingPromise;
          } finally {
            this.connectionProcessingPromise = null;
          }
        },
      },
      wsConnectionParams: async () => {
        const client_id = await this.identity.getClientId();
        const client_type = this.identity.getClientType();
        return {
          id: client_id,
          client_type,
          door_id: client_id,
        };
      },
      connectionAckWaitTimeout: 1000,
      pushQueryBuilder: (docs: any[]) => {
        const writeRows = docs.map((docRow) => {
          const doc = docRow.newDocumentState;
          return {
            newDocumentState: {
              id: doc.id,
              name: doc.name,
              id_card_base64: doc.id_card_base64,
              student_number: doc.student_number,
              register_type: doc.register_type,
              door_permission: Array.isArray(doc.door_permission)
                ? doc.door_permission.join(',')
                : doc.door_permission,
              status: doc.status,
              client_created_at: doc.client_created_at || Date.now().toString(),
              client_updated_at: doc.client_updated_at || Date.now().toString(),
              server_created_at: doc.server_created_at,
              server_updated_at: doc.server_updated_at,
              diff_time_create: doc.diff_time_create || '0',
              diff_time_update: doc.diff_time_update || '0',
              deleted: docRow.assumedMasterState === null,
            },
          };
        });
        return {
          query: PUSH_TRANSACTION_MUTATION,
          variables: {
            writeRows,
          },
        };
      },
      pushDataPath: 'data.pushTransaction',
      pushModifier: (doc: any) => doc,
    };

    return ReplicationConfigBuilder.buildBaseConfig(options);
  }

  /**
   * Setup transaction-specific GraphQL replication (legacy direct method)
   */
  protected async setupReplicationDirectWithUrl(
    collection: RxCollection,
  ): Promise<RxGraphQLReplicationState<RxTxnDocumentType, any> | undefined> {
    const txnCollection = collection as unknown as RxTxnCollection;

    console.log(`Setting up Transaction GraphQL replication (direct mode)...`);

    // Check if app is online before starting replication
    if (!this.networkStatus.isOnline()) {
      console.log('⚠️ Application is offline - replication setup skipped');
      console.log(
        '📝 Replication will start automatically when connection is restored',
      );
      return undefined;
    }

    // Apply WebSocket monitoring
    const baseConfig = this.buildReplicationConfig() as any;
    const config = this.applyWebSocketMonitoring(baseConfig);

    // Use currentUrls if set (for failover), otherwise use config.url or environment defaults
    const url = this.currentUrls
      ? { http: this.currentUrls.http, ws: this.currentUrls.ws }
      : config.url || { http: environment.apiUrl, ws: environment.wsUrl };

    console.log(
      `🔄 [TxnReplication] Using checkpoint field: ${ReplicationConfigBuilder.getTimestampFieldForUrl(url.http)} for URL: ${url.http}`,
    );

    const replicationOptions: any = {
      collection: txnCollection as any,
      replicationIdentifier: this.replicationIdentifier || config.replicationId,
      url: url,
      ...config,
    };

    // Reset connection state when setting up new replication
    this.isConnected = false;
    this.lastConnectedTime = 0;
    this.connectionProcessingPromise = null;

    this.replicationState = replicateGraphQL<RxTxnDocumentType, any>(
      replicationOptions,
    );

    if (this.replicationState) {
      // Setup error handler
      this.setupReplicationErrorHandler(this.replicationState);

      // Monitor replication events และ device status สำหรับ primary recovery
      this.replicationState.received$.subscribe(async (received) => {
        console.log('✅ Transaction Replication received:', received);

        // New system: Check device status when receiving data from cloud (3001)
        // This replaces the old HTTP health check polling mechanism
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        if (
          currentUrl.includes(':3001') &&
          this.failoverService.isOnSecondary()
        ) {
          await this.checkDeviceStatusForPrimaryRecovery();
        }
      });

      this.replicationState.sent$.subscribe((sent) => {
        console.log('📤 Transaction Replication sent:', sent);
      });

      // Wait for initial replication with timeout and error handling
      // This allows app to continue working even if server is down
      try {
        await Promise.race([
          this.replicationState.awaitInitialReplication(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Initial replication timeout')),
              10000,
            ),
          ),
        ]);
        console.log('✅ Initial transaction replication completed');
      } catch (error: any) {
        // Server might be down - app continues to work offline
        console.warn(
          '⚠️ Initial replication not completed (server may be down):',
          error.message || error,
        );
        console.log(
          '📝 App will continue working offline. Replication will retry automatically.',
        );
      }
    }

    return this.replicationState;
  }

  /**
   * Check device monitoring status for primary server recovery (NEW SYSTEM)
   *
   * Called when receiving data from cloud (3001) to detect if primary server is back online.
   * This replaces the old HTTP health check polling mechanism with a more efficient
   * data-driven approach that monitors actual device status in the database.
   *
   * When serverId='111' status becomes 'online', automatically switches back to primary.
   */
  private async checkDeviceStatusForPrimaryRecovery(): Promise<void> {
    try {
      // Get current device status for serverId from environment
      const serverId = environment.serverId;
      if (!serverId) {
        console.warn(
          '⚠️ [TxnReplication] No serverId configured, skipping device status check',
        );
        return;
      }

      // Query device-monitoring collection for our server
      const deviceStatus =
        await this.deviceMonitoringFacade.getDeviceMonitoringById(serverId);

      if (deviceStatus && deviceStatus.status === 'online') {
        console.log(
          `✅ [TxnReplication] Server ${serverId} is back online, triggering switch to primary...`,
        );

        // Switch back to primary server
        await this.failoverService.switchToPrimary();
      } else {
        console.log(
          `⚠️ [TxnReplication] Server ${serverId} status: ${deviceStatus?.status || 'not found'}, staying on secondary`,
        );
      }
    } catch (error) {
      console.error(
        '❌ [TxnReplication] Error checking device status for primary recovery:',
        error,
      );
    }
  }
}
