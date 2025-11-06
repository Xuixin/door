import { CommonModule } from '@angular/common';
import { Component, Input, signal, inject, OnDestroy } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ButtonModule } from 'primeng/button';
import { BaseFlowController } from '../../../base-flow-controller.component';
import { RegistryContextHelper } from '../../../helpers/registry-context.helper';
import {
  DeviceMonitoringFacade,
  DeviceMonitoringDocument,
} from 'src/app/core/Database/collection/device-monitoring/facade.service';
import { Subscription } from 'rxjs';

interface DoorWithSelection extends DeviceMonitoringDocument {
  selected: boolean;
}

@Component({
  selector: 'app-door-permission',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonModule],
  styles: [],
  templateUrl: 'door-permission.component.html',
})
export class DoorPermissionComponent
  extends BaseFlowController
  implements OnDestroy
{
  @Input() override data: Record<string, any> = {};

  private deviceMonitoringFacade = inject(DeviceMonitoringFacade);

  // Door data from device-monitoring collection (type='DOOR')
  doorData = signal<DoorWithSelection[]>([]);

  private doorsSubscription?: Subscription;

  constructor() {
    super();
    this.deviceMonitoringFacade.ensureInitialized();

    // Subscribe directly to doors$ observable
    this.doorsSubscription = this.deviceMonitoringFacade.getDoors$().subscribe({
      next: (doors) => {
        console.log(
          '[DoorPermission] Doors$ emitted:',
          doors.length,
          'doors',
          doors,
        );

        // Update doorData signal, preserving selections
        this.doorData.update((current: DoorWithSelection[]) => {
          const selectedIds = new Set(
            current.filter((d) => d.selected).map((d) => d.id),
          );
          const updated = doors.map(
            (door: DeviceMonitoringDocument): DoorWithSelection => ({
              ...door,
              selected: selectedIds.has(door.id),
              meta_data: door.meta_data || '',
              created_by: door.created_by || '',
              server_created_at: door.server_created_at || '',
              server_updated_at: door.server_updated_at || '',
              cloud_created_at: door.cloud_created_at || '',
              cloud_updated_at: door.cloud_updated_at || '',
              client_created_at: door.client_created_at || '',
              client_updated_at: door.client_updated_at || '',
              diff_time_create: door.diff_time_create || '0',
              diff_time_update: door.diff_time_update || '0',
            }),
          );
          console.log(
            '[DoorPermission] Updated doorData:',
            updated.length,
            updated,
          );
          return updated;
        });
      },
      error: (err) => {
        console.error('[DoorPermission] Doors$ error:', err);
      },
    });
  }

  ngOnDestroy(): void {
    this.doorsSubscription?.unsubscribe();
  }

  /**
   * Toggle door selection
   */
  toggleDoor(door: DoorWithSelection): void {
    this.doorData.update((doors: DoorWithSelection[]) =>
      doors.map((d: DoorWithSelection) =>
        d.id === door.id ? { ...d, selected: !d.selected } : d,
      ),
    );
  }

  /**
   * Get count of selected doors
   */
  getSelectedCount(): number {
    return this.doorData().filter((door) => door.selected).length;
  }

  /**
   * Check if any doors are selected
   */
  hasSelection(): boolean {
    return this.getSelectedCount() > 0;
  }

  /**
   * Get selected door IDs
   */
  getSelectedDoorIds(): string[] {
    return this.doorData()
      .filter((door) => door.selected)
      .map((door) => door.id);
  }

  /**
   * Get selected door names
   */
  getSelectedDoorNames(): string[] {
    return this.doorData()
      .filter((door) => door.selected)
      .map((door) => door.name);
  }

  /**
   * Save selections and close subflow
   */
  async saveAndClose(): Promise<void> {
    if (!this.hasSelection()) {
      alert('กรุณาเลือกประตูที่ต้องการเข้าอย่างน้อย 1 ประตู');
      return;
    }

    try {
      const ctx = this.executionContext() as any;
      const selectedDoorIds = this.getSelectedDoorIds();

      const updatedCtx = RegistryContextHelper.updateDoorPermission(
        ctx,
        selectedDoorIds,
      );

      await this.closeSubflow(updatedCtx);
    } catch (error) {
      console.error('Error in saveAndClose:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
    }
  }

  /**
   * Close subflow without saving
   */
  async close(): Promise<void> {
    try {
      await this.closeSubflow({ cancelled: true });
    } catch (error) {
      console.error('Error closing subflow:', error);
    }
  }
}
