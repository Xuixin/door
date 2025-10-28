import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  LoadingController,
} from '@ionic/angular';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { RippleModule } from 'primeng/ripple';
import { DoorPreferenceService } from '../../services/door-preference.service';
import { DoorApiService } from 'src/app/core/Api/grapgql/door.service';
import { DoorDocument } from 'src/app/core/Api/grapgql/door.service';
import { DatabaseService } from 'src/app/core/Database/rxdb.service';

export type Door = Omit<
  DoorDocument,
  | 'checkpoint'
  | 'client_created_at'
  | 'client_updated_at'
  | 'server_created_at'
  | 'server_updated_at'
  | 'deleted'
>;

@Component({
  selector: 'app-door-selection-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonModule, CardModule, RippleModule],
  templateUrl: './door-selection-modal.component.html',
  styleUrls: ['./door-selection-modal.component.scss'],
})
export class DoorSelectionModalComponent implements OnInit {
  doors = signal<Door[]>([]);
  selectedDoorId = signal<string>('');
  isLoading = signal<boolean>(true);
  error = signal<string>('');
  isInitializing = signal<boolean>(false);

  constructor(
    private modalController: ModalController,
    private doorPreferenceService: DoorPreferenceService,
    private doorApiService: DoorApiService,
    private databaseService: DatabaseService,
    private loadingController: LoadingController,
  ) {}

  ngOnInit() {
    this.loadDoors();
  }

  /**
   * Load doors from GraphQL
   */
  private async loadDoors() {
    try {
      this.isLoading.set(true);
      this.error.set('');

      console.log('🚪 Loading doors from GraphQL API...');

      let doors: Door[] = [];

      try {
        doors = await this.doorApiService.pullDoors();
        console.log('✅ Loaded doors via pullDoors:', doors.length);
      } catch (pullError) {
        console.warn('⚠️ pullDoors failed, trying getAllDoors:', pullError);

        try {
          doors = await this.doorApiService.pullDoors();
          console.log('✅ Loaded doors via getAllDoors:', doors.length);
        } catch (getAllError) {
          console.error('❌ Both GraphQL queries failed:', getAllError);
          throw getAllError;
        }
      }

      if (doors.length === 0) {
        console.warn('⚠️ No doors returned from API, using fallback data');
        doors = this.getFallbackDoors();
      }

      const transformedDoors = doors.map((door) => ({
        id: door.id,
        name: door.name,
        description: `ประตู ${door.id}`,
      }));

      this.doors.set(doors);
      this.isLoading.set(false);

      console.log('✅ Doors loaded successfully:', transformedDoors.length);
    } catch (error) {
      console.error('❌ Error loading doors:', error);

      console.log('🔄 Using fallback door data');
      const fallbackDoors = this.getFallbackDoors();
      this.doors.set(fallbackDoors);
      this.error.set('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ ใช้ข้อมูลสำรอง');
      this.isLoading.set(false);
    }
  }

  /**
   * Get fallback door data
   */
  private getFallbackDoors(): Door[] {
    return [
      {
        id: 'door-1',
        name: 'ประตู 1 - ทางเข้าหลัก',
      },
      {
        id: 'door-2',
        name: 'ประตู 2 - ทางเข้าด้านข้าง',
      },
      {
        id: 'door-3',
        name: 'ประตู 3 - ทางเข้าห้องประชุม',
      },
      {
        id: 'door-4',
        name: 'ประตู 4 - ทางเข้าห้องสมุด',
      },
      {
        id: 'door-5',
        name: 'ประตู 5 - ทางเข้าห้องแล็บ',
      },
    ];
  }

  /**
   * Select a door
   */
  selectDoor(doorId: string, doorName: string) {
    this.selectedDoorId.set(doorId);
    this.doorPreferenceService.setDoorName(doorName);
  }

  /**
   * Check if a door is selected
   */
  isSelected(doorId: string): boolean {
    return this.selectedDoorId() === doorId;
  }

  /**
   * Confirm door selection
   */
  async confirmSelection() {
    const selectedId = this.selectedDoorId();
    if (!selectedId) {
      this.error.set('กรุณาเลือกประตู');
      return;
    }

    // Check if already initializing
    if (this.isInitializing()) {
      return;
    }

    let loading: HTMLIonLoadingElement | null = null;

    try {
      this.isInitializing.set(true);

      // Show loading spinner
      loading = await this.loadingController.create({
        message: 'กำลังเตรียมฐานข้อมูล...',
        spinner: 'crescent',
        translucent: true,
        backdropDismiss: false,
      });
      await loading.present();

      // Find the selected door to get its name
      const selectedDoor = this.doors().find((d) => d.id === selectedId);
      const doorName = selectedDoor?.name || `ประตู ${selectedId}`;

      // Save door ID and name
      const success = await this.doorPreferenceService.setDoorId(selectedId);
      await this.doorPreferenceService.setDoorName(doorName);

      if (!success) {
        this.error.set('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        return;
      }

      // Initialize database with the selected door ID
      console.log(`🚀 Initializing database for door: ${selectedId}`);
      await this.databaseService.initialize(selectedId);
      console.log(
        `✅ Database initialized successfully for door: ${selectedId}`,
      );

      // Dismiss loading
      if (loading) {
        await loading.dismiss();
        loading = null;
      }

      // Dismiss modal with success
      await this.modalController.dismiss(selectedId);
    } catch (error) {
      console.error('❌ Error during door selection:', error);

      // Dismiss loading if still showing
      if (loading) {
        await loading.dismiss();
      }

      // Rollback preference on error
      await this.doorPreferenceService.removeDoorId();

      this.error.set('เกิดข้อผิดพลาดในการเตรียมฐานข้อมูล กรุณาลองใหม่อีกครั้ง');
    } finally {
      this.isInitializing.set(false);
    }
  }

  /**
   * Cancel selection
   */
  async cancel() {
    await this.modalController.dismiss(null);
  }

  /**
   * Retry loading doors
   */
  retry() {
    this.loadDoors();
  }

  /**
   * Get selected door name
   */
  getSelectedDoorName(): string {
    const selectedId = this.selectedDoorId();
    if (!selectedId) return '';

    const selectedDoor = this.doors().find((d) => d.id === selectedId);
    return selectedDoor ? selectedDoor.name : '';
  }
}
