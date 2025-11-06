import { ReplicationConfigBuilder } from './replication-config-builder';
import { environment } from 'src/environments/environment';

/**
 * Type for pull query builder function
 */
export type PullQueryBuilder = (
  checkpoint: any,
  limit: number,
  url?: string,
) => {
  query: string;
  variables: {
    input: {
      checkpoint: {
        id: string;
        server_updated_at?: string;
        cloud_updated_at?: string;
      };
      limit: number;
    };
  };
};

/**
 * Type for push query builder function
 */
export type PushQueryBuilder = (docs: any[]) => {
  query: string;
  variables: {
    writeRows?: any[];
    wrireRow?: any[]; // Note: device-event uses typo 'wrireRow'
  };
};

/**
 * Type for pull stream query builder function
 */
export type PullStreamQueryBuilder = (
  headers: any,
  url?: string,
) => {
  query: string;
  variables: {};
};

/**
 * Field mapper function type for push query builders
 * Maps a document row to the newDocumentState structure
 */
export type PushFieldMapper = (docRow: any) => any;

/**
 * Create a pull query builder function
 * @param query - The GraphQL query string
 * @returns A pull query builder function
 */
export function createPullQueryBuilder(query: string): PullQueryBuilder {
  return (checkpoint: any, limit: number, url?: string) => {
    const httpUrl = url || environment.apiUrl;
    const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
      query,
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
  };
}

/**
 * Create a push query builder function
 * @param mutation - The GraphQL mutation string
 * @param fieldMapper - Function to map document rows to newDocumentState
 * @param variablesKey - The key name for variables (default: 'writeRows', device-event uses 'wrireRow')
 * @returns A push query builder function
 */
export function createPushQueryBuilder(
  mutation: string,
  fieldMapper: PushFieldMapper,
  variablesKey: 'writeRows' | 'wrireRow' = 'writeRows',
): PushQueryBuilder {
  return (docs: any[]) => {
    const writeRows = docs.map(fieldMapper);
    return {
      query: mutation,
      variables: {
        [variablesKey]: writeRows,
      },
    };
  };
}

/**
 * Create a pull stream query builder function
 * @param subscription - The GraphQL subscription string
 * @returns A pull stream query builder function
 */
export function createPullStreamQueryBuilder(
  subscription: string,
): PullStreamQueryBuilder {
  return (headers: any, url?: string) => {
    const httpUrl = url || environment.apiUrl;
    const modifiedQuery = ReplicationConfigBuilder.modifyQueryForServer(
      subscription,
      httpUrl,
    );
    return {
      query: modifiedQuery,
      variables: {},
    };
  };
}
