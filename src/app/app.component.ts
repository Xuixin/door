import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/rxdb.service';
import { DoorPreferenceService } from './services/door-preference.service';
import { ClientEventLoggingService } from './core/monitoring/client-event-logging.service';
import {
  ModalController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { DoorSelectionModalComponent } from './components/door-selection-modal/door-selection-modal.component';

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
    private doorPreferenceService: DoorPreferenceService,
    private modalController: ModalController,
    private loadingController: LoadingController,
    private alertController: AlertController,
    private clientEventLoggingService: ClientEventLoggingService,
  ) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');

    try {
      // Check if door is already selected
      const doorId = await this.doorPreferenceService.getDoorId();

      if (!doorId) {
        // No door selected - show modal
        console.log('🚪 No door selected, opening door selection modal');
        await this.openDoorSelectionModal();
      } else {
        // Door already selected - initialize database
        console.log(
          `🚪 Door already selected: ${doorId}, initializing database`,
        );
        await this.initializeWithDoorId(doorId);
      }
    } catch (error) {
      console.error('❌ Error during app initialization:', error);
      await this.handleInitializationError(error);
    }
  }

  ngOnDestroy() {
    this.databaseService.stopReplication();
  }

  /**
   * Open door selection modal
   */
  private async openDoorSelectionModal() {
    const modal = await this.modalController.create({
      component: DoorSelectionModalComponent,
      backdropDismiss: false, // Force selection
      cssClass: 'door-selection-modal',
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data) {
      console.log(`✅ Door selected: ${data}`);
      // Database is already initialized by the modal
    } else {
      console.warn('⚠️ Door selection was cancelled');
      // Retry opening modal
      setTimeout(() => this.openDoorSelectionModal(), 1000);
    }
  }

  /**
   * Initialize database with existing door ID
   */
  private async initializeWithDoorId(doorId: string) {
    const loading = await this.loadingController.create({
      message: 'กำลังเตรียมระบบ...',
      spinner: 'crescent',
      translucent: true,
      backdropDismiss: false,
    });

    await loading.present();

    try {
      // Check if already initialized with same door
      if (
        this.databaseService.isInitialized &&
        this.databaseService.currentDoorId === doorId
      ) {
        console.log('Database already initialized with same door');
        await this.clientEventLoggingService.init();
        await loading.dismiss();
        return;
      }

      // Initialize database
      await this.databaseService.initialize(doorId);
      console.log(`✅ Database initialized successfully for door: ${doorId}`);

      // Start client event logging after DB is ready
      await this.clientEventLoggingService.init();

      await loading.dismiss();
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      await loading.dismiss();

      // Show error and retry with door selection
      await this.showErrorAndRetry(error);
    }
  }

  /**
   * Handle initialization errors
   */
  private async handleInitializationError(error: any) {
    const alert = await this.alertController.create({
      header: 'เกิดข้อผิดพลาด',
      message: 'ไม่สามารถเริ่มต้นระบบได้ กรุณาลองใหม่อีกครั้ง',
      buttons: [
        {
          text: 'ลองใหม่',
          handler: () => {
            window.location.reload();
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Show error and retry with door selection
   */
  private async showErrorAndRetry(error: any) {
    const alert = await this.alertController.create({
      header: 'เกิดข้อผิดพลาด',
      message: 'ไม่สามารถเปิดฐานข้อมูลได้ กรุณาเลือกประตูใหม่',
      buttons: [
        {
          text: 'เลือกประตูใหม่',
          handler: async () => {
            // Remove door preference
            await this.doorPreferenceService.removeDoorId();
            // Open door selection modal
            await this.openDoorSelectionModal();
          },
        },
      ],
    });

    await alert.present();
  }
}
