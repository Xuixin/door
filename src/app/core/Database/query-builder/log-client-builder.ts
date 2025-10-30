import { BaseQueryBuilder } from './base-query-builder';

export const PUSH_LOG_CLIENT_MUTATION = `
  mutation pushLogClient($writeRows: [LogClientInputPushRow!]!) {
  pushLogClients(input: $writeRows) {
    id
    client_id
    type
    meta_data
    client_created_at
    server_created_at
    server_updated_at
    deleted
    diff_time_create
    status
  }
}
`;

export const PULL_LOG_CLIENT_QUERY = `
  query pullLogClient($input: LogClientPull!){
  pullLogClients(input: $input) {
    documents {
      id
      client_id
      type
      meta_data
      client_created_at
      server_created_at
      server_updated_at
      diff_time_create
      status
    },
    checkpoint{
      id
      server_updated_at
    }
  }
}
`;

// export const STREAM_LOG_CLIENT_SUBSCRIPTION = ` 
//   subscription streamLogClients {
//   streamLogClients{
//     documents {
//       id
//       client_id
//       type
//       meta_data
//       client_created_at
//       server_created_at
//       server_updated_at
//       diff_time_create
//       status
//     }
//     checkpoint {
//       id
//       server_updated_at
//     }
//   }
   
// } `;

export const logClientQueryBuilder = new BaseQueryBuilder({
  collectionName: 'log_client',
  pushMutation: PUSH_LOG_CLIENT_MUTATION,
  pullQuery: PULL_LOG_CLIENT_QUERY,
//   streamSubscription: STREAM_LOG_CLIENT_SUBSCRIPTION,
});
