// GraphQL Mutation สำหรับ Push DeviceEvent
export const PUSH_DEVICE_EVENT_MUTATION = `
  mutation PushDeviceEvent($wrireRow: [DeviceEventInputPushRow!]!) {
    pushDeviceEvent(input: $wrireRow) {
      id
      sent_to
      transaction_id
      device_id
      client_created_at
    }
  }
`;

// GraphQL Query สำหรับ Pull DeviceEvent
// Note: checkpoint field will be replaced by ReplicationConfigBuilder based on server (server_updated_at or cloud_updated_at)
export const PULL_DEVICE_EVENT_QUERY = `
  query PullDeviceEvent($input: DeviceEventPull!) {
    pullDeviceEvent(input: $input) {
      documents {
        id
        device_id
        transaction_id
        sent_to
        deleted
        client_created_at
        client_updated_at
        cloud_created_at
        cloud_updated_at
        server_created_at
        server_updated_at
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;

// GraphQL Subscription สำหรับ Stream DeviceEvent (Real-time)
// Note: checkpoint field will be replaced by ReplicationConfigBuilder based on server (server_updated_at or cloud_updated_at)
export const STREAM_DEVICE_EVENT_SUBSCRIPTION = `
  subscription StreamDeviceEvent {
    streamDeviceEvent {
      documents {
        id
        device_id
        transaction_id
        sent_to
        deleted
        client_created_at
        client_updated_at
        cloud_created_at
        cloud_updated_at
        server_created_at
        server_updated_at
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;
