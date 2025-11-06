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

    // Setup global error handler to filter RxDB cleanup errors
    this.setupGlobalErrorHandling();
  }

  /**
   * Setup global error handling to filter expected RxDB cleanup errors
   */
  private setupGlobalErrorHandling(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason;
      const errorMessage = error?.message || error?.toString() || '';
      const errorStack = error?.stack || '';

      // Filter out expected "RxStorageInstanceDexie is closed" errors
      if (
        errorMessage.includes('RxStorageInstanceDexie is closed') ||
        errorMessage.includes('RxStorageInstance') ||
        errorStack.includes('RxStorageInstanceDexie') ||
        errorStack.includes('ensureNotClosed')
      ) {
        // Prevent this error from being logged
        event.preventDefault();
        console.debug(
          '🔇 [AppComponent] Suppressed expected RxDB storage closed error during cleanup',
        );
        return;
      }
    });

    // Handle global errors (window.onerror)
    window.addEventListener('error', (event) => {
      const errorMessage = event.message || event.error?.message || '';
      const errorStack = event.error?.stack || '';

      // Filter out expected "RxStorageInstanceDexie is closed" errors
      if (
        errorMessage.includes('RxStorageInstanceDexie is closed') ||
        errorMessage.includes('RxStorageInstance') ||
        errorStack.includes('RxStorageInstanceDexie') ||
        errorStack.includes('ensureNotClosed')
      ) {
        // Prevent this error from being logged
        event.preventDefault();
        console.debug(
          '🔇 [AppComponent] Suppressed expected RxDB storage closed error during cleanup',
        );
        return;
      }
    });
  }

  ngOnDestroy() {
    // Stop replications through coordinator
    this.coordinator.handleAppDestroy();
  }
}
