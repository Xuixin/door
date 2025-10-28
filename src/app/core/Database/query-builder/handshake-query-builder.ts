import { BaseQueryBuilder } from './base-query-builder';

export const PUSH_HANDSHAKE_MUTATION = `
  mutation PushHandshake($writeRows: [HandshakeInputPushRow!]!) {
    pushHandshake(input: $writeRows) {
      id
      txn_id
      state {
        server
        door
        cloud
      }
      events {
        type
        at
        reason
        actor
        status
      }
      client_created_at
      client_updated_at
      server_created_at
      server_updated_at
    }
  }
`;

export const PULL_HANDSHAKE_QUERY = `
  query PullHandshake($input: HandshakePull!) {
    pullHandshake(input: $input) {
      documents {
        id
        txn_id
        state {
          server
          door
          cloud
        }
        events {
          type
          at
          reason
          actor
          status
        }
        client_created_at
        client_updated_at
        server_created_at
        server_updated_at
        deleted
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;

export const STREAM_HANDSHAKE_SUBSCRIPTION = `
  subscription StreamHandshake {
    streamHandshake {
      documents {
        id
        txn_id
        state {
          server
          door
          cloud
        }
        events {
          type
          at
          reason
          actor
          status
        }
        client_created_at
        client_updated_at
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

export const handshakeQueryBuilder = new BaseQueryBuilder({
  collectionName: 'handshake',
  pushMutation: PUSH_HANDSHAKE_MUTATION,
  pullQuery: PULL_HANDSHAKE_QUERY,
  streamSubscription: STREAM_HANDSHAKE_SUBSCRIPTION,
});
