import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/services/database.service';
import { ReplicationCoordinatorService } from './core/Database/services/replication-coordinator.service';
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
    private coordinator: ReplicationCoordinatorService,
    // Inject ClientHealthService to initialize offline/online monitoring
    private clientHealthService: ClientHealthService,
    private serverHealthService: ServerHealthService,
  ) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');

    // Subscribe to primary recovery events from database service
    // Delegate to coordinator for centralized handling
    this.databaseService.onPrimaryRecovery(async () => {
      console.log('📢 [AppComponent] Primary recovery event received');
      await this.coordinator.handlePrimaryRecovery();
    });
  }

  ngOnDestroy() {
    // Stop replications through coordinator
    this.coordinator.handleAppDestroy();
  }
}
