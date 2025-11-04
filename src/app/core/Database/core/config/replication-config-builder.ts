import { environment } from 'src/environments/environment';
import { ReplicationConfig } from '../adapter';
import { CollectionRegistry } from './collection-registry';

/**
 * Options for building replication configuration
 */
export interface ReplicationConfigOptions {
  /** Collection name (will use registry if not provided) */
  collectionName?: string;
  /** Replication identifier (will use registry if not provided) */
  replicationId?: string;
  /** Batch size for pull operations */
  batchSize?: number;
  /** HTTP endpoint URL */
  httpUrl?: string;
  /** WebSocket endpoint URL */
  wsUrl?: string;
  /** Query builder function for pull operations */
  pullQueryBuilder?: (checkpoint: any, limit: number) => any;
  /** Stream query builder function for subscriptions */
  streamQueryBuilder?: (headers: any) => any;
  /** Response modifier for pull operations */
  responseModifier?: (plainResponse: any, requestCheckpoint: any) => any;
  /** Document modifier for pull operations */
  pullModifier?: (doc: any) => any;
  /** Query builder function for push operations */
  pushQueryBuilder?: (docs: any[]) => any;
  /** Data path for push operations */
  pushDataPath?: string;
  /** Document modifier for push operations */
  pushModifier?: (doc: any) => any;
  /** WebSocket connection params factory */
  wsConnectionParams?: () => Promise<Record<string, any>>;
  /** Connection ack wait timeout (ms) */
  connectionAckWaitTimeout?: number;
  /** Keep alive timeout (ms) - ping/pong interval for connection health monitoring */
  keepAlive?: number;
  /** WebSocket event listeners for connection monitoring (closed, error, connected, ping, pong) */
  wsOnEvents?: {
    closed?: (event: any) => void;
    error?: (error: any) => void;
    connected?: (socket: any) => void;
    ping?: (received: boolean) => void;
    pong?: (received: boolean) => void;
  };
  /** Enable live replication */
  live?: boolean;
  /** Retry time (ms) */
  retryTime?: number;
  /** Auto start replication */
  autoStart?: boolean;
  /** Wait for leadership before starting */
  waitForLeadership?: boolean;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Override URLs for failover (if provided, overrides httpUrl and wsUrl) */
  urls?: { http: string; ws: string };
}

/**
 * Replication Config Builder
 * Utility class to build common replication configurations
 * Reduces code duplication across replication services
 */
export class ReplicationConfigBuilder {
  /**
   * Build base replication config with common settings
   */
  static buildBaseConfig(
    options: ReplicationConfigOptions = {},
  ): ReplicationConfig & Record<string, any> {
    // Get metadata from registry if collection name is provided
    const metadata = options.collectionName
      ? CollectionRegistry.get(options.collectionName)
      : null;

    const replicationId =
      options.replicationId || metadata?.replicationId || 'replication';
    const collectionName =
      options.collectionName || metadata?.collectionName || 'collection';

    // Default values
    const batchSize = options.batchSize ?? 10;
    // Use urls override if provided (for failover), otherwise use httpUrl/wsUrl or environment defaults
    const httpUrl = options.urls?.http || options.httpUrl || environment.apiUrl;
    const wsUrl = options.urls?.ws || options.wsUrl || environment.wsUrl;
    const live = options.live ?? true;
    const retryTime = options.retryTime ?? 60000;
    const autoStart = options.autoStart ?? true;
    const waitForLeadership = options.waitForLeadership ?? true;

    // Build pull config
    const pullConfig: any = {
      batchSize,
    };

    if (options.pullQueryBuilder) {
      pullConfig.queryBuilder = options.pullQueryBuilder;
    }

    if (options.streamQueryBuilder) {
      pullConfig.streamQueryBuilder = options.streamQueryBuilder;
    }

    if (options.responseModifier) {
      pullConfig.responseModifier = options.responseModifier;
    }

    if (options.pullModifier) {
      pullConfig.modifier = options.pullModifier;
    }

    // Build WS options if needed
    if (
      options.wsConnectionParams ||
      options.connectionAckWaitTimeout !== undefined ||
      options.keepAlive !== undefined ||
      options.wsOnEvents
    ) {
      pullConfig.wsOptions = {} as any;
      if (options.wsConnectionParams) {
        pullConfig.wsOptions.connectionParams = options.wsConnectionParams;
      }
      if (options.connectionAckWaitTimeout !== undefined) {
        pullConfig.wsOptions.connectionAckWaitTimeout =
          options.connectionAckWaitTimeout;
      }
      // Add keepAlive for proactive connection monitoring
      // This enables ping/pong to detect server down without waiting for pull/push/stream
      if (options.keepAlive !== undefined) {
        pullConfig.wsOptions.keepAlive = options.keepAlive;
      }
      // Add event listeners for connection monitoring
      // on: { closed, error, connected } for early detection
      if (options.wsOnEvents) {
        pullConfig.wsOptions.on = options.wsOnEvents;
      }
    }

    // Build push config
    const pushConfig: any = {};
    if (options.pushQueryBuilder) {
      pushConfig.queryBuilder = options.pushQueryBuilder;
    }
    if (options.pushDataPath) {
      pushConfig.dataPath = options.pushDataPath;
    }
    if (options.pushModifier) {
      pushConfig.modifier = options.pushModifier;
    }

    return {
      replicationId,
      collectionName,
      url: {
        http: httpUrl,
        ws: wsUrl,
      },
      pull: pullConfig,
      push: pushConfig,
      live,
      retryTime,
      autoStart,
      waitForLeadership,
      headers: options.headers || {},
    };
  }

  /**
   * Build standard checkpoint input for GraphQL queries
   * @deprecated Use buildCheckpointInputWithField instead for dynamic field selection
   */
  static buildCheckpointInput(checkpoint: any) {
    return {
      id: checkpoint?.id || '',
      server_updated_at: checkpoint?.server_updated_at || '0',
    };
  }

  /**
   * Build checkpoint input with dynamic timestamp field based on server type
   * @param checkpoint - The checkpoint object
   * @param timestampField - The timestamp field to use ('server_updated_at' | 'cloud_updated_at')
   */
  static buildCheckpointInputWithField(
    checkpoint: any,
    timestampField:
      | 'server_updated_at'
      | 'cloud_updated_at' = 'server_updated_at',
  ) {
    return {
      id: checkpoint?.id || '',
      [timestampField]: checkpoint?.[timestampField] || '0',
    };
  }

  /**
   * Detect server type based on URL and return appropriate timestamp field
   * @param url - The server URL (http or ws)
   */
  static getTimestampFieldForUrl(
    url: string,
  ): 'server_updated_at' | 'cloud_updated_at' {
    if (url.includes(':3001')) {
      return 'cloud_updated_at';
    }
    return 'server_updated_at';
  }

  /**
   * Build checkpoint input with automatic field detection based on URL
   * @param checkpoint - The checkpoint object
   * @param url - The server URL to determine timestamp field
   */
  static buildCheckpointInputForUrl(checkpoint: any, url: string) {
    const timestampField = this.getTimestampFieldForUrl(url);

    // Both servers need id field, but use different timestamp fields
    return {
      id: checkpoint?.id || '',
      [timestampField]: checkpoint?.[timestampField] || '0',
    };
  }

  /**
   * Create standard pull query builder with checkpoint
   */
  static createPullQueryBuilder(
    query: string,
    checkpointBuilder: (checkpoint: any, limit: number) => any = (c, l) => ({
      checkpoint: this.buildCheckpointInput(c),
      limit: l || 10,
    }),
  ) {
    return (checkpoint: any, limit: number) => ({
      query,
      variables: {
        input: checkpointBuilder(checkpoint, limit),
      },
    });
  }

  /**
   * Create pull query builder with dynamic checkpoint field based on URL
   * @param query - GraphQL query string
   * @param url - Server URL to determine checkpoint field
   */
  static createPullQueryBuilderForUrl(query: string, url: string) {
    return (checkpoint: any, limit: number) => ({
      query,
      variables: {
        input: {
          checkpoint: this.buildCheckpointInputForUrl(checkpoint, url),
          limit: limit || 10,
        },
      },
    });
  }

  /**
   * Modify GraphQL query to use appropriate checkpoint field based on server
   * @param query - Original GraphQL query
   * @param url - Server URL to determine checkpoint field
   */
  static modifyQueryForServer(query: string, url: string): string {
    const timestampField = this.getTimestampFieldForUrl(url);

    if (timestampField === 'cloud_updated_at') {
      // Replace server_updated_at with cloud_updated_at in checkpoint sections
      // Handle various whitespace patterns including newlines in GraphQL
      return query.replace(
        /checkpoint\s*\{[^}]*server_updated_at[^}]*\}/g,
        'checkpoint {\n        id\n        cloud_updated_at\n      }',
      );
    }

    return query; // Return original query for server_updated_at (10102)
  }

  /**
   * Create standard stream query builder
   */
  static createStreamQueryBuilder(query: string) {
    return (headers: any) => ({
      query,
      variables: {},
    });
  }

  /**
   * Create standard response modifier
   * Extracts documents and checkpoint from response
   */
  static createResponseModifier(
    dataPath: string | string[],
  ): (plainResponse: any, requestCheckpoint: any) => any {
    return (plainResponse: any, requestCheckpoint: any) => {
      const paths = Array.isArray(dataPath) ? dataPath : [dataPath];
      let pullData: any = null;

      // Try to find data in response using paths
      for (const path of paths) {
        const keys = path.split('.');
        let current: any = plainResponse;
        let found = true;

        for (const key of keys) {
          if (current && typeof current === 'object' && key in current) {
            current = current[key];
          } else {
            found = false;
            break;
          }
        }

        if (found) {
          pullData = current;
          break;
        }
      }

      // Fallback to plainResponse if not found
      if (!pullData) {
        pullData = plainResponse;
      }

      const documents = pullData?.documents || [];
      const checkpoint = pullData?.checkpoint;

      return {
        documents,
        checkpoint,
      };
    };
  }

  /**
   * Create response modifier with dynamic checkpoint field normalization
   * Handles different checkpoint field names between servers
   * @param dataPath - Path to data in response
   * @param url - Server URL to determine expected checkpoint field
   */
  static createResponseModifierForUrl(
    dataPath: string | string[],
    url: string,
  ): (plainResponse: any, requestCheckpoint: any) => any {
    const expectedTimestampField = this.getTimestampFieldForUrl(url);

    return (plainResponse: any, requestCheckpoint: any) => {
      const paths = Array.isArray(dataPath) ? dataPath : [dataPath];
      let pullData: any = null;

      // Try to find data in response using paths
      for (const path of paths) {
        const keys = path.split('.');
        let current: any = plainResponse;
        let found = true;

        for (const key of keys) {
          if (current && typeof current === 'object' && key in current) {
            current = current[key];
          } else {
            found = false;
            break;
          }
        }

        if (found) {
          pullData = current;
          break;
        }
      }

      // Fallback to plainResponse if not found
      if (!pullData) {
        pullData = plainResponse;
      }

      const documents = pullData?.documents || [];
      let checkpoint = pullData?.checkpoint;

      // Normalize checkpoint field names based on server
      if (checkpoint) {
        // Ensure checkpoint has the expected timestamp field
        if (
          expectedTimestampField === 'cloud_updated_at' &&
          checkpoint.server_updated_at &&
          !checkpoint.cloud_updated_at
        ) {
          checkpoint = {
            ...checkpoint,
            cloud_updated_at: checkpoint.server_updated_at,
          };
          delete checkpoint.server_updated_at;
        } else if (
          expectedTimestampField === 'server_updated_at' &&
          checkpoint.cloud_updated_at &&
          !checkpoint.server_updated_at
        ) {
          checkpoint = {
            ...checkpoint,
            server_updated_at: checkpoint.cloud_updated_at,
          };
          delete checkpoint.cloud_updated_at;
        }
      }

      return {
        documents,
        checkpoint,
      };
    };
  }
}
