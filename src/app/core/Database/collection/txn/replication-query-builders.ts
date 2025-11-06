import {
  PULL_TRANSACTION_QUERY,
  PUSH_TRANSACTION_MUTATION,
  STREAM_TRANSACTION_SUBSCRIPTION,
} from './query-builder';
import {
  createPullQueryBuilder,
  createPushQueryBuilder,
  createPullStreamQueryBuilder,
} from '../../replication/services/query-builder-factory';

/**
 * Transaction Pull Query Builder
 * Fetches transactions from server with checkpoint support
 */
export const pullTransactionQueryBuilder = createPullQueryBuilder(
  PULL_TRANSACTION_QUERY,
);

/**
 * Transaction Push Query Builder
 * Sends transactions to server
 */
export const pushTransactionQueryBuilder = createPushQueryBuilder(
  PUSH_TRANSACTION_MUTATION,
  (docRow) => {
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
  },
);

/**
 * Transaction Pull Stream Query Builder
 * Real-time subscription for transaction updates
 */
export const pullStreamTransactionQueryBuilder = createPullStreamQueryBuilder(
  STREAM_TRANSACTION_SUBSCRIPTION,
);
