import { RxTxnDocumentType } from '../../schema';

// GraphQL Mutation สำหรับ Push Transaction
export const PUSH_TRANSACTION_MUTATION = `
  mutation PushTransaction($writeRows: [Transaction2InputPushRow!]!) {
    pushTransaction(input: $writeRows) {
      client_created_at
      client_updated_at
      door_permission
      id
      id_card_base64
      name
      register_type
      server_created_at
      server_updated_at
      status
      student_number
    }
  }
`;

// GraphQL Query สำหรับ Pull Transaction
export const PULL_TRANSACTION_QUERY = `
  query PullTransaction($input: Transaction2Pull!) {
    pullTransaction(input: $input) {
      documents {
        id
        name
        id_card_base64
        student_number
        register_type
        door_permission
        status
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

// GraphQL Subscription สำหรับ Stream Transaction (Real-time)
export const STREAM_TRANSACTION_SUBSCRIPTION = `
  subscription StreamTransaction2 {
    streamTransaction2 {
      documents {
        id
        name
        id_card_base64
        student_number
        register_type
        door_permission
        status
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

// Type definitions สำหรับ Backend
/*
input PullTransactionInput {
  checkpoint: CheckpointInput!
  limit: Int!
}

input CheckpointInput {
  id: String!
  server_created_at: String!
}

type PullTransactionResponse {
  documents: [Transaction2!]!
  checkpoint: Checkpoint!
}

type Checkpoint {
  id: String!
  server_created_at: String!
}

type Transaction2InputPushRow {
  newDocumentState: Transaction2Input!
}

input Transaction2Input {
  id: String!
  name: String!
  id_card_base64: String!
  student_number: String!
  register_type: String!
  door_permission: String!
  status: String!
  client_created_at: String!
  client_updated_at: String
  server_created_at: String
  server_updated_at: String
  deleted: Boolean!
}

type Transaction2 {
  id: String!
  name: String!
  id_card_base64: String!
  student_number: String!
  register_type: String!
  door_permission: String!
  status: String!
  client_created_at: String!
  client_updated_at: String
  server_created_at: String
  server_updated_at: String
  deleted: Boolean!
}
*/
