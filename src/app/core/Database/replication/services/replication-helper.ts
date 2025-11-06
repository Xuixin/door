import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { removeGraphQLWebSocketRef } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { ReplicationConfigBuilder } from './replication-config-builder';
import { ClientIdentityService } from '../../../../services/client-identity.service';
import { inject } from '@angular/core';

export interface ReplicationConfig {
  name: string;
  collection: any; // RxCollection
  pullQueryBuilder?: (checkpoint: any, limit: number, url?: string) => any; // Optional: if undefined, pull will be disabled
  pullStreamQueryBuilder?: (headers: any, url?: string) => any; // Optional: if undefined, pullStream will be disabled
  pushQueryBuilder?: (docs: any[]) => any; // Optional: if undefined, push will be disabled
  checkpointField?: 'server_updated_at' | 'cloud_updated_at'; // Optional: only needed if pull is enabled
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
  // Create response modifier for checkpoint field normalization (only if pull is enabled)
  const responseModifier = config.pullQueryBuilder
    ? ReplicationConfigBuilder.createResponseModifierForUrl(
        [config.name.toLowerCase().replace(/-/g, '')],
        config.urls.http,
      )
    : undefined;

  const replication = replicateGraphQL<T, any>({
    collection: config.collection,
    replicationIdentifier: config.replicationIdentifier,
    url: {
      http: config.urls.http,
      ws: config.urls.ws,
    },
    pull: config.pullQueryBuilder
      ? {
          queryBuilder: (checkpoint: any, limit: number) => {
            // Call the provided pull query builder with URL
            return config.pullQueryBuilder!(
              checkpoint,
              limit || 50,
              config.urls.http,
            );
          },
          batchSize: 10,
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
          // Note: RxDB automatically handles duplicate documents by primary key (id)
          // When a document with the same id is pulled, RxDB will update the existing document
          // This prevents true duplicates. The checkpoint mechanism ensures we don't pull
          // the same documents twice during normal operation.
          streamQueryBuilder: config.pullStreamQueryBuilder
            ? (headers: any) => {
                // Call the provided stream query builder with URL
                return config.pullStreamQueryBuilder!(
                  headers,
                  config.urls.http,
                );
              }
            : undefined,
          responseModifier: responseModifier,
          includeWsHeaders: true,
          wsOptions: {
            disablePong: false,
            retryAttempts: 3,
            connectionParams: () => ({
              id: config.serverId,
            }),
            on: {
              closed: (event) => {
                // Use queueMicrotask to prevent blocking WebSocket event handlers
                queueMicrotask(() => {
                  console.log(`[${config.name} WebSocket Closed]`, event);
                });
              },
              error: (event: any) => {
                // Use queueMicrotask to prevent blocking WebSocket event handlers
                queueMicrotask(() => {
                  console.log(`[${config.name} WebSocket Error]`, event);
                  if (event.code === 1006) {
                    console.log(
                      `[${config.name} WebSocket Closed (code 1006)]`,
                    );
                  }
                });
              },
              ping: (event) => {
                console.log(`[${config.name} WebSocket Ping]`, event);
              },
            },
          },
        }
      : undefined,
    push: config.pushQueryBuilder
      ? {
          queryBuilder: config.pushQueryBuilder,
          batchSize: 50,
          modifier: (doc: any) => doc,
        }
      : undefined,

    deletedField: 'deleted',
    live: true,
    retryTime: 1000 * 5,
    waitForLeadership: true,
    autoStart: config.autoStart !== false,
  });

  replication.error$.subscribe((err: any) => {
    // Handle push errors gracefully when offline (RC_PUSH)
    // These are expected when network is unavailable (offline-first behavior)
    if (err?.code === 'RC_PUSH' || err?.parameters?.errors) {
      // Check if it's a network/offline error
      const errorMessage =
        err?.parameters?.errors?.message || err?.message || '';
      const isNetworkError =
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('offline') ||
        errorMessage.includes('Network request failed');

      if (isNetworkError) {
        // Log as warning instead of error - this is expected when offline
        console.warn(
          `⚠️ [${config.name} Replication] Push failed (offline):`,
          errorMessage,
        );
        return; // Don't log as error
      }
    }

    // Filter out expected "RxStorageInstanceDexie is closed" errors
    // These occur during RxDB internal cleanup after replication cancellation
    const errorMessage = err?.message || err?.toString() || '';
    const errorStack = err?.stack || '';
    if (
      errorMessage.includes('RxStorageInstanceDexie is closed') ||
      errorMessage.includes('RxStorageInstance') ||
      errorStack.includes('RxStorageInstanceDexie') ||
      errorStack.includes('ensureNotClosed')
    ) {
      // This is an expected error during cleanup - don't log as error
      console.debug(
        `🔇 [${config.name} Replication] Suppressed expected storage closed error during cleanup`,
      );
      return; // Don't log as error
    }

    // Log other errors normally
    console.error(`[${config.name} Replication Error]`, err);
  });

  replication.received$.subscribe(async (doc) => {
    console.log(`[${config.name} Document Received]`, doc);

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
