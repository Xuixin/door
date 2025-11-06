import {
  PULL_DEVICE_MONITORING_HISTORY_QUERY,
  PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
  STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION,
} from './query-builder';
import {
  createPullQueryBuilder,
  createPushQueryBuilder,
  createPullStreamQueryBuilder,
} from '../../replication/services/query-builder-factory';

/**
 * Device Monitoring History Pull Query Builder
 * Fetches device monitoring history from server with checkpoint support
 * Note: Currently not used (push-only collection), but available for future use
 */
export const pullDeviceMonitoringHistoryQueryBuilder = createPullQueryBuilder(
  PULL_DEVICE_MONITORING_HISTORY_QUERY,
);

/**
 * Device Monitoring History Push Query Builder
 * Sends device monitoring history to server
 */
export const pushDeviceMonitoringHistoryQueryBuilder = createPushQueryBuilder(
  PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
  (docRow) => {
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
        diff_time_create: doc.diff_time_create || '0',
        diff_time_update: doc.diff_time_update || '0',
        deleted: docRow.assumedMasterState === null,
      },
    };
  },
);

/**
 * Device Monitoring History Pull Stream Query Builder
 * Real-time subscription for device monitoring history updates
 * Note: Currently not used (push-only collection), but available for future use
 */
export const pullStreamDeviceMonitoringHistoryQueryBuilder =
  createPullStreamQueryBuilder(STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION);
