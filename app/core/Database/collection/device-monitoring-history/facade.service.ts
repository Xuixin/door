import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { BaseFacadeService } from '../../services/base-facade.service';
import { ClientIdentityService } from '../../../../services/client-identity.service';
import { environment } from '../../../../../environments/environment';

export interface DeviceMonitoringHistoryDocument {
  id: string;
  device_id: string;
  type: string;
  status: string;
  meta_data: string;
  created_by: string;
  client_created_at: string;
  client_updated_at: string;
  server_created_at?: string;
  server_updated_at?: string;
  cloud_created_at?: string;
  cloud_updated_at?: string;
  diff_time_create?: string;
  diff_time_update?: string;
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class DeviceMonitoringHistoryFacade extends BaseFacadeService<DeviceMonitoringHistoryDocument> {
  private readonly identity = inject(ClientIdentityService);

  protected getCollectionName(): string {
    return 'devicemonitoringhistory';
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
    await collection.insert(doc as any);
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
      .find()
      .$.pipe(
        map((docs: any[]) => docs.filter((doc: any) => !(doc as any)._deleted)),
      );
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
      .find({
        selector,
      } as any)
      .$.pipe(
        map(
          (docs: any[]) =>
            docs.filter((doc: any) => !(doc as any)._deleted).length,
        ),
      );
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

    const result = await collection
      .find({
        selector: { created_by: createdBy } as any,
      })
      .sort({ client_created_at: 'desc' })
      .limit(1)
      .exec();

    return result.length > 0 && !(result[0] as any)._deleted
      ? (result[0] as any)
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

    const result = await collection
      .find({
        selector: { created_by: createdBy } as any,
      })
      .sort({ client_created_at: 'desc' })
      .exec();

    return result.filter((doc) => !(doc as any)._deleted) as any[];
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

    const result = await collection
      .find({
        selector: { type } as any,
      })
      .sort({ client_created_at: 'desc' })
      .exec();

    return result.filter((doc) => !(doc as any)._deleted) as any[];
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

    const result = await collection
      .find({
        selector: { type } as any,
      })
      .sort({ client_created_at: 'desc' })
      .limit(1)
      .exec();

    const docs = result.filter((doc) => !(doc as any)._deleted);
    return docs.length > 0 ? (docs[0] as any) : null;
  }

  async appendPrimaryServerDownRev(code?: number, message?: string) {
    try {
      const client = await this.identity.getClientId();
      await this.append({
        device_id: environment.serverId,
        type: 'SERVER',
        status: code === 1006 ? 'OFFLINE' : 'ERROR',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: `${client} disconnect from ${environment.apiUrl} server`,
      });
    } catch (error) {
      console.error('Error appending primary server down revision:', error);
    }
  }

  async appendPrimaryServerConnectedRev() {
    const client = await this.identity.getClientId();
    try {
      await this.append({
        device_id: environment.serverId,
        type: 'SERVER',
        status: 'ONLINE',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: `${client} connect to ${environment.serverId} server`,
      });
    } catch (error) {
      console.error('Error appending primary server connect revision:', error);
    }
  }

  async appendSecondaryServerConnectedRev() {
    const client = await this.identity.getClientId();
    try {
      await this.append({
        device_id: environment.serverId,
        type: 'CLOUD',
        status: 'ONLINE',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: `${client} connect to cloud ${environment.apiSecondaryUrl} server`,
      });
    } catch (error) {
      console.error(
        'Error appending secondary server connect revision:',
        error,
      );
    }
  }

  async appendSecondaryServerOnlineRev(serverUrl: string) {
    try {
      const client = await this.identity.getClientId();
      await this.append({
        device_id: environment.apiSecondaryUrl + ' : ' + environment.serverId,
        type: 'SERVER',
        status: 'ONLINE',
        created_by: (await this.identity.getClientId()) || '',
        client_created_at: Date.now().toString(),
        meta_data: `${client} connect to ${environment.apiSecondaryUrl} server`,
      });
    } catch (error) {
      console.error('Error appending secondary server online revision:', error);
    }
  }
}
