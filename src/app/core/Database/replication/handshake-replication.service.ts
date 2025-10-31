import { inject, Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../network-status.service';
import { BaseReplicationService } from './base-replication.service';
import { HandshakeDocument } from '../../schema';
import { handshakeQueryBuilder } from '../query-builder/handshake-query-builder';
import { DatabaseService } from '../rxdb.service';
import {
  parseEventsArray,
  parseHandshakeField,
} from '../utils/received-parse-utils';
import {
  validateDoorPermission,
  hasReceiveEvent,
  hasDoorAcknowledgment,
} from '../utils/received-validate-utils';
import { updateHandshake } from '../utils/received-update-utils';
import { ClientIdentityService } from '../../identity/client-identity.service';

/**
 * Handshake-specific GraphQL replication service
 * Extends BaseReplicationService for handshake collection replication
 */
@Injectable({
  providedIn: 'root',
})
export class HandshakeReplicationService extends BaseReplicationService<HandshakeDocument> {
  private graphqlEndpoint: string = environment.apiUrl;
  private graphqlWsEndpoint: string = environment.wsUrl;

  constructor(
    networkStatus: NetworkStatusService,
    private clientIdentityService: ClientIdentityService,
    private databaseService: DatabaseService,
  ) {
    super(networkStatus);
  }

  /**
   * Setup handshake-specific GraphQL replication
   */
  protected async setupReplication(
    collection: RxCollection,
  ): Promise<RxGraphQLReplicationState<HandshakeDocument, any> | undefined> {
    console.log('Setting up Handshake GraphQL replication...');

    // Check if app is online before starting replication
    if (!this.networkStatus.isOnline()) {
      console.log('⚠️ Application is offline - replication setup skipped');
      console.log(
        '📝 Replication will start automatically when connection is restored',
      );
      return undefined;
    }

    this.replicationState = replicateGraphQL<HandshakeDocument, any>({
      collection: collection as any,
      replicationIdentifier:
        this.replicationIdentifier || 'handshake-graphql-replication',
      url: {
        http: this.graphqlEndpoint,
        ws: this.graphqlWsEndpoint,
      },

      pull: {
        batchSize: 10,
        queryBuilder: async (checkpoint, limit) => {
          console.log('🔵 Pull Query - checkpoint:', checkpoint);
          const clientId = await this.clientIdentityService.getClientId();

          return {
            query: handshakeQueryBuilder.getPullQuery(),
            variables: {
              input: {
                checkpoint: {
                  id: checkpoint?.id || '',
                  server_updated_at: checkpoint?.server_updated_at || '0',
                },
                limit: limit || 10,
              },
            },
          };
        },

        streamQueryBuilder: (headers) => {
          console.log('🔄 Stream Query - headers:', headers);

          return {
            query: handshakeQueryBuilder.getStreamSubscription() || '',
            variables: {},
          };
        },

        responseModifier: (plainResponse) => {
          console.log('🟢 Full Response:', plainResponse);

          const pullData =
            plainResponse.pullHandshake ||
            plainResponse.streamHandshake ||
            plainResponse;
          const documents = pullData.documents || [];
          const checkpoint = pullData.checkpoint;

          return {
            documents: documents,
            checkpoint: checkpoint,
          };
        },

        modifier: (doc) => doc,
      },

      push: {
        queryBuilder: (docs) => {
          const writeRows = docs.map((docRow) => {
            const doc = docRow.newDocumentState;
            return {
              newDocumentState: {
                id: doc.id,
                transaction_id: doc.transaction_id || doc.txn_id,
                handshake:
                  doc.handshake || doc.state || '{"server":false,"door":false}',
                events: doc.events,
                client_created_at:
                  doc.client_created_at || Date.now().toString(),
                client_updated_at:
                  doc.client_updated_at || Date.now().toString(),
                server_created_at: doc.server_created_at,
                server_updated_at: doc.server_updated_at,
                diff_time_create: doc.diff_time_create || '0',
                diff_time_update: doc.diff_time_update || '0',
                deleted: docRow.assumedMasterState === null,
              },
            };
          });

          return {
            query: handshakeQueryBuilder.getPushMutation(),
            variables: {
              writeRows,
            },
          };
        },

        dataPath: 'data.pushHandshake',

        modifier: (doc) => doc,
      },

      live: true,
      retryTime: 60000,
      autoStart: true,
      waitForLeadership: true,
    });

    if (this.replicationState) {
      this.replicationState.error$.subscribe((error) => {
        console.error('Handshake Replication error:', error);
      });

      this.replicationState.received$.subscribe((received) =>
        this.handleReceivedReplication(received),
      );

      this.replicationState.sent$.subscribe((sent) => {
        console.log('Handshake Replication sent:', sent);
      });

      await this.replicationState.awaitInitialReplication();
      console.log('Initial handshake replication completed');
    }

    return this.replicationState;
  }

  // ---- Refactor helpers for received$ ----

  private async handleReceivedReplication(received: any) {
    // 1. transaction_id check
    if (!received.transaction_id) return;

    const txn = await this.findTransactionForReceived(received);
    if (!txn) return;

    const clientId = await this.clientIdentityService.getClientId();
    if (!clientId) return;

    if (!validateDoorPermission(txn, clientId, received)) return;

    const handshake = await this.findHandshakeDoc(received);
    if (!handshake) return;

    const eventsArray = parseEventsArray(handshake);
    if (hasReceiveEvent(eventsArray, clientId)) return;

    const parsedHandshake = parseHandshakeField(handshake);
    if (hasDoorAcknowledgment(parsedHandshake, clientId)) return;

    await updateHandshake(handshake, parsedHandshake, clientId, received);
  }

  private async findTransactionForReceived(received: any) {
    try {
      await this.databaseService.awaitDbReady();
      const txn = await this.databaseService.db.txn
        .findOne({ selector: { id: received.transaction_id } } as any)
        .exec();
      if (!txn) {
        console.warn('Transaction not found:', received.transaction_id);
        return null;
      }
      return txn;
    } catch (e) {
      console.error('Error finding transaction for received:', e);
      return null;
    }
  }

  private async findHandshakeDoc(received: any) {
    try {
      const handshake = await this.databaseService.db.handshake
        .findOne({
          selector: { transaction_id: received.transaction_id },
        } as any)
        .exec();
      if (!handshake) {
        console.warn(
          'Handshake not found for transaction:',
          received.transaction_id,
        );
        return null;
      }
      return handshake;
    } catch (e) {
      console.error('Error finding handshake doc:', e);
      return null;
    }
  }
}
