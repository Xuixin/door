import {
  Injector,
  NgModule,
  APP_INITIALIZER,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { HttpClientModule } from '@angular/common/http';

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
import { DatabaseService } from './core/Database/rxdb.service';
import { WorkflowPreloadService } from './flow-services/workflow-preload.service';
import Aura from '@primeng/themes/aura';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    IonicModule.forRoot(),
    AppRoutingModule,
    HttpClientModule,
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  providers: [
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy,
    },
    provideIonicAngular(),
    // * database - now initialized on-demand after door selection
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
