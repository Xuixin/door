import {
  PULL_DEVICE_EVENT_QUERY,
  PUSH_DEVICE_EVENT_MUTATION,
  STREAM_DEVICE_EVENT_SUBSCRIPTION,
} from './query-builder';
import {
  createPullQueryBuilder,
  createPushQueryBuilder,
  createPullStreamQueryBuilder,
} from '../../replication/services/query-builder-factory';

/**
 * Device Event Pull Query Builder
 * Fetches device events from server with checkpoint support
 */
export const pullDeviceEventQueryBuilder = createPullQueryBuilder(
  PULL_DEVICE_EVENT_QUERY,
);

/**
 * Device Event Push Query Builder
 * Sends device events to server
 * Note: Uses 'wrireRow' variable name (typo in GraphQL schema)
 */
export const pushDeviceEventQueryBuilder = createPushQueryBuilder(
  PUSH_DEVICE_EVENT_MUTATION,
  (docRow) => {
    const doc = docRow.newDocumentState;
    return {
      newDocumentState: {
        id: doc.id,
        sent_to: doc.sent_to,
        transaction_id: doc.transaction_id,
        device_id: doc.device_id,
        client_created_at: doc.client_created_at,
        client_updated_at: doc.client_updated_at,
        cloud_created_at: doc.cloud_created_at,
        cloud_updated_at: doc.cloud_updated_at,
        server_created_at: doc.server_created_at,
        server_updated_at: doc.server_updated_at,
        deleted: docRow.assumedMasterState === null,
      },
    };
  },
  'wrireRow', // Note: device-event mutation uses typo 'wrireRow' instead of 'writeRows'
);

/**
 * Device Event Pull Stream Query Builder
 * Real-time subscription for device event updates
 */
export const pullStreamDeviceEventQueryBuilder = createPullStreamQueryBuilder(
  STREAM_DEVICE_EVENT_SUBSCRIPTION,
);
