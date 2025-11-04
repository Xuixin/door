import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { NetworkStatusService } from '../../core/services/network-status.service';
import { BaseReplicationService } from '../../core/base/base-replication.service';
import { DeviceMonitoringDocument } from './schema';
import {
  PUSH_DEVICE_MONITORING_MUTATION,
  PULL_DEVICE_MONITORING_QUERY,
  STREAM_DEVICE_MONITORING_SUBSCRIPTION,
} from './query-builder';
import { ReplicationConfig } from '../../core/adapter';
import {
  ReplicationConfigBuilder,
  ReplicationConfigOptions,
} from '../../core/config/replication-config-builder';
import { ReplicationFailoverService } from '../../core/services/replication-failover.service';
import { environment } from 'src/environments/environment';
import { ClientIdentityService } from 'src/app/core/identity/client-identity.service';

/**
 * DeviceMonitoring-specific GraphQL replication service
 * Extends BaseReplicationService for device-monitoring collection replication
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceMonitoringReplicationService extends BaseReplicationService<DeviceMonitoringDocument> {
  private wsRetryCount = 0;
  private isConnected = false;

  constructor(
    networkStatus: NetworkStatusService,
    private readonly identity: ClientIdentityService,
    private readonly failoverService: ReplicationFailoverService,
  ) {
    super(networkStatus);
    this.collectionName = 'device_monitoring';
  }

  /**
   * Build replication configuration for adapter
   * Uses ReplicationConfigBuilder to reduce code duplication
   */
  protected buildReplicationConfig(): ReplicationConfig & Record<string, any> {
    const options: ReplicationConfigOptions = {
      collectionName: 'device_monitoring',
      replicationId: this.replicationIdentifier,
      batchSize: 10,
      pullQueryBuilder: (checkpoint, limit) => {
        // Use dynamic checkpoint and query based on current URL
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          PULL_DEVICE_MONITORING_QUERY,
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
              // Note: No where clause - replication pulls all devices
              // Device filtering by type is done in DeviceApiService for device selection
            },
          },
        };
      },
      streamQueryBuilder: (headers) => {
        // Use dynamic query based on current URL
        const currentUrl = this.currentUrls?.http || environment.apiUrl;
        const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
          STREAM_DEVICE_MONITORING_SUBSCRIPTION,
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
          ['pullDeviceMonitoring', 'streamDeviceMonitoring'],
          currentUrl,
        );
      })(),
      pullModifier: (doc) => {
        // No deleted field - RxDB uses _deleted internally
        return doc;
      },
      pushQueryBuilder: (docs) => {
        const writeRows = docs.map((docRow) => {
          const doc = docRow.newDocumentState;
          return {
            newDocumentState: {
              id: doc.id,
              name: doc.name,
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
            },
          };
        });
        return {
          query: PUSH_DEVICE_MONITORING_MUTATION,
          variables: {
            writeRows,
          },
        };
      },
      pushDataPath: 'data.pushDeviceMonitoring',
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
              `WebSocket closed (DeviceMonitoring): code ${eventCode}, retryCount: ${this.wsRetryCount}`,
            );
          } else {
            this.wsRetryCount = 0;
            console.log(
              `WebSocket closed (DeviceMonitoring): code ${eventCode}`,
            );
          }
        },
        connected: async (event: any) => {
          this.isConnected = true;
          this.wsRetryCount = 0;
          console.log('🔌 WebSocket connected (DeviceMonitoring):', event);
          console.log('🔍 Current URLs:', this.currentUrls);
        },
        error: (error: any) => {
          console.error('WebSocket error (DeviceMonitoring):', error);
        },
      },
    };

    return ReplicationConfigBuilder.buildBaseConfig(options);
  }

  /**
   * Setup device-monitoring-specific GraphQL replication (legacy direct method)
   */
  protected async setupReplicationDirectWithUrl(
    collection: RxCollection,
  ): Promise<
    RxGraphQLReplicationState<DeviceMonitoringDocument, any> | undefined
  > {
    if (!this.networkStatus.isOnline()) {
      return undefined;
    }

    const baseConfig = this.buildReplicationConfig() as any;
    const config = this.applyWebSocketMonitoring(baseConfig);

    // Use currentUrls if set (for failover), otherwise use config.url or environment defaults
    const url = this.currentUrls
      ? { http: this.currentUrls.http, ws: this.currentUrls.ws }
      : config.url || { http: environment.apiUrl, ws: environment.wsUrl };

    console.log(
      `🔄 [DeviceMonitoring] Using checkpoint field: ${ReplicationConfigBuilder.getTimestampFieldForUrl(url.http)} for URL: ${url.http}`,
    );

    const replicationOptions: any = {
      collection: collection as any,
      replicationIdentifier: this.replicationIdentifier || config.replicationId,
      url: url,
      ...config,
    };
    console.log(
      '🚀 [DeviceMonitoring] Creating GraphQL replication with options:',
      {
        url: replicationOptions.url,
        replicationIdentifier: replicationOptions.replicationIdentifier,
      },
    );

    this.replicationState = replicateGraphQL<DeviceMonitoringDocument, any>(
      replicationOptions,
    );

    if (this.replicationState) {
      this.setupReplicationErrorHandler(this.replicationState);
      console.log('🔄 [DeviceMonitoring] Setting up received$ subscription...');

      this.replicationState.received$.subscribe((received) => {
        console.log('📥 DeviceMonitoring Replication received:', received);

        // Check if we're on secondary server and this is real-time data
        if (this.currentUrls?.http?.includes(':3001') && received) {
          console.log('🔍 Received data while on secondary server (3001):', {
            isArray: Array.isArray(received),
            length: Array.isArray(received) ? received.length : 'not array',
            data: received,
          });
        }
      });

      this.replicationState.sent$.subscribe((sent) => {
        console.log('📤 DeviceMonitoring Replication sent:', sent);
      });

      // Note: Database watcher moved to AppComponent for global effect

      console.log(
        '✅ [DeviceMonitoring] GraphQL replication state created successfully',
      );
    } else {
      console.error('❌ [DeviceMonitoring] Failed to create replication state');
    }

    return this.replicationState;
  }
}
