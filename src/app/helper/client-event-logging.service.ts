import { Injectable, OnDestroy } from '@angular/core';
import { DeviceMonitoringHistoryFacade } from '../core/Database/collection/device-monitoring-history/facade.service';
import { NetworkStatusService } from '../core/Database/services/network-status.service';
import { ClientIdentityService } from '../services/client-identity.service';
import { Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ClientEventLoggingService implements OnDestroy {
  private initialized = false;
  private lastStatus: 'ONLINE' | 'OFFLINE' | undefined;
  private networkSubscription?: Subscription;

  constructor(
    private readonly history: DeviceMonitoringHistoryFacade,
    private readonly identity: ClientIdentityService,
    private readonly networkStatus: NetworkStatusService,
  ) {}

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const createdBy = await this.identity.getClientId();
    if (!createdBy) {
      return;
    }

    const lastLog = await this.history.getLastByCreatedBy(createdBy);

    const shouldCreate =
      !lastLog || // ไม่มี log เลย (first time)
      ((lastLog.status === 'ONLINE' || lastLog.meta_data === 'ONLINE') &&
        lastLog.meta_data !== 'START_APP');

    if (shouldCreate) {
      try {
        await this.history.append({
          device_id: createdBy, // ใช้ clientId เป็น device_i
          type: this.identity.getClientType(),
          status: 'ONLINE',
          meta_data: 'START_APP',
          created_by: createdBy,
          client_created_at: Date.now().toString(),
        });
        this.lastStatus = 'ONLINE';
      } catch (error) {
        console.error(
          '❌ [ClientEventLogging] Error creating start_app log:',
          error,
        );
      }
    } else {
      console.log(
        'ℹ️ [ClientEventLogging] Skipping start_app log creation (conditions not met)',
      );
    }

    this.initialized = true;

    this.networkSubscription = this.networkStatus.isOnline$
      .pipe(distinctUntilChanged())
      .subscribe(async (isOnline) => {
        const createdBy = await this.identity.getClientId();
        const status: 'ONLINE' | 'OFFLINE' = isOnline ? 'ONLINE' : 'OFFLINE';

        if (this.lastStatus === status) {
          return;
        }

        if (this.lastStatus === undefined && status === 'ONLINE') {
          this.lastStatus = status;
          return;
        }

        try {
          const last = await this.history.getLastByCreatedBy(createdBy || '');
          if (last?.status === status) {
            this.lastStatus = status;
            return;
          }

          await this.history.append({
            device_id: createdBy || '',
            type: this.identity.getClientType(),
            status,
            meta_data: `NETWORK_EVENT: ${createdBy} => ${status}`,
            created_by: createdBy || '',
            client_created_at: Date.now().toString(),
          });
          this.lastStatus = status;
        } catch (error) {
          console.error(
            '❌ [ClientEventLogging] Error logging network event:',
            error,
          );
        }
      });
  }

  ngOnDestroy(): void {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
  }
}
