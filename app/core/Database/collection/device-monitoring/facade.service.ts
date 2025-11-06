import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map, startWith, shareReplay } from 'rxjs/operators';
import { RxCollection } from 'rxdb';
import { BaseFacadeService } from '../../services/base-facade.service';
import { ReplicationStateMonitorService } from '../../replication/services/replication-state-monitor.service';
import { environment } from 'src/environments/environment';
import { ClientIdentityService } from '../../../../services/client-identity.service';

export interface DeviceMonitoringDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  meta_data?: string;
  client_created_at?: string;
  client_updated_at?: string;
  server_created_at?: string;
  server_updated_at?: string;
  cloud_created_at?: string;
  cloud_updated_at?: string;
  created_by?: string;
  diff_time_create?: string;
  diff_time_update?: string;
  [key: string]: any;
}

/**
 * DeviceMonitoring Service facade for device monitoring operations
 * Provides reactive access to device monitoring data from local RxDB
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceMonitoringFacade extends BaseFacadeService<DeviceMonitoringDocument> {
  private readonly identity = inject(ClientIdentityService);
  private readonly replicationMonitor = inject(ReplicationStateMonitorService);

  // Signals for reactive data
  private _deviceMonitoring = signal<DeviceMonitoringDocument[]>([]);
  public readonly deviceMonitoring = this._deviceMonitoring.asReadonly();

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
    return 'devicemonitoring';
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
      console.log(
        '📱 DeviceMonitoring collection not ready, will retry when accessed',
      );
      return;
    }

    console.log('📱 Setting up device monitoring subscriptions...');

    // Subscribe to local database changes using RxCollection
    const subscription = collection.find().$.subscribe({
      next: (devices: any[]) => {
        console.log(
          '📱 Local database updated:',
          devices.length,
          'device monitoring records',
        );
        // Filter out deleted documents before setting (RxDB uses _deleted)
        const activeDevices = devices.filter(
          (doc: any) => !(doc as any)._deleted,
        );
        this._deviceMonitoring.set(activeDevices);
      },
      error: (error: any) => {
        console.error(
          '❌ Error in device monitoring database subscription:',
          error,
        );
      },
    });

    this.addSubscription(subscription);

    // Subscribe to replication events if available
    try {
      const replicationReceived$ =
        this.replicationMonitor.getCollectionReplicationReceived$(
          'devicemonitoring',
        );
      if (replicationReceived$) {
        const replicationSubscription = replicationReceived$.subscribe({
          next: (received) => {
            console.log('🔄 Device monitoring replication received:', received);
            // Refresh device monitoring when replication receives data
            this.refreshDeviceMonitoring();
          },
          error: (error) => {
            console.error(
              '❌ Error in device monitoring replication subscription:',
              error,
            );
          },
        });
        this.addSubscription(replicationSubscription);
      }
    } catch (error) {
      console.log('⚠️ Could not subscribe to replication events:', error);
    }
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
      .find()
      .$.pipe(
        map((docs: any[]) => docs.filter((doc: any) => !(doc as any)._deleted)),
      );
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
      .find({
        selector: { status } as any,
      })
      .$.pipe(
        map((docs: any[]) => docs.filter((doc: any) => !(doc as any)._deleted)),
      );
  }

  /**
   * Get device monitoring by type as observable
   * Filters by type='DOOR' and excludes deleted documents
   */
  getDeviceMonitoringByType$(
    type: string | string[],
  ): Observable<DeviceMonitoringDocument[]> {
    console.log(
      `[DeviceMonitoringFacade] getDeviceMonitoringByType$ called with type:`,
      type,
    );

    // Ensure initialized first
    this.ensureInitialized();

    const collection = this.collection;
    if (!collection) {
      console.log(
        `[DeviceMonitoringFacade] Collection is null, returning empty observable with retry`,
      );
      // Return observable that emits empty array immediately and retries
      const retryObservable = new Observable<DeviceMonitoringDocument[]>(
        (observer) => {
          // Emit empty array immediately
          observer.next([]);

          // Retry when collection becomes available
          const maxRetries = 10;
          let retries = 0;
          const retryInterval = setInterval(() => {
            retries++;
            const retryCollection = this.collection;
            if (retryCollection) {
              clearInterval(retryInterval);
              console.log(
                `[DeviceMonitoringFacade] Collection now available after ${retries} retries, subscribing...`,
              );
              retryCollection
                .find({
                  selector: {
                    type: Array.isArray(type) ? { $in: type } : type,
                  },
                } as any)
                .$.pipe(
                  map((docs: any[]) => {
                    return docs.filter((doc: any) => !(doc as any)._deleted);
                  }),
                  startWith([]),
                  shareReplay(1),
                )
                .subscribe(observer);
            } else if (retries >= maxRetries) {
              clearInterval(retryInterval);
              console.log(
                `[DeviceMonitoringFacade] Max retries reached, collection still not available`,
              );
            }
          }, 500);
        },
      );

      return retryObservable.pipe(shareReplay(1));
    }
    console.log(
      `[DeviceMonitoringFacade] Collection found, querying for type:`,
      type,
    );

    // Debug: Check all documents in the collection
    collection.find().$.subscribe((allDocs: any[]) => {
      if (allDocs.length > 0) {
        console.log(
          `[DeviceMonitoringFacade] Collection has ${allDocs.length} documents`,
        );
      }
    });

    // Use RxDB query selector to filter by type field (type is indexed)
    // Filter out deleted documents as well
    return collection
      .find({
        selector: {
          type: Array.isArray(type) ? { $in: type } : type,
        },
      } as any)
      .$.pipe(
        map((docs: any[]) => {
          const filtered = docs.filter((doc: any) => !(doc as any)._deleted);
          console.log(
            `[DeviceMonitoringFacade] Found ${docs.length} docs, ${filtered.length} after filtering deleted`,
          );
          console.log(
            `[DeviceMonitoringFacade] Filtered docs:`,
            filtered.map((d: any) => ({
              id: d.id,
              type: d.type,
              name: d.name,
            })),
          );
          return filtered;
        }),
        startWith([]),
        shareReplay(1),
      );
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
    const doc = await collection.findOne(id).exec();
    return doc && !(doc as any)._deleted ? (doc as any) : null;
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
    const allDocs = await collection.find().exec();
    return allDocs.filter((doc) => !(doc as any)._deleted) as any[];
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
    const allDocs = await collection
      .find({
        selector: { status } as any,
      })
      .exec();
    return allDocs.filter((doc) => !(doc as any)._deleted) as any[];
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
    const allDocs = await collection
      .find({
        selector: {
          type: type,
        },
      } as any)
      .exec();
    return allDocs.filter((doc) => !(doc as any)._deleted) as any[];
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
   * Returns cached observable that emits immediately with current doors
   */
  private _doors$: Observable<DeviceMonitoringDocument[]> | null = null;

  getDoors$(): Observable<DeviceMonitoringDocument[]> {
    // Return cached observable if exists
    if (this._doors$) {
      return this._doors$;
    }

    // Ensure collection is initialized
    this.ensureInitialized();

    const doorType = ['DOOR', 'door'];
    this._doors$ = this.getDeviceMonitoringByType$(doorType);
    return this._doors$;
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
      console.log('📱 DeviceMonitoring collection not available yet');
      return [];
    }
    console.log('🔄 Manually refreshing device monitoring...');
    const allDevices = await collection.find().exec();
    // Filter out deleted documents (RxDB uses _deleted)
    const devices = allDevices.filter((doc) => !(doc as any)._deleted);
    console.log('🔄 Found device monitoring records in DB:', devices.length);
    this._deviceMonitoring.set(devices as any[]);
    console.log('✅ Manually refreshed device monitoring:', devices.length);
    return devices as any[];
  }

  async handlePrimaryServerDown() {
    const collection = this.collection;
    if (!collection) {
      return;
    }

    const serverName = environment.serverName;
    console.log(`🔍 Searching for primary server device: name="${serverName}"`);

    // Get all devices and filter manually (more reliable than query selector)
    const allDevices = await collection.find().exec();
    const activeDevices = allDevices.filter((doc) => !(doc as any)._deleted);

    console.log(
      `📊 Total devices in collection: ${activeDevices.length}`,
      activeDevices.map((d) => ({ id: d.id, name: d.name, type: d.type })),
    );

    // Find by exact name match first
    let primaryServerDevice = activeDevices.find(
      (doc) => doc.name === serverName,
    ) as any;

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
          console.log(
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
          console.log(
            `⚠️ No SERVER type device found. Using device "${primaryServerDevice.name}" (type: ${primaryServerDevice.type})`,
          );
        }
      }
    } else {
      // Try to find any SERVER type device as fallback
      const serverDevices = activeDevices.filter(
        (d) => d.type === 'SERVER' || d.type === 'server',
      );
      if (serverDevices.length > 0) {
        console.log(
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
    await primaryServerDevice.update({
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
