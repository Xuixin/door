import {
  Injector,
  NgModule,
  APP_INITIALIZER,
  CUSTOM_ELEMENTS_SCHEMA,
  ErrorHandler,
} from '@angular/core';
import { ModalController } from '@ionic/angular';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

import { IonicModule } from '@ionic/angular';
import {
  IonicRouteStrategy,
  provideIonicAngular,
} from '@ionic/angular/standalone';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MessageService } from 'primeng/api';
import { ConfirmationService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import { DatabaseService } from './core/Database/services/database.service';
import { WorkflowPreloadService } from './flow-services/workflow-preload.service';
import { ClientIdentityService } from './services/client-identity.service';
import Aura from '@primeng/themes/aura';
import { ClientEventLoggingService } from './helper/client-event-logging.service';
import { OfflineHttpInterceptor } from './core/interceptors/offline-http.interceptor';
import { OfflineBannerComponent } from './components/offline-banner/offline-banner.component';
import { StatusComponent } from './components/status/status.component';
// Ionic Icons
import { addIcons } from 'ionicons';
import {
  saveOutline,
  warning,
  wifiOutline,
  documentTextOutline,
  archiveOutline,
  cloudOfflineOutline,
  settingsOutline,
} from 'ionicons/icons';

// Register Ionic Icons
addIcons({
  'save-outline': saveOutline,
  warning: warning,
  'wifi-outline': wifiOutline,
  'document-text-outline': documentTextOutline,
  'archive-outline': archiveOutline,
  'cloud-offline-outline': cloudOfflineOutline,
  'settings-outline': settingsOutline,
});

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
    OfflineBannerComponent,
    StatusComponent,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy,
    },
    provideIonicAngular(),
    // * database initialization
    // Initialize database service (RxDB with all collections and replications)
    // If no clientId, will show device-selection-modal to user
    {
      provide: APP_INITIALIZER,
      useFactory: (injector: Injector) => async () => {
        console.log('🚀 [AppModule] Starting database initialization...');

        try {
          const identityService = injector.get(ClientIdentityService);
          const dbService = injector.get(DatabaseService);

          // Check if client ID exists, if not show device selection modal
          let clientId = await identityService.getClientId();

          if (!clientId) {
            // No client ID - need to select device
            console.log(
              '📱 [AppModule] No client ID found, showing device selection modal...',
            );

            // Get ModalController from injector
            const modalController = injector.get(ModalController);

            // Show device selection modal
            const { DeviceSelectionModalComponent } = await import(
              './components/device-selection-modal/device-selection-modal.component'
            );

            const modal = await modalController.create({
              component: DeviceSelectionModalComponent,
              backdropDismiss: false,
              cssClass: 'device-selection-modal',
            });

            await modal.present();
            const result = await modal.onDidDismiss();

            if (!result.data || !result.data.id) {
              throw new Error(
                'Device selection was cancelled. Internet connection is required to select a device.',
              );
            }

            const selectedDevice = result.data;
            console.log('✅ [AppModule] Device selected:', selectedDevice);

            // Device should already be saved by the modal component
            // Verify it was saved
            clientId = await identityService.getClientId();
            if (!clientId) {
              throw new Error('Failed to save device information');
            }
          }

          // Now initialize database with clientId
          console.log(
            '🚀 [AppModule] Initializing database with clientId...',
            clientId,
          );
          await dbService.initializeDatabase();
          console.log('✅ [AppModule] Database initialized successfully');
        } catch (error: any) {
          console.error(
            '❌ [AppModule] Fatal error during database initialization:',
            error,
          );
          // Throw error - device selection and database initialization are required
          throw error;
        }
      },
      multi: true,
      deps: [Injector],
    },
    // * client event logging (ensure DB initialized first)
    {
      provide: APP_INITIALIZER,
      useFactory:
        (dbService: DatabaseService, svc: ClientEventLoggingService) => () =>
          (async () => {
            // Wait for DB init (idempotent if already initialized)
            await dbService.initializeDatabase();
            await svc.init();
          })(),
      multi: true,
      deps: [DatabaseService, ClientEventLoggingService],
    },
    // * workflow preload
    {
      provide: APP_INITIALIZER,
      useFactory: (preloadService: WorkflowPreloadService) => () => {
        console.log('🚀 [AppModule] Starting workflow component preload...');
        return preloadService.preloadWorkflowComponents();
      },
      multi: true,
      deps: [WorkflowPreloadService],
    },
    DatabaseService,
    WorkflowPreloadService,
    // * HTTP interceptors
    {
      provide: HTTP_INTERCEPTORS,
      useClass: OfflineHttpInterceptor,
      multi: true,
    },
    // * animations
    provideAnimationsAsync(),
    MessageService,
    ConfirmationService,

    // * primeng
    providePrimeNG({
      theme: {
        preset: Aura,
        options: { darkModeSelector: false },
      },
      ripple: true,
      zIndex: {
        modal: 9000, // dialog, sidebar
        overlay: 9500, // dropdown, overlaypanel
        menu: 10000, // overlay menus
        tooltip: 11000, // tooltip
      },
    }),
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}
