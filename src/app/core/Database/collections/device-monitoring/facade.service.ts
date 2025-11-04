import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { DeviceMonitoringDocument } from './schema';
import { BaseFacadeService } from '../../core/base/base-facade.service';
import { COLLECTION_NAMES } from '../../core/config/collection-registry';
import { environment } from 'src/environments/environment';
import { ClientIdentityService } from 'src/app/core/identity/client-identity.service';

/**
 * DeviceMonitoring Service facade for device monitoring operations
 * Provides reactive access to device monitoring data from local RxDB
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceMonitoringFacade extends BaseFacadeService<DeviceMonitoringDocument> {
  // Signals for reactive data
  private _deviceMonitoring = signal<DeviceMonitoringDocument[]>([]);
  public readonly deviceMonitoring = this._deviceMonitoring.asReadonly();
  private readonly identity = inject(ClientIdentityService);
  // Computed signals
  public readonly activeDevices = computed(() => {
    return this._deviceMonitoring().filter(
      (device) => device.status !== 'deleted',
    );
  });

  public readonly devicesByStatus = computed(() => {
    const devices = this._deviceMonitoring();
    const grouped: Record<string, DeviceMonitoringDocument[]> = {};
    devices.forEach((device) => {
      const status = device.status || 'unknown';
      if (!grouped[status]) {
        grouped[status] = [];
      }
      grouped[status].push(device);
    });
    return grouped;
  });

  constructor() {
    super();
    console.log('DeviceMonitoringService: Created (lazy initialization)');
  }

  protected getCollectionName(): string {
    return COLLECTION_NAMES.DEVICE_MONITORING;
  }

  /**
   * Ensure service is initialized - call this before using the service
   * This sets up the database subscriptions
   */
  ensureInitialized(): void {
    if (this.isInitialized) {
      console.log('DeviceMonitoringService: Already initialized, skipping');
      return;
    }
    super.ensureInitialized();
  }

  /**
   * Setup database subscriptions
   */
  protected setupSubscriptions(): void {
    const collection = this.collection;
    if (!collection) {
      console.warn(
        '📱 DeviceMonitoring collection not ready, will retry when accessed',
      );
      return;
    }

    console.log('📱 Setting up device monitoring subscriptions...');

    // Subscribe to local database changes using adapter
    const subscription = collection.find$().subscribe({
      next: (devices) => {
        console.log(
          '📱 Local database updated:',
          devices.length,
          'device monitoring records',
        );
        // Filter out deleted documents before setting (RxDB uses _deleted)
        const activeDevices = devices.filter((doc) => !(doc as any)._deleted);
        this._deviceMonitoring.set(activeDevices);
      },
      error: (error) => {
        console.error(
          '❌ Error in device monitoring database subscription:',
          error,
        );
      },
    });

    this.addSubscription(subscription);
  }

  /**
   * Get all device monitoring records as observable
   */
  getDeviceMonitoring$(): Observable<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return new Observable((observer) => observer.next([]));
    }
    // Filter out deleted documents client-side
    return collection
      .find$()
      .pipe(map((docs) => docs.filter((doc) => !(doc as any)._deleted)));
  }

  /**
   * Get device monitoring by status as observable
   */
  getDeviceMonitoringByStatus$(
    status: string,
  ): Observable<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return new Observable((observer) => observer.next([]));
    }
    // Filter by status and exclude deleted documents
    return collection
      .find$({ status } as any)
      .pipe(map((docs) => docs.filter((doc) => !(doc as any)._deleted)));
  }

  /**
   * Get device monitoring by type as observable
   * Filters by type='DOOR' and excludes deleted documents
   */
  getDeviceMonitoringByType$(
    type: string | string[],
  ): Observable<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return new Observable((observer) => observer.next([]));
    }
    // Use RxDB query selector to filter by type field (type is indexed)
    // Filter out deleted documents as well
    return collection
      .find$({
        selector: {
          type: Array.isArray(type) ? { $in: type } : type,
        },
      } as any)
      .pipe(map((docs) => docs.filter((doc) => !(doc as any)._deleted)));
  }

  /**
   * Get device monitoring by ID
   */
  async getDeviceMonitoringById(
    id: string,
  ): Promise<DeviceMonitoringDocument | null> {
    const collection = this.collection;
    if (!collection) {
      return null;
    }
    const doc = await collection.findOne(id);
    return doc && !(doc as any)._deleted ? doc : null;
  }

  /**
   * Get all device monitoring records (for backward compatibility)
   */
  async getAllDeviceMonitoring(): Promise<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return [];
    }
    // Filter out deleted documents client-side
    const allDocs = await collection.find();
    return allDocs.filter((doc) => !(doc as any)._deleted);
  }

  /**
   * Get device monitoring by status (for backward compatibility)
   */
  async getDeviceMonitoringByStatus(
    status: string,
  ): Promise<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return [];
    }
    // Filter by status and exclude deleted documents
    const allDocs = await collection.find({ status } as any);
    return allDocs.filter((doc) => !(doc as any)._deleted);
  }

  /**
   * Get device monitoring by type (for backward compatibility)
   * Filters by type='DOOR' and excludes deleted documents
   */
  async getDeviceMonitoringByType(
    type: string,
  ): Promise<DeviceMonitoringDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return [];
    }
    // Use RxDB query selector to filter by type field (type is indexed)
    // Filter out deleted documents as well
    const allDocs = await collection.find({
      selector: {
        type: type,
      },
    } as any);
    return allDocs.filter((doc) => !(doc as any)._deleted);
  }

  /**
   * Get doors (device monitoring with type='DOOR')
   * Helper method for backward compatibility with door collection
   */
  async getDoors(): Promise<DeviceMonitoringDocument[]> {
    return this.getDeviceMonitoringByType('DOOR');
  }

  /**
   * Get doors as observable (for reactive UI)
   */
  getDoors$(): Observable<DeviceMonitoringDocument[]> {
    const doorType = ['DOOR', 'door'];
    return this.getDeviceMonitoringByType$(doorType);
  }

  /**
   * Get door by ID
   */
  async getDoorById(id: string): Promise<DeviceMonitoringDocument | null> {
    const doc = await this.getDeviceMonitoringById(id);
    if (doc && doc.type === 'DOOR') {
      return doc;
    }
    return null;
  }

  /**
   * Manually refresh device monitoring records
   */
  async refreshDeviceMonitoring() {
    // Ensure initialized first
    if (!this.isInitialized) {
      this.ensureInitialized();
    }

    const collection = this.collection;
    if (!collection) {
      console.warn('📱 DeviceMonitoring collection not available yet');
      return [];
    }
    console.log('🔄 Manually refreshing device monitoring...');
    const allDevices = await collection.find();
    // Filter out deleted documents (RxDB uses _deleted)
    const devices = allDevices.filter((doc) => !(doc as any)._deleted);
    console.log('🔄 Found device monitoring records in DB:', devices.length);
    this._deviceMonitoring.set(devices);
    console.log('✅ Manually refreshed device monitoring:', devices.length);
    return devices;
  }

  async handlePrimaryServerDown() {
    const collection = this.collection;
    if (!collection) {
      return;
    }

    const serverName = environment.serverName;
    console.log(`🔍 Searching for primary server device: name="${serverName}"`);

    // Get all devices and filter manually (more reliable than query selector)
    const allDevices = await collection.find();
    const activeDevices = allDevices.filter((doc) => !(doc as any)._deleted);

    console.log(
      `📊 Total devices in collection: ${activeDevices.length}`,
      activeDevices.map((d) => ({ id: d.id, name: d.name, type: d.type })),
    );

    // Find by exact name match first
    let primaryServerDevice = activeDevices.find(
      (doc) => doc.name === serverName,
    );

    // If found, check type
    if (primaryServerDevice) {
      console.log(
        `✅ Found device by name "${serverName}":`,
        `id=${primaryServerDevice.id}, type=${primaryServerDevice.type}`,
      );

      // Only proceed if type is SERVER (or if no SERVER device exists, use any match)
      if (primaryServerDevice.type === 'SERVER') {
        console.log('✅ Device type is SERVER, proceeding with update');
      } else {
        // Check if there's a SERVER device with different name
        const serverDevices = activeDevices.filter((d) => d.type === 'SERVER');
        if (serverDevices.length > 0) {
          console.warn(
            `⚠️ Found device with name "${serverName}" but type is "${primaryServerDevice.type}".`,
            `Found ${serverDevices.length} SERVER device(s):`,
            serverDevices.map((d) => ({ id: d.id, name: d.name })),
          );
          // Use first SERVER device instead
          primaryServerDevice = serverDevices[0];
          console.log(
            `🔄 Using SERVER device instead: ${primaryServerDevice.name}`,
          );
        } else {
          console.warn(
            `⚠️ No SERVER type device found. Using device "${primaryServerDevice.name}" (type: ${primaryServerDevice.type})`,
          );
        }
      }
    } else {
      // Try to find any SERVER type device as fallback
      const serverDevices = activeDevices.filter((d) => d.type === 'SERVER');
      if (serverDevices.length > 0) {
        console.warn(
          `⚠️ Device with name "${serverName}" not found. Using first SERVER device:`,
          serverDevices[0],
        );
        primaryServerDevice = serverDevices[0];
      } else {
        console.error(
          `❌ Primary server device not found: name="${serverName}", and no SERVER type devices exist.`,
        );
        return;
      }
    }

    console.log('✅ primaryServerDevice selected:', primaryServerDevice);

    // Update offline devices
    await collection.update(primaryServerDevice.id, {
      status: 'OFFLINE',
      meta_data: JSON.stringify({
        code: 1006,
        message: 'Primary server down',
      }),
      client_updated_at: Date.now().toString(),
      created_by: (await this.identity.getClientId()) || '',
    });
  }
}
