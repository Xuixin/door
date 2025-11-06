// GraphQL Mutation สำหรับ Push DeviceMonitoringHistory
export const PUSH_DEVICE_MONITORING_HISTORY_MUTATION = `
  mutation PushDeviceMonitoringHistory($writeRows: [DeviceMonitoringHistoryInputPushRow!]!) {
    pushDeviceMonitoringHistory(input: $writeRows) {
      id
      device_id
      type
      status
      meta_data
      created_by
      server_created_at
      cloud_created_at
      client_created_at
      server_updated_at
      cloud_updated_at
      client_updated_at
      diff_time_create
      diff_time_update
      deleted
    }
  }
`;

// GraphQL Query สำหรับ Pull DeviceMonitoringHistory
export const PULL_DEVICE_MONITORING_HISTORY_QUERY = `
  query PullDeviceMonitoringHistory($input: DeviceMonitoringHistoryPull!) {
    pullDeviceMonitoringHistory(input: $input) {
      documents {
        id
        device_id
        type
        status
        meta_data
        created_by
        server_created_at
        cloud_created_at
        client_created_at
        server_updated_at
        cloud_updated_at
        client_updated_at
        diff_time_create
        diff_time_update
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;

// GraphQL Subscription สำหรับ Stream DeviceMonitoringHistory (Real-time)
export const STREAM_DEVICE_MONITORING_HISTORY_SUBSCRIPTION = `
  subscription StreamDeviceMonitoringHistory {
    streamDeviceMonitoringHistory {
      documents {
        id
        device_id
        type
        status
        meta_data
        created_by
        server_created_at
        cloud_created_at
        client_created_at
        server_updated_at
        cloud_updated_at
        client_updated_at
        diff_time_create
        diff_time_update
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;
