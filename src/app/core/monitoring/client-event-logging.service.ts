import { Injectable } from '@angular/core';
// App events not used for now; only network events per requirement
import { Network } from '@capacitor/network';
import { LogClientFacade } from '../Database/facade/log-client.service';
import { NetworkStatusService } from '../Database/network-status.service';
import { ClientIdentityService } from '../identity/client-identity.service';

@Injectable({ providedIn: 'root' })
export class ClientEventLoggingService {
  private initialized = false;
  private lastStatus: 'ONLINE' | 'OFFLINE' | undefined;

  constructor(
    private readonly logs: LogClientFacade,
    private readonly networkStatus: NetworkStatusService,
    private readonly identity: ClientIdentityService,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Only network events; create log only if latest differs
    Network.addListener('networkStatusChange', async (st) => {
      const clientId = await this.identity.getClientId();
      if (!clientId) {
        // Can't log if client ID is null
        return;
      }
      const status: 'ONLINE' | 'OFFLINE' = st.connected ? 'ONLINE' : 'OFFLINE';
      const last = await this.logs.getLastByClient(clientId);
      if (last?.status === status) {
        return; // skip duplicate (e.g., page refresh)
      }
      await this.logs.append({
        client_id: clientId,
        type: this.identity.getClientType() as any,
        status,
        meta_data: status, // meta only ONLINE/OFFLINE
        client_created_at: Date.now().toString(),
      });
      this.lastStatus = status;
    });
  }
}
