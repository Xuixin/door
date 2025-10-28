import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ButtonModule } from 'primeng/button';

import { BaseFlowController } from '../../../base-flow-controller.component';
import { RegistryContextHelper } from '../../../helpers/registry-context.helper';
import { DoorService, Door } from '../../../../services/door.service';

interface DoorWithSelection extends Door {
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
  implements OnInit
{
  @Input() override data: Record<string, any> = {};

  // Available doors
  doors = signal<DoorWithSelection[]>([]);
  loading = signal<boolean>(false);
  loadError = signal<string | null>(null);

  constructor(private doorService: DoorService) {
    super();
  }

  override async ngOnInit() {
    try {
      // Load doors from service
      await this.loadDoors();
      // Load existing selections from context
      this.loadExistingSelections();
    } catch (error) {
      console.error('Error in ngOnInit:', error);
      // Continue with component initialization even if there's an error
    }
  }

  /**
   * Load doors from GraphQL service
   */
  private async loadDoors(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);

    try {
      // Check if service is available
      if (!this.doorService) {
        throw new Error('Door service is not available');
      }

      const doors = await this.doorService.getDoors();

      // Transform doors to include selection state
      const doorsWithSelection: DoorWithSelection[] = doors.map((door) => ({
        ...door,
        selected: false,
      }));

      this.doors.set(doorsWithSelection);
    } catch (error) {
      console.error('Error loading doors:', error);
      this.loadError.set('ไม่สามารถโหลดข้อมูลประตูได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load existing door selections from context
   */
  private loadExistingSelections(): void {
    try {
      const ctx = this.executionContext() as any;
      if (ctx?.door_permission && Array.isArray(ctx.door_permission)) {
        const selectedDoorIds = ctx.door_permission;

        this.doors.update((doors) =>
          doors.map((door) => ({
            ...door,
            selected: selectedDoorIds.includes(door.id),
          })),
        );
      }
    } catch (error) {
      console.warn('Error loading existing selections:', error);
      // Continue without loading existing selections
    }
  }

  /**
   * Toggle door selection
   */
  toggleDoor(door: DoorWithSelection): void {
    this.doors.update((doors) =>
      doors.map((d) =>
        d.id === door.id ? { ...d, selected: !d.selected } : d,
      ),
    );
  }

  /**
   * Get count of selected doors
   */
  getSelectedCount(): number {
    return this.doors().filter((door) => door.selected).length;
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
    return this.doors()
      .filter((door) => door.selected)
      .map((door) => door.id);
  }

  /**
   * Get selected door names
   */
  getSelectedDoorNames(): string[] {
    return this.doors()
      .filter((door) => door.selected)
      .map((door) => door.name);
  }

  /**
   * Retry loading doors
   */
  async retryLoadDoors(): Promise<void> {
    try {
      await this.loadDoors();
    } catch (error) {
      console.error('Error retrying load doors:', error);
      this.loadError.set('ไม่สามารถโหลดข้อมูลประตูได้ กรุณาลองใหม่อีกครั้ง');
    }
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

      // Update context with selected doors
      const updatedCtx = RegistryContextHelper.updateDoorPermission(
        ctx,
        selectedDoorIds,
      );

      // Close subflow and return to summary
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
