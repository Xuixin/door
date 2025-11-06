import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { ReplicationConfigBuilder } from './replication-config-builder';

export interface ReplicationConfig {
  name: string;
  collection: any; // RxCollection
  pullQueryBuilder: (checkpoint: any, limit: number, url?: string) => any;
  pullStreamQueryBuilder: (headers: any, url?: string) => any;
  pushQueryBuilder?: (docs: any[]) => any; // Optional: if undefined, push will be disabled
  checkpointField: 'server_updated_at' | 'cloud_updated_at';
  urls: {
    http: string;
    ws: string;
  };
  replicationIdentifier: string;
  serverId: string;
  autoStart?: boolean; // Optional: defaults to true
  onReceived?: (docs: any[]) => Promise<void>;
}

/**
 * Setup collection replication with common configuration
 * Reduces code duplication across replication services
 */
export function setupCollectionReplication<T = any>(
  config: ReplicationConfig,
): RxGraphQLReplicationState<T, any> {
  // Create response modifier for checkpoint field normalization
  const dataPath = config.name.toLowerCase().replace(/-/g, '');
  const responseModifier =
    ReplicationConfigBuilder.createResponseModifierForUrl(
      [dataPath],
      config.urls.http,
    );

  const replication = replicateGraphQL<T, any>({
    collection: config.collection,
    replicationIdentifier: config.replicationIdentifier,
    url: {
      http: config.urls.http,
      ws: config.urls.ws,
    },
    pull: {
      queryBuilder: (checkpoint: any, limit: number) => {
        // Call the provided pull query builder with URL
        return config.pullQueryBuilder(
          checkpoint,
          limit || 50,
          config.urls.http,
        );
      },
      batchSize: 50,
      modifier: (doc: any) => {
        // Clean null values (except deleted)
        Object.entries(doc).forEach(([key, value]) => {
          if (value === null && key !== 'deleted') {
            delete doc[key];
          }
        });

        // Set server timestamps
        doc['server_updated_at'] = Date.now().toString();
        doc['server_created_at'] =
          doc['server_created_at'] || Date.now().toString();

        // Map RxDB _deleted to deleted field
        doc['deleted'] = doc['_deleted'] || false;

        return doc;
      },
      streamQueryBuilder: (headers: any) => {
        // Call the provided stream query builder with URL
        return config.pullStreamQueryBuilder(headers, config.urls.http);
      },
      responseModifier: responseModifier,
      includeWsHeaders: true,
      wsOptions: {
        retryAttempts: 10,
        connectionParams: () => ({
          id: config.serverId,
        }),
      },
    },
    push: config.pushQueryBuilder
      ? {
          queryBuilder: config.pushQueryBuilder,
          batchSize: 50,
          modifier: (doc: any) => doc,
        }
      : undefined, // Disable push if no pushQueryBuilder provided

    deletedField: 'deleted',
    live: true,
    retryTime: 1000 * 5,
    waitForLeadership: true,
    autoStart: config.autoStart !== false, // Default to true, but can be overridden
  });

  // Setup observables for logging and callbacks
  replication.error$.subscribe((err) => {
    console.error(`[${config.name} Replication Error]`, err);
  });

  replication.active$.subscribe((active) => {
    console.log(`[${config.name} Replication Active]`, active);
  });

  replication.received$.subscribe(async (doc) => {
    console.log(`[${config.name} Document Received]`, doc);

    // Call onReceived callback if provided
    if (config.onReceived) {
      const docs = Array.isArray(doc) ? doc : [doc];
      await config.onReceived(docs);
    }
  });

  replication.sent$.subscribe((doc) => {
    console.log(`[${config.name} Document Sent]`, doc);
  });

  return replication;
}
