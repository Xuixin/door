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
import {
  DeviceApiService,
  DeviceMonitoringDocument,
} from 'src/app/core/api/graphql/device-api.service';
import { ClientIdentityService } from 'src/app/services/client-identity.service';
import { environment } from 'src/environments/environment';

export type Device = Pick<
  DeviceMonitoringDocument,
  'id' | 'name' | 'type' | 'status'
>;

@Component({
  selector: 'app-device-selection-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonModule, CardModule, RippleModule],
  templateUrl: './device-selection-modal.component.html',
  styleUrls: ['./device-selection-modal.component.scss'],
})
export class DeviceSelectionModalComponent implements OnInit {
  devices = signal<Device[]>([]);
  selectedDeviceId = signal<string>('');
  isLoading = signal<boolean>(true);
  error = signal<string>('');
  isInitializing = signal<boolean>(false);
  serverInfo = signal<string>(''); // Show which server is being used

  constructor(
    private modalController: ModalController,
    private identityService: ClientIdentityService,
    private deviceApiService: DeviceApiService,
    private loadingController: LoadingController,
  ) {}

  ngOnInit() {
    this.loadDevices();
  }

  /**
   * Load devices from GraphQL API filtered by client type
   * Automatically tries secondary server if primary fails
   */
  private async loadDevices() {
    try {
      this.isLoading.set(true);
      this.error.set('');
      this.serverInfo.set('');

      const clientType = this.identityService.getClientType();
      console.log(`🔍 Loading devices for type: ${clientType}`);

      const devices = await this.deviceApiService.listDevicesByType(clientType);

      if (devices.length === 0) {
        this.error.set(
          `ไม่พบเครื่องสำหรับประเภท ${clientType} กรุณาติดต่อเจ้าหน้าที่`,
        );
        this.isLoading.set(false);
        return;
      }

      // Transform to Device type (only needed fields)
      const transformedDevices: Device[] = devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        status: device.status,
      }));

      this.devices.set(transformedDevices);

      // Show server info if using secondary
      if (this.deviceApiService.isUsingSecondaryServer()) {
        this.serverInfo.set('⚠️ เชื่อมต่อผ่านเซิร์ฟเวอร์สำรอง');
      } else {
        this.serverInfo.set('');
      }

      this.isLoading.set(false);

      console.log(
        `✅ Loaded ${transformedDevices.length} device(s) successfully`,
      );
    } catch (error: any) {
      console.error('❌ Error loading devices:', error);
      this.error.set(
        error.message ||
          'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
      );
      this.isLoading.set(false);
      // Don't throw - let user see error and retry
    }
  }

  /**
   * Select a device
   */
  selectDevice(deviceId: string) {
    this.selectedDeviceId.set(deviceId);
  }

  /**
   * Check if a device is selected
   */
  isSelected(deviceId: string): boolean {
    return this.selectedDeviceId() === deviceId;
  }

  /**
   * Confirm device selection
   */
  async confirmSelection() {
    const selectedId = this.selectedDeviceId();
    if (!selectedId) {
      this.error.set('กรุณาเลือกเครื่อง');
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
        message: 'กำลังบันทึกข้อมูลเครื่อง...',
        spinner: 'crescent',
        translucent: true,
        backdropDismiss: false,
      });
      await loading.present();

      // Find the selected device to get its details
      const selectedDevice = this.devices().find((d) => d.id === selectedId);
      if (!selectedDevice) {
        throw new Error('Selected device not found');
      }

      // Save device information to Preferences
      await this.identityService.setClientId(selectedDevice.id);
      await this.identityService.setClientName(selectedDevice.name);
      await this.identityService.setClientType(selectedDevice.type);

      console.log(
        `✅ Device saved: ${selectedDevice.id} - ${selectedDevice.name}`,
      );

      // Note: Database initialization will be handled by APP_INITIALIZER
      // after modal dismisses with the selected device data

      // Dismiss loading
      if (loading) {
        await loading.dismiss();
        loading = null;
      }

      // Dismiss modal with success
      await this.modalController.dismiss({
        id: selectedDevice.id,
        name: selectedDevice.name,
        type: selectedDevice.type,
      });
    } catch (error: any) {
      console.error('❌ Error during device selection:', error);

      // Dismiss loading if still showing
      if (loading) {
        await loading.dismiss();
      }

      // Rollback on error
      await this.identityService.removeClientId();

      this.error.set(
        error.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง',
      );
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
   * Retry loading devices
   */
  retry() {
    this.loadDevices();
  }

  /**
   * Get selected device name
   */
  getSelectedDeviceName(): string {
    const selectedId = this.selectedDeviceId();
    if (!selectedId) return '';

    const selectedDevice = this.devices().find((d) => d.id === selectedId);
    return selectedDevice ? selectedDevice.name : '';
  }
}
