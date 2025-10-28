import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { RxTxnCollection } from '../RxDB.D';
import { RxTxnDocumentType } from '../../schema';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../network-status.service';
import { BaseReplicationService } from './base-replication.service';
import {
  PUSH_TRANSACTION_MUTATION,
  PULL_TRANSACTION_QUERY,
  STREAM_TRANSACTION_SUBSCRIPTION,
} from '../query-builder/txn-query-builder';

/**
 * Transaction-specific GraphQL replication service
 * Extends BaseReplicationService for transaction collection replication
 */
@Injectable({
  providedIn: 'root',
})
export class TransactionReplicationService extends BaseReplicationService<RxTxnDocumentType> {
  private graphqlEndpoint: string = environment.apiUrl;
  private graphqlWsEndpoint: string = environment.wsUrl;

  constructor(networkStatus: NetworkStatusService) {
    super(networkStatus);
  }

  /**
   * Setup transaction-specific GraphQL replication
   */
  protected async setupReplication(
    collection: RxCollection,
  ): Promise<RxGraphQLReplicationState<RxTxnDocumentType, any> | undefined> {
    const txnCollection = collection as unknown as RxTxnCollection;

    console.log('Setting up Transaction GraphQL replication...');

    // Check if app is online before starting replication
    if (!this.networkStatus.isOnline()) {
      console.log('⚠️ Application is offline - replication setup skipped');
      console.log(
        '📝 Replication will start automatically when connection is restored',
      );
      return undefined;
    }

    this.replicationState = replicateGraphQL<RxTxnDocumentType, any>({
      collection: txnCollection as any,
      replicationIdentifier:
        this.replicationIdentifier || 'txn-graphql-replication',
      url: {
        http: this.graphqlEndpoint,
        ws: this.graphqlWsEndpoint,
      },

      pull: {
        batchSize: 5,
        queryBuilder: (checkpoint, limit) => {
          console.log('🔵 Pull Query - checkpoint:', checkpoint);

          return {
            query: PULL_TRANSACTION_QUERY,
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

        streamQueryBuilder: (headers) => {
          console.log('🔄 Stream Query - headers:', headers);

          return {
            query: STREAM_TRANSACTION_SUBSCRIPTION,
            variables: {},
          };
        },

        responseModifier: (plainResponse, requestCheckpoint) => {
          // plainResponse = { pullTransaction: { documents: [...], checkpoint: {...} } }
          // or { streamTransaction2: { documents: [...], checkpoint: {...} } }

          console.log('🟢 Full Response:', plainResponse);

          const pullData =
            plainResponse.pullTransaction ||
            plainResponse.streamTransaction2 ||
            plainResponse;
          const documents = pullData.documents || [];
          const checkpoint = pullData.checkpoint;

          // const filteredDocs = documents.filter((d: any) => d.status !== 'OUT');

          // ✅ Return ข้อมูลจริง
          return {
            documents: documents,
            checkpoint: checkpoint,
          };
        },

        modifier: (doc) => {
          if (doc.status === 'OUT') {
            return {
              ...doc,
              _deleted: true,
            };
          }

          return {
            ...doc,
            door_permission:
              typeof doc.door_permission === 'string'
                ? doc.door_permission.split(',').map((s: any) => s.trim())
                : doc.door_permission,
          };
        },

        wsOptions: {
          connectionParams: () => {
            return {
              client_id: 'kiosk-1',
              client_type: 'kiosk',
              doorId: 'kiosk',
            };
          },

          connectionAckWaitTimeout: 1000,
        },
      },

      push: {
        queryBuilder: (docs) => {
          const writeRows = docs.map((docRow) => {
            const doc = docRow.newDocumentState;
            return {
              newDocumentState: {
                id: doc.id,
                name: doc.name,
                id_card_base64: doc.id_card_base64,
                student_number: doc.student_number,
                register_type: doc.register_type,
                door_permission: Array.isArray(doc.door_permission)
                  ? doc.door_permission.join(',')
                  : doc.door_permission,
                status: doc.status,
                client_created_at:
                  doc.client_created_at || Date.now().toString(),
                client_updated_at:
                  doc.client_updated_at || Date.now().toString(),
                server_created_at: doc.server_created_at,
                server_updated_at: doc.server_updated_at,
                deleted: docRow.assumedMasterState === null,
              },
            };
          });

          return {
            query: PUSH_TRANSACTION_MUTATION,
            variables: {
              writeRows,
            },
          };
        },

        dataPath: 'data.pushTransaction',

        modifier: (doc) => {
          return doc;
        },
      },

      live: true,
      retryTime: 60000,
      autoStart: true,
      waitForLeadership: true,

      headers: {
        // 'Authorization': 'Bearer YOUR_TOKEN',
      },
    });

    if (this.replicationState) {
      this.replicationState.error$.subscribe((error) => {
        console.error('Transaction Replication error:', error);
      });

      // เพิ่ม logging สำหรับ pull events
      this.replicationState.received$.subscribe((received) => {
        console.log('Transaction Replication received:', received);
      });

      this.replicationState.sent$.subscribe((sent) => {
        console.log('Transaction Replication sent:', sent);
      });

      await this.replicationState.awaitInitialReplication();
      console.log('Initial transaction replication completed');
    }

    return this.replicationState;
  }
}
