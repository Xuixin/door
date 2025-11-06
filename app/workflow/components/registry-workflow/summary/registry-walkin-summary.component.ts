import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  Input,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { ButtonModule } from 'primeng/button';

import { BaseFlowController } from '../../../base-flow-controller.component';
import { RegistryContextHelper } from '../../../helpers/registry-context.helper';
import { RegistryService } from '../../../services/registry.service';
import { DeviceMonitoringFacade } from 'src/app/core/Database/collection/device-monitoring/facade.service';
import { ModalsControllerService } from 'src/app/flow-services/modals-controller.service';
import { ReceiptService } from './offline-receipt/receipt.service';
import { DoorOfflineReceiptModal } from './offline-receipt/door-offline-receipt.modal';
import { firstValueFrom, filter, timeout } from 'rxjs';
import type { RegistryTransaction } from 'src/app/workflow/services/registry.service';
import { UUIDUtils } from 'src/app/utils';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-registry-walkin-summary',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonModule],
  styles: [
    `
      ion-button.back-button {
        --background: transparent;
        --color: #2196f3;
        --border-width: 2px;
        --border-color: #2196f3;
        --border-style: solid;
        --padding-start: 2rem;
        --padding-end: 2rem;
        font-size: 1rem;
        height: 3rem;
      }

      ion-button.submit-button {
        --background: #2196f3;
        --padding-start: 2rem;
        --padding-end: 2rem;
        font-size: 1rem;
        height: 3rem;
      }

      ion-button.submit-button[disabled] {
        --background: #ccc;
      }
    `,
  ],
  templateUrl: './registry-walkin-summary.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistryWalkinSummaryComponent
  extends BaseFlowController
  implements OnInit, AfterViewInit, OnDestroy
{
  @Input() override data: Record<string, any> = {};

  currentDateTime: string = '';
  isInitialLoad: boolean = true;

  // Services
  private registryService = inject(RegistryService);
  private deviceMonitoringFacade = inject(DeviceMonitoringFacade);
  private modals = inject(ModalsControllerService);
  private receiptService = inject(ReceiptService);

  // Cache for Object URLs with Blob tracking
  private cachedUrls = new Map<string, { url: string; blob: Blob }>();
  private currentImageUrl = '';
  private lastContextHash = '';

  constructor() {
    super();
    this.updateDateTime();
    setInterval(() => this.updateDateTime(), 1000);

    // Initialize device monitoring facade
    this.deviceMonitoringFacade.ensureInitialized();

    // Use effect to watch context changes efficiently
    effect(() => {
      const ctx = this.executionContext();
      console.log('[RegistrySummary] Effect triggered - Context changed:', {
        ctx,
      });

      if (ctx) {
        this.updateImageUrl();
      }
    });
  }

  updateDateTime() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    this.currentDateTime = `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  override ngOnInit() {
    // เรียกเปิด data collection subflow อัตโนมัติเมื่อเข้ามาครั้งแรก
    if (this.isInitialLoad) {
      this.startDataCollection();
    }

    // Initialize image URL
    this.updateImageUrl();
  }

  async ngAfterViewInit() {
    // Summary is the MAIN page - always visible
  }

  // Get context as RegistryContext
  get registryContext() {
    return this.executionContext() as any;
  }

  // Computed properties to check completion status
  hasIdCard(): boolean {
    return RegistryContextHelper.hasIdCard(this.registryContext);
  }

  hasUserData(): boolean {
    return RegistryContextHelper.hasUserData(this.registryContext);
  }

  hasDoorPermission(): boolean {
    return RegistryContextHelper.hasDoorPermission(this.registryContext);
  }

  isComplete(): boolean {
    return RegistryContextHelper.isComplete(this.registryContext);
  }

  getDoorNames(): string[] {
    return RegistryContextHelper.getDoorNames(this.registryContext);
  }

  /**
   * Update image URL when context changes (with change detection)
   */
  private updateImageUrl(): void {
    // Create a simple hash of the context to detect changes
    const contextHash = this.registryContext?.user?.id_card_base64 || '';

    console.log('[RegistrySummary] updateImageUrl called:', {
      lastHash: this.lastContextHash,
      currentHash: contextHash,
      hasChanged: this.lastContextHash !== contextHash,
      hasIdCard: !!this.registryContext?.user?.id_card_base64,
    });

    // Only update if context actually changed
    if (this.lastContextHash === contextHash) {
      console.log('[RegistrySummary] No change detected, skipping update');
      return;
    }

    console.log('[RegistrySummary] Context changed, updating image URL');
    this.lastContextHash = contextHash;

    const file = RegistryContextHelper.getFileByCategory(
      this.registryContext,
      'id-card',
    );

    if (!file?.file_blob) {
      console.log('[RegistrySummary] No file blob, clearing image URL');
      this.revokeUrl('id-card');
      this.currentImageUrl = '';
      return;
    }

    console.log('[RegistrySummary] Creating new image URL from blob');
    this.currentImageUrl = this.getOrCreateUrl('id-card', file.file_blob);
  }

  /**
   * Get current image URL (stable reference)
   */
  getIdCardImage(): string {
    return this.currentImageUrl;
  }

  /**
   * Get or create cached Object URL (with Blob change detection)
   */
  private getOrCreateUrl(key: string, blob: Blob): string {
    const cached = this.cachedUrls.get(key);

    console.log('[RegistrySummary] getOrCreateUrl called:', {
      key,
      hasCached: !!cached,
      blobSize: blob.size,
      blobType: blob.type,
    });

    // ถ้า Blob เปลี่ยน ต้อง revoke URL เดิมและสร้างใหม่
    if (cached && cached.blob !== blob) {
      console.log('[RegistrySummary] Blob changed, revoking old URL');
      URL.revokeObjectURL(cached.url);
      this.cachedUrls.delete(key);
    }

    // สร้าง URL ใหม่ถ้ายังไม่มี หรือ Blob เปลี่ยน
    if (!this.cachedUrls.has(key)) {
      console.log('[RegistrySummary] Creating new Object URL');
      const url = URL.createObjectURL(blob);
      this.cachedUrls.set(key, { url, blob });
    } else {
      console.log('[RegistrySummary] Using cached URL');
    }

    return this.cachedUrls.get(key)!.url;
  }

  /**
   * Revoke cached URL
   */
  private revokeUrl(key: string): void {
    const cached = this.cachedUrls.get(key);
    if (cached) {
      URL.revokeObjectURL(cached.url);
      this.cachedUrls.delete(key);
    }
  }

  /**
   * Cleanup all URLs on destroy
   */
  override ngOnDestroy() {
    super.ngOnDestroy();
    this.cachedUrls.forEach((cached) => URL.revokeObjectURL(cached.url));
    this.cachedUrls.clear();
  }

  /**
   * Method 1: เริ่มต้น data collection subflow (ใช้เมื่อ init)
   */
  async startDataCollection(): Promise<void> {
    try {
      this.isInitialLoad = false;
      await this.startSubflow('dataCollectionSubflow', this.executionContext());
    } catch (error) {
      console.error('[RegistrySummary] Error starting subflow:', error);
    }
  }

  /**
   * Method 2: เปิด edit subflow สำหรับแก้ไข step ใดๆ (ใช้เมื่อต้องการแก้ไขข้อมูล)
   */
  async jumpToStep(stepId: string): Promise<void> {
    try {
      // เปิด dataCollectionSubflow แต่เริ่มที่ node ที่ระบุ
      await this.startSubflow(
        'dataCollectionSubflow',
        this.executionContext(),
        stepId, // ← ส่ง startNodeId
      );
    } catch (error) {
      console.error(
        `[RegistrySummary] Error jumping to step ${stepId}:`,
        error,
      );
    }
  }

  async submitRegistration(): Promise<void> {
    const ctx = this.registryContext;

    // Prepare loading overlay (attach after offline modal, before submit)
    const loadingAlert = document.createElement('div');
    loadingAlert.innerHTML = `
        <div style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          z-index: 10000;
          text-align: center;
          min-width: 300px;
        ">
          <div style="margin-bottom: 1rem;">
            <div style="
              width: 40px;
              height: 40px;
              border: 4px solid #f3f3f3;
              border-top: 4px solid #2196f3;
              border-radius: 50%;
              animation: spin 1s linear infinite;
              margin: 0 auto;
            "></div>
          </div>
          <div style="font-weight: 500; margin-bottom: 0.5rem;">กำลังบันทึกการลงทะเบียน...</div>
          <div style="font-size: 0.875rem; color: #666;">กรุณารอสักครู่</div>
        </div>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      `;

    const cid = UUIDUtils.generateTxnId();

    // Check if any selected door is offline and show receipt modal first
    try {
      // Ensure device monitoring facade is initialized before getting doors
      console.log(
        '[submitRegistration] Ensuring device monitoring facade is initialized...',
      );
      this.deviceMonitoringFacade.ensureInitialized();
      console.log('[submitRegistration] Device monitoring facade initialized');

      console.log('[submitRegistration] Getting doors from facade...');
      const allDoors = await firstValueFrom(
        this.deviceMonitoringFacade.getDoors$().pipe(
          filter((doors) => doors.length > 0), // Wait for actual doors data
          timeout(5000), // 5 second timeout
        ),
      );

      console.log('[submitRegistration] allDoors', allDoors);
      // Cast to schema type to fix type mismatch
      const receiptData = this.receiptService.build(
        ctx,
        allDoors.map((door) => ({
          ...door,
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
        })) as any,
        cid,
      );

      console.log('[submitRegistration] receiptData', receiptData);
      if (receiptData.offlineDoors.length > 0) {
        await this.modals.openModal({
          component: DoorOfflineReceiptModal,
          nodeId: this.node?.id || 'summary',
          flowId: this.currentFlow()?.id || 'registry',
          type: 'nested',
          data: receiptData,
          allowBackdropDismiss: false,
          showBackdrop: true,
          cssClass: ['subflow-modal-receipt', 'modal-blur-backdrop'], // keep blur backdrop
        });
      } else {
        await this.modals.openModal({
          component: DoorOfflineReceiptModal,
          nodeId: this.node?.id || 'summary',
          flowId: this.currentFlow()?.id || 'registry',
          type: 'nested',
          data: receiptData,
          allowBackdropDismiss: false,
          showBackdrop: true,
          cssClass: ['subflow-modal-receipt', 'modal-blur-backdrop'], // keep blur backdrop
        });
      }
    } catch (e) {
      console.log('[Summary] Unable to resolve doors for offline check', e);
    }

    const data: RegistryTransaction = {
      id: cid,
      name: ctx.user.name,
      id_card_base64: ctx.user.id_card_base64,
      student_number: ctx.user.student_number,
      register_type: ctx.register_type,
      door_permission: Array.isArray(ctx.door_permission)
        ? ctx.door_permission.join(',')
        : ctx.door_permission,
      status: 'IN',
      client_created_at: Date.now().toString(),
    };

    try {
      // Show loading only while persisting
      document.body.appendChild(loadingAlert);
      // Submit to storage
      const result = await this.registryService.submitRegistration(data);

      console.log('[RegistrySummary] Submit result:', result);

      if (result.success && result.transaction) {
        const fullName = result.transaction.name || 'ไม่ระบุ';
        alert(
          `✅ บันทึกการลงทะเบียนสำเร็จ!\n\nหมายเลข Ticket: ${result.transaction.id}\nชื่อ: ${fullName}\nสถานะ: ${result.transaction.status}`,
        );

        // Close workflow
        await this.closeWorkflow();
      } else {
        alert(
          `❌ เกิดข้อผิดพลาดในการบันทึก:\n\n${result.error || 'Unknown error'}`,
        );
      }
    } catch (error) {
      console.error('Error in submitRegistration:', error);
      alert(
        `❌ เกิดข้อผิดพลาดที่ไม่คาดคิด:\n\n${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    } finally {
      // Remove loading alert
      if (document.body.contains(loadingAlert)) {
        document.body.removeChild(loadingAlert);
      }
    }
  }

  /**
   * Debug method to test getDoors$() functionality
   */
  async debugAllDoors(): Promise<void> {
    console.log('🔍 [DEBUG] Starting debugAllDoors...');

    try {
      // Ensure device monitoring facade is initialized
      console.log(
        '🔍 [DEBUG] Ensuring device monitoring facade is initialized...',
      );
      this.deviceMonitoringFacade.ensureInitialized();
      console.log('🔍 [DEBUG] Device monitoring facade initialized');

      // Get doors using the same method as submitRegistration
      console.log('🔍 [DEBUG] Getting doors from facade...');

      // First, let's check if there's any device monitoring data at all
      console.log('🔍 [DEBUG] Checking all device monitoring data...');
      const allDevices = await firstValueFrom(
        this.deviceMonitoringFacade.getDeviceMonitoring$(),
      );
      console.log('🔍 [DEBUG] All devices:', allDevices);
      console.log(
        '🔍 [DEBUG] Device types found:',
        allDevices.map((d) => d.type),
      );

      // Now get doors specifically - wait for actual data, not just first emission
      const allDoors = await firstValueFrom(
        this.deviceMonitoringFacade.getDoors$().pipe(
          filter((doors) => doors.length > 0), // Wait for actual doors data
          timeout(5000), // 5 second timeout
        ),
      );

      console.log('🔍 [DEBUG] All doors result:', allDoors);
      console.log('🔍 [DEBUG] Number of doors:', allDoors.length);

      // Let's also try the door-permission approach with toSignal
      console.log(
        '🔍 [DEBUG] Trying door-permission approach with toSignal...',
      );
      const doors$ = this.deviceMonitoringFacade.getDoors$();

      // Subscribe to the stream to see what we get
      const subscription = doors$.subscribe((doors) => {
        console.log('🔍 [DEBUG] toSignal approach - doors received:', doors);
        console.log(
          '🔍 [DEBUG] toSignal approach - number of doors:',
          doors.length,
        );
      });

      // Wait a bit and then unsubscribe
      setTimeout(() => {
        subscription.unsubscribe();
      }, 2000);

      if (allDoors.length > 0) {
        console.log('🔍 [DEBUG] First door details:', allDoors[0]);
        allDoors.forEach((door, index) => {
          console.log(`🔍 [DEBUG] Door ${index + 1}:`, {
            id: door.id,
            name: door.name,
            type: door.type,
            status: door.status,
          });
        });
      } else {
        console.log('🔍 [DEBUG] No doors found!');
      }
    } catch (error) {
      console.error('🔍 [DEBUG] Error in debugAllDoors:', error);
    }
  }

  async cancelAndClose(): Promise<void> {
    if (confirm('คุณต้องการกลับหน้าแรกหรือไม่?')) {
      await this.closeWorkflow();
    }
  }
}
