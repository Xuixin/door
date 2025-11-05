import { Injectable, inject } from '@angular/core';
import { BaseFacadeService } from '../../services/base-facade.service';
import { DeviceEventDocument } from './schema';
import { ClientIdentityService } from '../../../../services/client-identity.service';
import { ReplicationStateMonitorService } from '../../replication';
import {
  PRIMARY_IDENTIFIERS,
  SECONDARY_IDENTIFIERS,
} from '../../replication/constants';
import { filter, mergeMap } from 'rxjs/operators';

/**
 * DeviceEvent Service
 * Manages device event tracking (local only, no replication)
 * Subscribes to transaction replication events to automatically create device events
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceEventFacade extends BaseFacadeService<DeviceEventDocument> {
  private readonly identity = inject(ClientIdentityService);
  private readonly replicationMonitor = inject(ReplicationStateMonitorService);

  constructor() {
    super();
    console.log('DeviceEventFacade: Created (lazy initialization)');
  }

  protected getCollectionName(): string {
    return 'device_event';
  }

  /**
   * Setup database subscriptions
   * Subscribe to transaction replication received$ events to create device events automatically
   */
  protected setupSubscriptions(): void {
    // Wait for database to be ready, then wait a bit for replications to initialize
    this.waitForDatabase().then(async () => {
      // Wait a bit more for replications to be set up
      await this.waitForReplications();

      // Subscribe to primary transaction replication
      const primaryReceived$ = this.replicationMonitor.getReplicationReceived$(
        PRIMARY_IDENTIFIERS[0], // 'txn-primary-10102'
      );

      if (primaryReceived$) {
        const subscription = primaryReceived$
          .pipe(
            filter((docs) => docs && docs.length > 0),
            mergeMap(async (docs: any[]) => {
              await this.handleTransactionReceived(docs, 'miniserver');
            }),
          )
          .subscribe({
            error: (error) => {
              console.error(
                '❌ [DeviceEventFacade] Error in primary transaction subscription:',
                error,
              );
            },
          });
        this.addSubscription(subscription);
        console.log(
          '✅ [DeviceEventFacade] Subscribed to primary transaction replication',
        );
      } else {
        console.warn(
          '⚠️ [DeviceEventFacade] Primary transaction replication not available yet',
        );
      }

      // Subscribe to secondary transaction replication
      const secondaryReceived$ =
        this.replicationMonitor.getReplicationReceived$(
          SECONDARY_IDENTIFIERS[0], // 'txn-secondary-3001'
        );

      if (secondaryReceived$) {
        const subscription = secondaryReceived$
          .pipe(
            filter((docs) => docs && docs.length > 0),
            mergeMap(async (docs: any[]) => {
              await this.handleTransactionReceived(docs, 'cloud');
            }),
          )
          .subscribe({
            error: (error) => {
              console.error(
                '❌ [DeviceEventFacade] Error in secondary transaction subscription:',
                error,
              );
            },
          });
        this.addSubscription(subscription);
        console.log(
          '✅ [DeviceEventFacade] Subscribed to secondary transaction replication',
        );
      } else {
        console.warn(
          '⚠️ [DeviceEventFacade] Secondary transaction replication not available yet',
        );
      }
    });
  }

  /**
   * Wait for replications to be initialized
   */
  private async waitForReplications(): Promise<void> {
    const maxAttempts = 20;
    const delayMs = 500;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const primaryReceived$ = this.replicationMonitor.getReplicationReceived$(
        PRIMARY_IDENTIFIERS[0],
      );
      const secondaryReceived$ =
        this.replicationMonitor.getReplicationReceived$(
          SECONDARY_IDENTIFIERS[0],
        );

      // If at least one replication is available, we can proceed
      if (primaryReceived$ || secondaryReceived$) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.warn(
      '⚠️ [DeviceEventFacade] Replications not available after waiting',
    );
  }

  /**
   * Handle transaction documents received from replication
   */
  private async handleTransactionReceived(
    docs: any[],
    sentTo: 'miniserver' | 'cloud',
  ): Promise<void> {
    try {
      // Process each transaction
      const promises = docs.map(async (doc: any) => {
        const transactionId = doc.id;
        if (!transactionId) {
          console.warn(
            '⚠️ [DeviceEventFacade] Transaction document missing id, skipping device event creation',
          );
          return;
        }

        try {
          await this.createIfNotExists(transactionId, sentTo);
        } catch (error: any) {
          console.error(
            `❌ [DeviceEventFacade] Error creating device event for transaction ${transactionId}:`,
            error.message,
          );
        }
      });

      await Promise.allSettled(promises);
    } catch (error: any) {
      console.error(
        '❌ [DeviceEventFacade] Error handling transaction received:',
        error.message,
      );
    }
  }

  /**
   * Create a new device event
   */
  async create(
    event: Omit<DeviceEventDocument, 'id'>,
  ): Promise<DeviceEventDocument> {
    const collection = this.collection;
    if (!collection) {
      throw new Error('DeviceEvent collection not available');
    }

    const id = crypto.randomUUID();
    const deviceEvent: DeviceEventDocument = {
      id,
      ...event,
    };

    const doc = await collection.insert(deviceEvent);
    return doc as any;
  }

  /**
   * Find device event by transaction_id
   */
  async findByTransactionId(
    transactionId: string,
  ): Promise<DeviceEventDocument | null> {
    const collection = this.collection;
    if (!collection) {
      return null;
    }

    try {
      const doc = await collection
        .findOne({
          selector: { transaction_id: transactionId } as any,
        })
        .exec();

      if (doc && !(doc as any)._deleted) {
        return doc as any;
      }
      return null;
    } catch (error) {
      console.error('❌ Error finding device event by transaction_id:', error);
      return null;
    }
  }

  /**
   * Check if device event exists for transaction_id
   */
  async existsByTransactionId(transactionId: string): Promise<boolean> {
    const event = await this.findByTransactionId(transactionId);
    return event !== null;
  }

  /**
   * Create device event for a transaction (if not exists)
   */
  async createIfNotExists(
    transactionId: string,
    sentTo: 'miniserver' | 'cloud',
  ): Promise<DeviceEventDocument | null> {
    // Check if already exists
    const exists = await this.existsByTransactionId(transactionId);
    if (exists) {
      console.log(
        `ℹ️ DeviceEvent already exists for transaction_id: ${transactionId}`,
      );
      return null;
    }

    // Get device ID
    const deviceId = await this.identity.getClientId();
    if (!deviceId) {
      console.warn('⚠️ Client ID not available, cannot create device event');
      return null;
    }

    // Create new device event
    // Note: Don't include empty strings for indexed fields (cloud_created_at, cloud_updated_at)
    // RxDB doesn't accept empty strings for indexed fields that are not required
    const deviceEvent = await this.create({
      transaction_id: transactionId,
      device_id: deviceId,
      sent_to: sentTo,
      client_created_at: Date.now().toString(),
      // cloud_created_at and cloud_updated_at will be undefined (not included)
      // server_created_at and server_updated_at will be undefined (not included)
      // client_updated_at will be undefined (not included)
    });

    console.log(`✅ Created DeviceEvent for transaction_id: ${transactionId}`);
    return deviceEvent;
  }
}
