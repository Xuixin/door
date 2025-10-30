import { Injectable, inject } from '@angular/core';
import { DatabaseService } from '../rxdb.service';
import { RxLogClientCollection } from '../RxDB.D';
import { LogClientDocument } from '../../schema/log-client.schema';
import { Observable, map } from 'rxjs';
import { ClientIdentityService } from '../../identity/client-identity.service';

@Injectable({ providedIn: 'root' })
export class LogClientFacade {
  private readonly db = inject(DatabaseService);
  private readonly identity = inject(ClientIdentityService);

  private get collection(): RxLogClientCollection {
    return this.db.db.log_client;
  }

  async append(
    entry: Partial<LogClientDocument> & { status: string; meta_data: string },
  ): Promise<void> {
    const now = Date.now().toString();
    const id = entry.id || crypto.randomUUID();
    const client_id = entry.client_id || (await this.identity.getClientId());
    const doc: LogClientDocument = {
      id,
      client_id: client_id || '',
      type: (entry.type as any) || (this.identity.getClientType() as any),
      status: entry.status,
      meta_data: entry.meta_data,
      client_created_at: entry.client_created_at || now,
      server_created_at: (entry.server_created_at as any) ?? '',
      diff_time_create: (entry.diff_time_create as any) ?? '',
      server_updated_at: (entry.server_updated_at as any) ?? '',
    };
    await this.collection.insert(doc as any);
  }

  getLogs$(): Observable<LogClientDocument[]> {
    return this.collection.find().$ as any;
  }

  countOfflineEvents$(clientId?: string): Observable<number> {
    const query = clientId
      ? this.collection.find({
          selector: { client_id: clientId, status: 'OFFLINE' },
        })
      : this.collection.find({ selector: { status: 'OFFLINE' } });
    return (query.$ as any).pipe(map((docs: any[]) => docs.length));
  }

  async getLastByClient(clientId: string): Promise<LogClientDocument | null> {
    const docs = await this.collection
      .find({
        selector: { client_id: clientId },
        sort: [{ client_created_at: 'desc' } as any],
        limit: 1,
      })
      .exec();
    const last = (docs?.[0] as any)?.toJSON?.() as
      | LogClientDocument
      | undefined;
    return last ?? null;
  }

  async appendIfChanged(params: {
    client_id: string;
    type?: 'KIOSK' | 'DOOR';
    status: string;
    meta_data: string;
    minGapMs?: number; // default 30000
  }): Promise<boolean> {
    const minGapMs = params.minGapMs ?? 30000;
    const last = await this.getLastByClient(params.client_id);
    const now = Date.now();
    const lastTs = last ? Number(last.client_created_at) : 0;
    const sameStatus = last && last.status === params.status;
    const recent = last && now - lastTs < minGapMs;

    if (sameStatus && recent) return false; // skip duplicate burst
    await this.append({
      client_id: params.client_id,
      type: params.type ?? 'KIOSK',
      status: params.status,
      meta_data: params.meta_data,
      client_created_at: String(now),
    });
    return true;
  }
}
