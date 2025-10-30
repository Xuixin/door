import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { RxLogClientCollection } from '../RxDB.D';
import { LogClientDocument } from '../../schema/log-client.schema';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../network-status.service';
import { BaseReplicationService } from './base-replication.service';
import {
  logClientQueryBuilder,
  PULL_LOG_CLIENT_QUERY,
  //   STREAM_LOG_CLIENT_SUBSCRIPTION,
  PUSH_LOG_CLIENT_MUTATION,
} from '../query-builder/log-client-builder';
import { ClientIdentityService } from '../../identity/client-identity.service';

/**
 * LogClient-specific GraphQL replication service
 * Extends BaseReplicationService for log_client collection replication
 */
@Injectable({
  providedIn: 'root',
})
export class LogClientReplicationService extends BaseReplicationService<LogClientDocument> {
  private graphqlEndpoint: string = environment.apiUrl;
  private graphqlWsEndpoint: string = environment.wsUrl;

  constructor(
    networkStatus: NetworkStatusService,
    private readonly identity: ClientIdentityService,
  ) {
    super(networkStatus);
  }

  /**
   * Setup log-client-specific GraphQL replication
   */
  protected async setupReplication(
    collection: RxCollection,
  ): Promise<RxGraphQLReplicationState<LogClientDocument, any> | undefined> {
    const logClientCollection = collection as unknown as RxLogClientCollection;

    console.log('Setting up LogClient GraphQL replication...');

    if (!this.networkStatus.isOnline()) {
      console.log(
        '⚠️ Application is offline - log-client replication setup skipped',
      );
      console.log(
        '📝 Replication will start automatically when connection is restored',
      );
      return undefined;
    }

    this.replicationState = replicateGraphQL<LogClientDocument, any>({
      collection: logClientCollection as any,
      replicationIdentifier:
        this.replicationIdentifier || 'log-client-graphql-replication',
      url: {
        http: this.graphqlEndpoint,
        ws: this.graphqlWsEndpoint,
      },
      pull: {
        batchSize: 5,
        queryBuilder: (checkpoint, limit) => {
          return {
            query: PULL_LOG_CLIENT_QUERY,
            variables: {
              input: {
                checkpoint: {
                  id: checkpoint?.id || '',
                  server_updated_at: checkpoint?.server_updated_at || '0',
                },
                limit: limit || 5,
              },
            },
          };
        },
        // streamQueryBuilder: () => {
        //   const subscription = logClientQueryBuilder.getStreamSubscription();
        //   return {
        //     query: subscription || STREAM_LOG_CLIENT_SUBSCRIPTION,
        //     variables: {},
        //   };
        // },
        responseModifier: (plainResponse) => {
          const pullData =
            plainResponse.pullLogClients ||
            plainResponse.streamLogClients ||
            plainResponse;
          const documents = pullData.documents || [];
          const checkpoint = pullData.checkpoint;
          return {
            documents,
            checkpoint,
          };
        },
        modifier: (doc) => {
          const clientId = this.identity.getClientId();

          if (doc.client_id === clientId) {
            return doc;
          } else {
            return {
              ...doc,
              _deleted: true,
            };
          }
        },
      },
      push: {
        queryBuilder: (docs) => {
          const writeRows = docs.map((docRow: any) => {
            const doc = docRow.newDocumentState;
            return {
              newDocumentState: {
                id: doc.id,
                client_id: doc.client_id,
                type: doc.type,
                meta_data: doc.meta_data,
                client_created_at:
                  doc.client_created_at || Date.now().toString(),
                server_created_at: doc.server_created_at,
                server_updated_at: doc.server_updated_at,
                deleted: docRow.assumedMasterState === null,
                diff_time_create: doc.diff_time_create || '0',
                status: doc.status,
              },
            };
          });

          return {
            query: PUSH_LOG_CLIENT_MUTATION,
            variables: {
              writeRows,
            },
          };
        },
        dataPath: 'data.pushLogClients',
        modifier: (doc) => doc,
      },
      live: true,
      retryTime: 60000,
      autoStart: true,
      waitForLeadership: true,
    });

    if (this.replicationState) {
      this.replicationState.error$.subscribe((error) => {
        console.error('LogClient Replication error:', error);
      });
      this.replicationState.received$.subscribe(async (received) => {
        console.log('cleanup log client');
        await logClientCollection.cleanup(0);

        console.log('LogClient Replication received:', received);
      });
      this.replicationState.sent$.subscribe((sent) => {
        console.log('LogClient Replication sent:', sent);
      });
      await this.replicationState.awaitInitialReplication();
      console.log('Initial log-client replication completed');
    }
    return this.replicationState;
  }
}
