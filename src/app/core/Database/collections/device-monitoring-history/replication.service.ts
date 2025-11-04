import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { BaseReplicationService } from '../../core/base/base-replication.service';
import { DeviceMonitoringHistoryDocument } from './schema';
import {
  PULL_DEVICE_MONITORING_HISTORY_QUERY,
  PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
  STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION,
} from './query-builder';
import { ClientIdentityService } from '../../../identity/client-identity.service';
import { ReplicationConfig } from '../../core/adapter';
import {
  ReplicationConfigBuilder,
  ReplicationConfigOptions,
} from '../../core/config/replication-config-builder';
import { ReplicationFailoverService } from '../../core/services/replication-failover.service';
import { environment } from 'src/environments/environment';

/**
 * DeviceMonitoringHistory-specific GraphQL replication service
 * Extends BaseReplicationService for device-monitoring-history collection replication
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceMonitoringHistoryReplicationService extends BaseReplicationService<DeviceMonitoringHistoryDocument> {
  private createdBy?: string;
  private wsRetryCount = 0;
  private isConnected = false;

  constructor(
    networkStatus: NetworkStatusService,
    private readonly identity: ClientIdentityService,
    private readonly failoverService: ReplicationFailoverService,
  ) {
    super(networkStatus);
    this.collectionName = 'device_monitoring_history';
  }

  /**
   * Build replication configuration for adapter
   * Uses ReplicationConfigBuilder to reduce code duplication
   * Note: pullModifier uses createdBy from property set in setupReplication
   */
  protected buildReplicationConfig(): ReplicationConfig & Record<string, any> {
    const options: ReplicationConfigOptions = {
      collectionName: 'device_monitoring_history',
      replicationId: this.replicationIdentifier,
      batchSize: 10,
      pullQueryBuilder: (checkpoint, limit) => {
        // Use dynamic checkpoint and query based on current URL
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          PULL_DEVICE_MONITORING_HISTORY_QUERY,
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
              limit: limit || 10,
            },
          },
        };
      },
      streamQueryBuilder: (headers) => {
        // Use dynamic query based on current URL
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION,
          currentUrl,
        );
        return {
          query: modifiedQuery,
          variables: {},
        };
      },
      responseModifier: (() => {
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        return ReplicationConfigBuilder.createResponseModifierForUrl(
          ['pullDeviceMonitoringHistory', 'streamDeviceMonitoringHistory'],
          currentUrl,
        );
      })(),
      pullModifier: (doc) => {
        // Filter by created_by if set (only show history created by this client)
        if (this.createdBy && doc.created_by === this.createdBy) {
          return doc;
        } else if (this.createdBy) {
          // Hide history from other clients
          return {
            ...doc,
            _deleted: true,
          };
        }
        // If createdBy not set yet, show all
        return doc;
      },
      pushQueryBuilder: (docs) => {
        const writeRows = docs.map((docRow) => {
          const doc = docRow.newDocumentState;
          return {
            newDocumentState: {
              id: doc.id,
              device_id: doc.device_id,
              type: doc.type,
              status: doc.status,
              meta_data: doc.meta_data,
              created_by: doc.created_by,
              client_created_at: doc.client_created_at || Date.now().toString(),
              client_updated_at: doc.client_updated_at || Date.now().toString(),
              server_created_at: doc.server_created_at,
              server_updated_at: doc.server_updated_at,
              cloud_created_at: doc.cloud_created_at,
              cloud_updated_at: doc.cloud_updated_at,
              diff_time_create: doc.diff_time_create,
              diff_time_update: doc.diff_time_update,
              // Note: deleted handled by RxDB _deleted, not sent to server
              deleted: doc._deleted,
            },
          };
        });
        return {
          query: PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
          variables: {
            writeRows,
          },
        };
      },
      pushDataPath: 'data.pushDeviceMonitoringHistory',
      pushModifier: (doc) => doc,
      wsConnectionParams: async () => {
        const client_id = await this.identity.getClientId();
        const client_type = this.identity.getClientType();
        return {
          id: client_id,
          client_type,
          door_id: client_id,
        };
      },
      wsOnEvents: {
        closed: async (event: any) => {
          this.isConnected = false;
          const eventCode = event.code;

          if (eventCode === 1006) {
            this.wsRetryCount++;
            console.log(
              `WebSocket closed (DeviceMonitoringHistory): code ${eventCode}, retryCount: ${this.wsRetryCount}`,
            );
          } else {
            this.wsRetryCount = 0;
            console.log(
              `WebSocket closed (DeviceMonitoringHistory): code ${eventCode}`,
            );
          }
        },
        connected: async (event: any) => {
          this.isConnected = true;
          this.wsRetryCount = 0;
          console.log('WebSocket connected (DeviceMonitoringHistory):', event);
        },
        error: (error: any) => {
          console.error('WebSocket error (DeviceMonitoringHistory):', error);
        },
      },
    };

    return ReplicationConfigBuilder.buildBaseConfig(options);
  }

  /**
   * Setup device-monitoring-history-specific GraphQL replication (legacy direct method)
   */
  protected async setupReplicationDirectWithUrl(
    collection: RxCollection,
  ): Promise<
    RxGraphQLReplicationState<DeviceMonitoringHistoryDocument, any> | undefined
  > {
    if (!this.networkStatus.isOnline()) {
      return undefined;
    }

    // Get created_by from identity service
    this.createdBy = (await this.identity.getClientId()) || '';

    const baseConfig = this.buildReplicationConfig() as any;
    const config = this.applyWebSocketMonitoring(baseConfig);

    const url = this.currentUrls
      ? { http: this.currentUrls.http, ws: this.currentUrls.ws }
      : config.url || { http: environment.apiUrl, ws: environment.wsUrl };

    console.log(
      `🔄 [DeviceMonitoringHistory] Using checkpoint field: ${ReplicationConfigBuilder.getTimestampFieldForUrl(url.http)} for URL: ${url.http}`,
    );

    const replicationOptions: any = {
      collection: collection as any,
      replicationIdentifier: this.replicationIdentifier || config.replicationId,
      url: url,
      ...config,
    };
    this.replicationState = replicateGraphQL<
      DeviceMonitoringHistoryDocument,
      any
    >(replicationOptions);

    if (this.replicationState) {
      this.setupReplicationErrorHandler(this.replicationState);
      console.log(
        '🔄 [DeviceMonitoringHistory] Setting up received$ subscription...',
      );

      this.replicationState.received$.subscribe(async (received) => {
        console.log(
          '📥 DeviceMonitoringHistory Replication received:',
          received,
        );

        // Check if we're currently on secondary server and received documents
        if (this.currentUrls?.http?.includes(':3001') && received) {
          console.log(
            '🔍 DeviceMonitoringHistory: On secondary server, checking data:',
            {
              isArray: Array.isArray(received),
              length: Array.isArray(received) ? received.length : 'not array',
              currentUrl: this.currentUrls?.http,
            },
          );
          // received is an array of documents or a single document
          const documents = Array.isArray(received) ? received : [received];
          await this.checkForPrimaryRecoveryConditions(documents);
        }
      });
    }

    return this.replicationState;
  }

  /**
   * Check if received device monitoring history records match conditions for switching to primary
   * Conditions:
   * - device_id matches client_id from identity service
   * - meta_data contains client_name from identity service + " connected"
   * - created_by equals "server"
   */
  private async checkForPrimaryRecoveryConditions(
    documents: any[],
  ): Promise<void> {
    try {
      const clientId = await this.identity.getClientId();
      const clientName = await this.identity.getClientName();

      if (!clientId || !clientName) {
        console.log(
          '⚠️ [DeviceMonitoringHistory] Missing client identity, skipping primary recovery check',
        );
        return;
      }

      const expectedMetaData = `${clientName} connected`;

      for (const doc of documents) {
        const matchesDeviceId = doc.device_id === clientId;
        const matchesMetaData = doc.meta_data === expectedMetaData;
        const matchesCreatedBy = doc.created_by === 'server';

        console.log(
          '🔍 [DeviceMonitoringHistory] Checking primary recovery conditions:',
          {
            document_id: doc.id,
            device_id: doc.device_id,
            expected_device_id: clientId,
            matches_device_id: matchesDeviceId,
            meta_data: doc.meta_data,
            expected_meta_data: expectedMetaData,
            matches_meta_data: matchesMetaData,
            created_by: doc.created_by,
            matches_created_by: matchesCreatedBy,
          },
        );

        if (matchesDeviceId && matchesMetaData && matchesCreatedBy) {
          console.log(
            '✅ [DeviceMonitoringHistory] Primary recovery conditions met! Switching to primary server...',
          );
          await this.failoverService.switchToPrimary();
          return; // Exit after first match
        }
      }
    } catch (error) {
      console.error(
        '❌ [DeviceMonitoringHistory] Error checking primary recovery conditions:',
        error,
      );
    }
  }
}
