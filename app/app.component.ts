import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/services/database.service';
import { ReplicationStateMonitorService } from './core/Database/replication/services/replication-state-monitor.service';
import { ClientHealthService } from './core/Database/services/client-health.service';
import { ReplicationCoordinatorService } from './core/Database/services/replication-coordinator.service';
import 'zone.js/plugins/zone-patch-rxjs';
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
    private replicationCoordinator: ReplicationCoordinatorService,
  ) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');

    // Subscribe to primary recovery events from database service
    // Delegate to coordinator for centralized handling
    this.databaseService.onPrimaryRecovery(async () => {
      console.log('📢 [AppComponent] Primary recovery event received');
      const currentState =
        this.replicationMonitorService.getAllReplicationsState();
      const isOnSecondary = currentState.currentServer === 'secondary';

      if (isOnSecondary) {
        console.log(
          '✅ [AppComponent] Delegating primary recovery to coordinator...',
        );
        await this.replicationCoordinator.handlePrimaryRecovery();
      }
    });
  }

  ngOnDestroy() {
    // Stop replications via coordinator
    this.replicationCoordinator.handleAppDestroy();
  }
}
