import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/core/services/database.service';
import { AdapterProviderService } from './core/Database/core/factory';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

import 'zone.js/plugins/zone-patch-rxjs';
import { ReplicationFailoverService } from './core/Database/core/services/replication-failover.service';
import { DeviceMonitoringFacade } from './core/Database/collections/device-monitoring';
@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  private deviceWatcherSubscription?: Subscription;

  constructor(
    private databaseService: DatabaseService,
    private failoverService: ReplicationFailoverService,
    private deviceMonitoringFacade: DeviceMonitoringFacade,
  ) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');

    // Setup primary server recovery watcher
    this.setupPrimaryServerWatcher();
  }

  ngOnDestroy() {
    this.databaseService.stopReplication();
    this.deviceWatcherSubscription?.unsubscribe();
  }

  /**
   * Setup global watcher for primary server recovery
   * Monitors device status changes in local database
   */
  private setupPrimaryServerWatcher(): void {
    console.log(
      '🔍 [AppComponent] Setting up global primary server watcher...',
    );

    // Watch for changes to the primary server device (environment.serverId)
    this.deviceWatcherSubscription = this.deviceMonitoringFacade
      .getDeviceMonitoring$()
      .pipe(
        map((devices) => devices.find((d) => d.id === environment.serverId)),
        filter((device) => !!device && device.status === 'ONLINE'),
      )
      .subscribe(async (device: any) => {
        if (device) {
          console.log('🎯 [AppComponent] Primary server detected as ONLINE!', {
            id: device.id,
            name: device.name,
            status: device.status,
            meta_data: device.meta_data,
            created_by: device.created_by,
          });

          // Check if we're currently on secondary server
          const currentUrls = this.failoverService.getCurrentUrls();
          if (currentUrls?.http?.includes(':3001')) {
            console.log(
              '✅ [AppComponent] Currently on secondary, switching to primary...',
            );
            await this.failoverService.switchToPrimary();
          } else {
            console.log(
              'ℹ️ [AppComponent] Already on primary server, no action needed',
            );
          }
        }
      });
  }
}
