import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/services/database.service';
import { ReplicationStateMonitorService } from './core/Database/replication';
import { ClientHealthService } from './core/Database/services/client-health.service';
import 'zone.js/plugins/zone-patch-rxjs';
import { ServerHealthService } from './core/Database/services/server-health.service';
@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  constructor(
    private databaseService: DatabaseService,
    private replicationMonitorService: ReplicationStateMonitorService,
    // Inject ClientHealthService to initialize offline/online monitoring
    private clientHealthService: ClientHealthService,
    private serverHealthService: ServerHealthService,
  ) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');

    // Subscribe to primary recovery events from database service
    // This replaces the old watcher approach - more efficient as it detects
    // primary server recovery directly from replication data
    this.databaseService.onPrimaryRecovery(async () => {
      console.log('📢 [AppComponent] Primary recovery event received');
      const currentState =
        this.replicationMonitorService.getAllReplicationsState();
      const isOnSecondary = currentState.currentServer === 'secondary';

      if (isOnSecondary) {
        console.log('✅ [AppComponent] Switching to primary server...');
        await this.databaseService.switchToPrimary();
      }
    });
  }

  ngOnDestroy() {
    // Stop replications
    this.databaseService.stopReplication();
  }
}
