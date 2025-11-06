import {
  PULL_DEVICE_MONITORING_QUERY,
  PUSH_DEVICE_MONITORING_MUTATION,
  STREAM_DEVICE_MONITORING_SUBSCRIPTION,
} from './query-builder';
import {
  createPullQueryBuilder,
  createPushQueryBuilder,
  createPullStreamQueryBuilder,
} from '../../replication/services/query-builder-factory';

/**
 * Device Monitoring Pull Query Builder
 * Fetches device monitoring data from server with checkpoint support
 */
export const pullDeviceMonitoringQueryBuilder = createPullQueryBuilder(
  PULL_DEVICE_MONITORING_QUERY,
);

/**
 * Device Monitoring Push Query Builder
 * Sends device monitoring data to server
 */
export const pushDeviceMonitoringQueryBuilder = createPushQueryBuilder(
  PUSH_DEVICE_MONITORING_MUTATION,
  (docRow) => {
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
        diff_time_create: doc.diff_time_create || '0',
        diff_time_update: doc.diff_time_update || '0',
      },
    };
  },
);

/**
 * Device Monitoring Pull Stream Query Builder
 * Real-time subscription for device monitoring updates
 */
export const pullStreamDeviceMonitoringQueryBuilder =
  createPullStreamQueryBuilder(STREAM_DEVICE_MONITORING_SUBSCRIPTION);
