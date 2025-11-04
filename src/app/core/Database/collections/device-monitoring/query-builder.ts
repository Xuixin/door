// GraphQL Mutation สำหรับ Push DeviceMonitoring
export const PUSH_DEVICE_MONITORING_MUTATION = `
  mutation PushDeviceMonitoring($writeRows: [DeviceMonitoringInputPushRow!]!) {
    pushDeviceMonitoring(input: $writeRows) {
      id
      name
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
  }
`;

// GraphQL Query สำหรับ Pull DeviceMonitoring
export const PULL_DEVICE_MONITORING_QUERY = `
  query PullDeviceMonitoring($input: DeviceMonitoringPull!) {
    pullDeviceMonitoring(input: $input) {
      documents {
        id
        name
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

// GraphQL Subscription สำหรับ Stream DeviceMonitoring (Real-time)
export const STREAM_DEVICE_MONITORING_SUBSCRIPTION = `
  subscription StreamDeviceMonitoring {
    streamDeviceMonitoring {
      documents {
        id
        name
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
