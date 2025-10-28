import { inject, Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../network-status.service';
import { BaseReplicationService } from './base-replication.service';
import { HandshakeDocument } from '../../schema';
import { handshakeQueryBuilder } from '../query-builder/handshake-query-builder';
import { DoorPreferenceService } from 'src/app/services/door-preference.service';
import { DatabaseService } from '../rxdb.service';

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
    private doorPreferenceService: DoorPreferenceService,
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
          const doorId = await this.doorPreferenceService.getDoorId();

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

      this.replicationState.received$.subscribe(async (received) => {
        console.log('Handshake Replication received:', received);

        // 1. Check if transaction_id exists
        if (!received.transaction_id) return;

        try {
          // 2. Find transaction
          const txn = await this.databaseService.db.txn
            .findOne({ selector: { id: received.transaction_id } } as any)
            .exec();

          if (!txn) {
            console.warn('Transaction not found:', received.transaction_id);
            return;
          }

          // 3. Get door ID
          const doorId = await this.doorPreferenceService.getDoorId();
          if (!doorId) {
            console.error('Door ID not found');
            return;
          }

          // 4. Check if transaction has permission for this door
          const doorPermissions = Array.isArray((txn as any).door_permission)
            ? (txn as any).door_permission
            : (txn as any).door_permission
                .split(',')
                .map((s: string) => s.trim());

          if (!doorPermissions.includes(doorId)) {
            console.warn(
              `Transaction ${received.transaction_id} does not have permission for door ${doorId}`,
            );
            return;
          }

          // 5. Find handshake
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
            return;
          }

          // 6. Check if handshake already has door acknowledgment
          const oldHandshake = handshake.handshake;
          if (oldHandshake.includes(`${doorId} ok`)) {
            console.log(
              `Handshake already has door acknowledgment for ${doorId}, skipping update`,
            );
            return;
          }

          // 7. Update handshake string
          const newHandshake = `,${doorId} ok`;

          // 8. Update events array
          let eventsArray;
          try {
            console.log('Parsing events field:', handshake.events);
            eventsArray = JSON.parse(handshake.events);
            if (!Array.isArray(eventsArray)) {
              console.warn('Events field is not an array, creating new array');
              eventsArray = [];
            }
          } catch (error) {
            console.warn(
              'Failed to parse events JSON, creating new array. Events value:',
              handshake.events,
              'Error:',
              error,
            );
            eventsArray = [];
          }

          // Check if RECEIVE event already exists for this door
          const hasReceiveEvent = eventsArray.some(
            (event: any) =>
              event.type === 'RECEIVE' && event.actor === `DOOR-${doorId}`,
          );

          if (hasReceiveEvent) {
            console.log(
              `RECEIVE event already exists for DOOR-${doorId}, skipping event addition`,
            );
            return;
          }

          eventsArray.push({
            type: 'RECEIVE',
            at: Date.now().toString(),
            actor: `DOOR-${doorId}`,
            status: 'SUCCESS',
          });
          const newEvents = JSON.stringify(eventsArray);

          // 9. Update document
          await handshake.update({
            $set: {
              handshake: newHandshake,
              events: newEvents,
              client_updated_at: Date.now().toString(),
            },
          });

          console.log(
            '✅ Handshake updated successfully:',
            received.transaction_id,
          );
        } catch (error) {
          console.error('❌ Error updating handshake:', error);
        }
      });

      this.replicationState.sent$.subscribe((sent) => {
        console.log('Handshake Replication sent:', sent);
      });

      await this.replicationState.awaitInitialReplication();
      console.log('Initial handshake replication completed');
    }

    return this.replicationState;
  }
}
