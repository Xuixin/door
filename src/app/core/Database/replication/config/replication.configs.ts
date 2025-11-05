import { RxDatabase, RxCollection } from 'rxdb';
import { environment } from 'src/environments/environment';
import {
  pullTransactionQueryBuilder,
  pushTransactionQueryBuilder,
  pullStreamTransactionQueryBuilder,
} from '../services/query-builder-functions';
import {
  pullDeviceMonitoringQueryBuilder,
  pullStreamDeviceMonitoringQueryBuilder,
} from '../services/query-builder-functions';
import {
  pullDeviceMonitoringHistoryQueryBuilder,
  pushDeviceMonitoringHistoryQueryBuilder,
  pullStreamDeviceMonitoringHistoryQueryBuilder,
} from '../services/query-builder-functions';
import { PRIMARY_IDENTIFIERS, SECONDARY_IDENTIFIERS } from '../constants';
import { ReplicationConfig } from '../services/replication-helper';

interface DatabaseCollections {
  transaction: RxCollection;
  devicemonitoring: RxCollection;
  devicemonitoringhistory: RxCollection;
  device_event: RxCollection;
}

/**
 * Create all replication configurations
 * @param db - RxDatabase instance
 * @param serverId - Server ID for replication
 * @param emitPrimaryRecoveryFn - Function to emit primary recovery event
 * @returns Array of replication configurations
 */
export function createReplicationConfigs(
  db: RxDatabase<DatabaseCollections>,
  serverId: string,
  emitPrimaryRecoveryFn: () => Promise<void>,
): ReplicationConfig[] {
  const replicationConfigs: ReplicationConfig[] = [
    // Transaction Primary
    {
      name: 'transaction-primary',
      collection: db.transaction,
      pullQueryBuilder: pullTransactionQueryBuilder,
      pushQueryBuilder: pushTransactionQueryBuilder,
      pullStreamQueryBuilder: pullStreamTransactionQueryBuilder,
      checkpointField: 'server_updated_at',
      urls: {
        http: environment.apiUrl,
        ws: environment.wsUrl,
      },
      replicationIdentifier: PRIMARY_IDENTIFIERS[0], // 'txn-primary-10102'
      serverId: serverId,
      // Device events are now created automatically via DeviceEventFacade subscription
      // No need for onReceived callback here
    },
    // Transaction Secondary
    {
      name: 'transaction-secondary',
      collection: db.transaction,
      pullQueryBuilder: pullTransactionQueryBuilder,
      pushQueryBuilder: pushTransactionQueryBuilder,
      pullStreamQueryBuilder: pullStreamTransactionQueryBuilder,
      checkpointField: 'cloud_updated_at',
      urls: {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      },
      replicationIdentifier: SECONDARY_IDENTIFIERS[0], // 'txn-secondary-3001'
      serverId: serverId,
      autoStart: false, // Don't start until needed
      // Device events are now created automatically via DeviceEventFacade subscription
      // No need for onReceived callback here
    },
    // Device Monitoring Primary (readOnly - no push)
    {
      name: 'devicemonitoring-primary',
      collection: db.devicemonitoring,
      pullQueryBuilder: pullDeviceMonitoringQueryBuilder,
      // pushQueryBuilder: undefined, // Disabled - DeviceMonitoring is readOnly
      pullStreamQueryBuilder: pullStreamDeviceMonitoringQueryBuilder,
      checkpointField: 'server_updated_at',
      urls: {
        http: environment.apiUrl,
        ws: environment.wsUrl,
      },
      replicationIdentifier: PRIMARY_IDENTIFIERS[1], // 'device_monitoring-primary-10102'
      serverId: serverId,
    },
    // Device Monitoring Secondary (readOnly - no push)
    {
      name: 'devicemonitoring-secondary',
      collection: db.devicemonitoring,
      pullQueryBuilder: pullDeviceMonitoringQueryBuilder,
      // pushQueryBuilder: undefined, // Disabled - DeviceMonitoring is readOnly
      pullStreamQueryBuilder: pullStreamDeviceMonitoringQueryBuilder,
      checkpointField: 'cloud_updated_at',
      urls: {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      },
      replicationIdentifier: SECONDARY_IDENTIFIERS[1], // 'device_monitoring-secondary-3001'
      serverId: serverId,
      autoStart: false, // Don't start until needed
      onReceived: async (docs) => {
        // Check for primary recovery conditions when receiving data from secondary
        // Use queueMicrotask to ensure event emission happens outside replication scope
        // This prevents blocking the replication process
        docs.forEach((doc: any) => {
          if (
            doc.id === environment.serverId &&
            (doc.type === 'SERVER' || doc.type === 'server') &&
            doc.status === 'ONLINE'
          ) {
            console.log(
              '🔄 [ReplicationConfig] Primary server detected as ONLINE, queuing switchToPrimary event',
            );
            // Emit event asynchronously outside replication scope
            // This ensures replication process is not blocked
            queueMicrotask(() => {
              emitPrimaryRecoveryFn().catch((error) => {
                console.error(
                  '❌ [ReplicationConfig] Error emitting primary recovery event:',
                  error,
                );
              });
            });
          }
        });
      },
    },
    // Device Monitoring History Primary
    {
      name: 'devicemonitoringhistory-primary',
      collection: db.devicemonitoringhistory,
      pullQueryBuilder: pullDeviceMonitoringHistoryQueryBuilder,
      pushQueryBuilder: pushDeviceMonitoringHistoryQueryBuilder,
      pullStreamQueryBuilder: pullStreamDeviceMonitoringHistoryQueryBuilder,
      checkpointField: 'server_updated_at',
      urls: {
        http: environment.apiUrl,
        ws: environment.wsUrl,
      },
      replicationIdentifier: PRIMARY_IDENTIFIERS[2], // 'device_monitoring_history-primary-10102'
      serverId: serverId,
    },
    // Device Monitoring History Secondary
    {
      name: 'devicemonitoringhistory-secondary',
      collection: db.devicemonitoringhistory,
      pullQueryBuilder: pullDeviceMonitoringHistoryQueryBuilder,
      pushQueryBuilder: pushDeviceMonitoringHistoryQueryBuilder,
      pullStreamQueryBuilder: pullStreamDeviceMonitoringHistoryQueryBuilder,
      checkpointField: 'cloud_updated_at',
      urls: {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      },
      replicationIdentifier: SECONDARY_IDENTIFIERS[2], // 'device_monitoring_history-secondary-3001'
      serverId: serverId,
      autoStart: false, // Don't start until needed
      onReceived: async (docs) => {
        // Check for primary recovery conditions when receiving data from secondary
        if (docs && docs.length > 0) {
          // TODO: Implement primary recovery check
          console.log(
            '[DeviceMonitoringHistory Secondary] Received docs, checking for primary recovery...',
          );
        }
      },
    },
  ];

  return replicationConfigs;
}
