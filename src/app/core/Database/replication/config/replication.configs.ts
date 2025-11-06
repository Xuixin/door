import { RxDatabase, RxCollection } from 'rxdb';
import { environment } from 'src/environments/environment';
import {
  pullTransactionQueryBuilder,
  pushTransactionQueryBuilder,
  pullStreamTransactionQueryBuilder,
} from '../../collection/txn/replication-query-builders';
import {
  pullDeviceMonitoringQueryBuilder,
  pullStreamDeviceMonitoringQueryBuilder,
} from '../../collection/device-monitoring/replication-query-builders';
import { pushDeviceMonitoringHistoryQueryBuilder } from '../../collection/device-monitoring-history/replication-query-builders';
import {
  pullDeviceEventQueryBuilder,
  pushDeviceEventQueryBuilder,
  pullStreamDeviceEventQueryBuilder,
} from '../../collection/device-event/replication-query-builders';
import { PRIMARY_IDENTIFIERS, SECONDARY_IDENTIFIERS } from '../constants';
import { ReplicationConfig } from '../services/replication-helper';
import { createDeviceEvents } from 'src/app/core/Database/collection/device-event/helper';
import { DeviceEventFacade } from 'src/app/core/Database/collection/device-event/facade.service';

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
 * @param deviceEventFacade - DeviceEventFacade instance for creating device events
 * @param emitPrimaryRecoveryFn - Function to emit primary recovery event
 * @returns Array of replication configurations
 */
export function createReplicationConfigs(
  db: RxDatabase<DatabaseCollections>,
  serverId: string,
  deviceEventFacade: DeviceEventFacade,
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
      onReceived: async (docs) => {
        // Create device events for received transactions
        if (docs && docs.length > 0) {
          await createDeviceEvents(deviceEventFacade, docs, 'miniserver');
        }
      },
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
      onReceived: async (docs) => {
        // Create device events for received transactions
        if (docs && docs.length > 0) {
          await createDeviceEvents(deviceEventFacade, docs, 'cloud');
        }
      },
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
    // Device Monitoring History Primary (Push Only - No Pull/PullStream)
    {
      name: 'devicemonitoringhistory-primary',
      collection: db.devicemonitoringhistory,
      // No pullQueryBuilder - push only
      // No pullStreamQueryBuilder - push only
      pushQueryBuilder: pushDeviceMonitoringHistoryQueryBuilder,
      // No checkpointField needed - no pull
      urls: {
        http: environment.apiUrl,
        ws: environment.wsUrl,
      },
      replicationIdentifier: PRIMARY_IDENTIFIERS[2], // 'device_monitoring_history-primary-10102'
      serverId: serverId,
    },
    // Device Monitoring History Secondary (Push Only - No Pull/PullStream)
    {
      name: 'devicemonitoringhistory-secondary',
      collection: db.devicemonitoringhistory,
      // No pullQueryBuilder - push only
      // No pullStreamQueryBuilder - push only
      pushQueryBuilder: pushDeviceMonitoringHistoryQueryBuilder,
      // No checkpointField needed - no pull
      urls: {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      },
      replicationIdentifier: SECONDARY_IDENTIFIERS[2], // 'device_monitoring_history-secondary-3001'
      serverId: serverId,
      autoStart: false, // Don't start until needed
      // No onReceived - no pull, so no documents will be received
    },
    // Device Event Primary
    {
      name: 'deviceevent-primary',
      collection: db.device_event,
      pullQueryBuilder: pullDeviceEventQueryBuilder,
      pushQueryBuilder: pushDeviceEventQueryBuilder,
      pullStreamQueryBuilder: pullStreamDeviceEventQueryBuilder,
      checkpointField: 'server_updated_at',
      urls: {
        http: environment.apiUrl,
        ws: environment.wsUrl,
      },
      replicationIdentifier: PRIMARY_IDENTIFIERS[3], // 'device_event-primary-10102'
      serverId: serverId,
    },
    // Device Event Secondary
    {
      name: 'deviceevent-secondary',
      collection: db.device_event,
      pullQueryBuilder: pullDeviceEventQueryBuilder,
      pushQueryBuilder: pushDeviceEventQueryBuilder,
      pullStreamQueryBuilder: pullStreamDeviceEventQueryBuilder,
      checkpointField: 'cloud_updated_at',
      urls: {
        http: environment.apiSecondaryUrl || environment.apiUrl,
        ws: environment.wsSecondaryUrl || environment.wsUrl,
      },
      replicationIdentifier: SECONDARY_IDENTIFIERS[3], // 'device_event-secondary-3001'
      serverId: serverId,
      autoStart: false, // Don't start until needed
    },
  ];

  return replicationConfigs;
}
