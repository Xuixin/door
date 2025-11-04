import { Injectable, inject } from '@angular/core';
import { DeviceMonitoringHistoryDocument } from './schema';
import { Observable, map } from 'rxjs';
import { ClientIdentityService } from '../../../identity/client-identity.service';
import { BaseFacadeService } from '../../core/base/base-facade.service';
import { COLLECTION_NAMES } from '../../core/config/collection-registry';
import { environment } from '../../../../../environments/environment';
@Injectable({ providedIn: 'root' })
export class DeviceMonitoringHistoryFacade extends BaseFacadeService<DeviceMonitoringHistoryDocument> {
  private readonly identity = inject(ClientIdentityService);

  protected getCollectionName(): string {
    return COLLECTION_NAMES.DEVICE_MONITORING_HISTORY;
  }

  /**
   * No subscriptions needed - service uses direct queries
   */
  protected setupSubscriptions(): void {
    // DeviceMonitoringHistory service uses direct queries instead of subscriptions
  }

  /**
   * Append a new history entry
   * Uses created_by from ClientIdentityService.getClientId()
   */
  async append(
    entry: Partial<DeviceMonitoringHistoryDocument> & {
      device_id: string;
      type: string;
      status: string;
      meta_data: string;
    },
  ): Promise<void> {
    const collection = this.collection;
    if (!collection) {
      throw new Error('DeviceMonitoringHistory collection not available');
    }

    const now = Date.now().toString();
    const id = entry.id || crypto.randomUUID();
    const created_by = entry.created_by || (await this.identity.getClientId());
    const doc: Partial<DeviceMonitoringHistoryDocument> = {
      id,
      device_id: entry.device_id,
      type: entry.type,
      status: entry.status,
      meta_data: entry.meta_data,
      created_by: created_by || '',
      client_created_at: entry.client_created_at || now,
      client_updated_at: entry.client_updated_at || now,
      server_created_at: entry.server_created_at || '',
      server_updated_at: entry.server_updated_at || '',
      cloud_created_at: entry.cloud_created_at || '',
      cloud_updated_at: entry.cloud_updated_at || '',
      diff_time_create: entry.diff_time_create || '0',
      diff_time_update: entry.diff_time_update || '0',
    };
    await collection.insert(doc);
  }

  /**
   * Get all history entries as observable
   */
  getHistory$(): Observable<DeviceMonitoringHistoryDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return new Observable((observer) => observer.next([]));
    }
    return collection
      .find$()
      .pipe(map((docs) => docs.filter((doc) => !(doc as any)._deleted)));
  }

  /**
   * Count offline events by created_by
   */
  countOfflineEvents$(createdBy?: string): Observable<number> {
    const collection = this.collection;
    if (!collection) {
      return new Observable((observer) => observer.next(0));
    }

    const selector = createdBy
      ? ({ created_by: createdBy, status: 'OFFLINE' } as any)
      : ({ status: 'OFFLINE' } as any);

    return collection
      .find$(selector)
      .pipe(map((docs) => docs.filter((doc) => !(doc as any)._deleted).length));
  }

  /**
   * Get last entry by created_by
   */
  async getLastByCreatedBy(
    createdBy: string,
  ): Promise<DeviceMonitoringHistoryDocument | null> {
    const collection = this.collection;
    if (!collection) {
      return null;
    }

    const result = await collection.query({
      selector: { created_by: createdBy } as any,
      sort: [{ field: 'client_created_at', direction: 'desc' }],
      limit: 1,
    });

    return result.documents.length > 0 && !(result.documents[0] as any)._deleted
      ? result.documents[0]
      : null;
  }

  /**
   * Append entry if changed (to avoid duplicate bursts)
   */
  async appendIfChanged(params: {
    device_id: string;
    type: string;
    status: string;
    meta_data: string;
    created_by?: string;
    minGapMs?: number; // default 30000
  }): Promise<boolean> {
    const minGapMs = params.minGapMs ?? 30000;
    const created_by = params.created_by || (await this.identity.getClientId());
    const last = await this.getLastByCreatedBy(created_by || '');
    const now = Date.now();
    const lastTs = last ? Number(last.client_created_at) : 0;
    const sameStatus = last && last.status === params.status;
    const recent = last && now - lastTs < minGapMs;

    if (sameStatus && recent) return false; // skip duplicate burst
    await this.append({
      device_id: params.device_id,
      type: params.type,
      status: params.status,
      meta_data: params.meta_data,
      created_by: created_by || '',
      client_created_at: String(now),
      client_updated_at: String(now),
    });
    return true;
  }

  /**
   * Get history by created_by
   */
  async getHistoryByCreatedBy(
    createdBy: string,
  ): Promise<DeviceMonitoringHistoryDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return [];
    }

    const result = await collection.query({
      selector: { created_by: createdBy } as any,
      sort: [{ field: 'client_created_at', direction: 'desc' }],
    });

    return result.documents.filter((doc) => !(doc as any)._deleted);
  }

  /**
   * Get history by type
   */
  async getHistoryByType(
    type: string,
  ): Promise<DeviceMonitoringHistoryDocument[]> {
    const collection = this.collection;
    if (!collection) {
      return [];
    }

    const result = await collection.query({
      selector: { type } as any,
      sort: [{ field: 'client_created_at', direction: 'desc' }],
    });

    return result.documents.filter((doc) => !(doc as any)._deleted);
  }

  /**
   * Get last entry by type (most recent)
   */
  async getLastByType(
    type: string,
  ): Promise<DeviceMonitoringHistoryDocument | null> {
    const collection = this.collection;
    if (!collection) {
      return null;
    }

    const result = await collection.query({
      selector: { type } as any,
      sort: [{ field: 'client_created_at', direction: 'desc' }],
      limit: 1,
    });

    const docs = result.documents.filter((doc) => !(doc as any)._deleted);
    return docs.length > 0 ? docs[0] : null;
  }

  async appendPrimaryServerDownRev(code?: number, message?: string) {
    try {
      await this.append({
        device_id: environment.serverName + ' : primary-server-down',
        type: 'primary-server-down',
        status: code === 1006 ? 'PRIMARY_SERVER_DOWN' : 'ERROR',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: JSON.stringify({
          code: code || 0,
          message: message || 'Unknown error',
          url: environment.apiUrl,
        }),
      });
    } catch (error) {
      console.error('Error appending primary server down revision:', error);
    }
  }

  async appendPrimaryServerConnectedRev() {
    try {
      await this.append({
        device_id: environment.serverName + ' : primary-server-connect',
        type: 'primary-server-connect',
        status: 'PRIMARY_SERVER_CONNECT',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: 'connected',
      });
    } catch (error) {
      console.error('Error appending primary server connect revision:', error);
    }
  }

  async appendSecondaryServerOnlineRev(serverUrl: string) {
    try {
      await this.append({
        device_id: environment.serverName + ' : secondary-server-online',
        type: 'secondary-server-online',
        status: 'SECONDARY_SERVER_ONLINE',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: JSON.stringify({
          serverUrl: serverUrl,
          message: 'Switched to secondary server',
        }),
      });
      console.log(
        '✅ [DeviceMonitoringHistory] Secondary server online logged:',
        serverUrl,
      );
    } catch (error) {
      console.error('Error appending secondary server online revision:', error);
    }
  }
}
