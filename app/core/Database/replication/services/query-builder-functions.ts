import {
  PULL_TRANSACTION_QUERY,
  PUSH_TRANSACTION_MUTATION,
  STREAM_TRANSACTION_SUBSCRIPTION,
} from '../../collection/txn/query-builder';
import {
  PULL_DEVICE_MONITORING_QUERY,
  PUSH_DEVICE_MONITORING_MUTATION,
  STREAM_DEVICE_MONITORING_SUBSCRIPTION,
} from '../../collection/device-monitoring/query-builder';
import {
  PULL_DEVICE_MONITORING_HISTORY_QUERY,
  PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
  STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION,
} from '../../collection/device-monitoring-history/query-builder';
import { ReplicationConfigBuilder } from './replication-config-builder';
import { environment } from 'src/environments/environment';

/**
 * Transaction Query Builders
 */
export function pullTransactionQueryBuilder(
  checkpoint: any,
  limit: number,
  url?: string,
) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    PULL_TRANSACTION_QUERY,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {
      input: {
        checkpoint: ReplicationConfigBuilder.buildCheckpointInputForUrl(
          checkpoint,
          httpUrl,
        ),
        limit: limit || 50,
      },
    },
  };
}

export function pushTransactionQueryBuilder(docs: any[]) {
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
}

export function pullStreamTransactionQueryBuilder(headers: any, url?: string) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    STREAM_TRANSACTION_SUBSCRIPTION,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {},
  };
}

/**
 * Device Monitoring Query Builders
 */
export function pullDeviceMonitoringQueryBuilder(
  checkpoint: any,
  limit: number,
  url?: string,
) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    PULL_DEVICE_MONITORING_QUERY,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {
      input: {
        checkpoint: ReplicationConfigBuilder.buildCheckpointInputForUrl(
          checkpoint,
          httpUrl,
        ),
        limit: limit || 50,
      },
    },
  };
}

export function pushDeviceMonitoringQueryBuilder(docs: any[]) {
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
        diff_time_create: doc.diff_time_create || '0',
        diff_time_update: doc.diff_time_update || '0',
      },
    };
  });
  return {
    query: PUSH_DEVICE_MONITORING_MUTATION,
    variables: {
      writeRows,
    },
  };
}

export function pullStreamDeviceMonitoringQueryBuilder(
  headers: any,
  url?: string,
) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    STREAM_DEVICE_MONITORING_SUBSCRIPTION,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {},
  };
}

/**
 * Device Monitoring History Query Builders
 */
export function pullDeviceMonitoringHistoryQueryBuilder(
  checkpoint: any,
  limit: number,
  url?: string,
) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    PULL_DEVICE_MONITORING_HISTORY_QUERY,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {
      input: {
        checkpoint: ReplicationConfigBuilder.buildCheckpointInputForUrl(
          checkpoint,
          httpUrl,
        ),
        limit: limit || 50,
      },
    },
  };
}

export function pushDeviceMonitoringHistoryQueryBuilder(docs: any[]) {
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
        diff_time_create: doc.diff_time_create || '0',
        diff_time_update: doc.diff_time_update || '0',
        deleted: docRow.assumedMasterState === null,
      },
    };
  });
  return {
    query: PUSH_DEVICE_MONITORING_HISTORY_MUTATION,
    variables: {
      writeRows,
    },
  };
}

export function pullStreamDeviceMonitoringHistoryQueryBuilder(
  headers: any,
  url?: string,
) {
  const httpUrl = url || environment.apiUrl;
  const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
    STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION,
    httpUrl,
  );
  return {
    query: modifiedQuery,
    variables: {},
  };
}
