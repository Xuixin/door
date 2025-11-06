import { Injectable, inject } from '@angular/core';
import { BaseFacadeService } from '../../services/base-facade.service';
import { DeviceEventDocument } from './schema';
import { ClientIdentityService } from '../../../../services/client-identity.service';


@Injectable({
  providedIn: 'root',
})
export class DeviceEventFacade extends BaseFacadeService<DeviceEventDocument> {
  private readonly identity = inject(ClientIdentityService);

  constructor() {
    super();
    console.log('DeviceEventFacade: Created (lazy initialization)');
  }

  protected getCollectionName(): string {
    return 'device_event';
  }

  protected setupSubscriptions(): void {

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
