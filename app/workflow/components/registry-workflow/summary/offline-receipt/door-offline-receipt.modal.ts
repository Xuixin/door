import { CommonModule } from '@angular/common';
import { Component, Input, inject } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { ButtonModule } from 'primeng/button';

export interface DoorOfflineReceiptData {
  ticketId: string;
  timestamp: string;
  userName: string;
  doors: { id: string; name: string; status?: string }[];
  offlineDoors: { id: string; name: string; status?: string }[];
  isClientOffline: boolean; // เพิ่มสถานะ client offline
  clientOfflineMessage?: string; // ข้อความแจ้งเตือน client offline
}

@Component({
  selector: 'app-door-offline-receipt-modal',
  standalone: true,
  imports: [CommonModule, IonicModule, ButtonModule],
  template: `
    <ion-content class="bg-gray-100">
      <div class="flex flex-col items-center justify-start min-h-full p-4">
        <!-- Client Offline Alert - แสดงเฉพาะเมื่อต้นทาง offline -->
        <div
          *ngIf="data?.isClientOffline"
          class="bg-blue-50 border-l-4 border-blue-400 p-3 m-4 mb-2 rounded"
        >
          <div class="flex items-start gap-2">
            <ion-icon
              name="save-outline"
              class="text-blue-500 text-xl flex-shrink-0 mt-0.5"
            ></ion-icon>
            <div>
              <div class="text-blue-800 font-semibold text-sm mb-1">
                📱 บันทึกออฟไลน์ - ถ่ายรูปเก็บเป็นหลักฐาน
              </div>
              <div class="text-blue-700 text-xs mb-2">
                ระบบไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ในขณะนี้
              </div>
              <div class="text-blue-800 text-xs">
                💡 คำแนะนำ: กรุณาถ่ายรูปหน้าจอนี้เก็บไว้เป็นหลักฐาน
                และแสดงให้เจ้าหน้าที่ตรวจสอบเมื่อเข้าใช้งาน
              </div>
            </div>
          </div>
        </div>

        <!-- Door Offline Alert - แสดงเฉพาะเมื่อต้นทางออนไลน์ -->
        <div
          *ngIf="!data?.isClientOffline && data?.offlineDoors?.length > 0"
          class="bg-orange-50 border-l-4 border-orange-400 p-3 m-4 mb-0 rounded"
        >
          <div class="flex items-start gap-2">
            <ion-icon
              name="warning"
              class="text-orange-500 text-xl flex-shrink-0 mt-0.5"
            ></ion-icon>
            <div>
              <div class="text-orange-800 font-semibold text-sm mb-1">
                แจ้งเตือน: อุปกรณ์บางจุดไม่พร้อมใช้งาน
              </div>
              <div class="text-orange-700 text-xs mb-2">
                ประตู:
                <span class="font-semibold">{{ getOfflineDoorNames() }}</span>
              </div>
              <div class="text-orange-800 text-xs">
                💡 คำแนะนำ: หากท่านไม่สามารถใช้รหัสเปิดประตูได้
                กรุณาติดต่อเจ้าหน้าที่รักษาความปลอดภัย (รปภ.)
                เพื่อขอความช่วยเหลือ
              </div>
            </div>
          </div>
        </div>
        <!-- Receipt Card -->
        <div class="flex py-10 items-center justify-center min-h-full p-4">
          <div class="bg-white rounded-lg shadow-lg w-full max-w-sm">
            <!-- Warning Alert (ถ้ามี) -->

            <!-- Header -->
            <div
              class="text-center p-6 border-b-2 border-dashed border-gray-300"
            >
              <div class="text-lg font-bold text-gray-800 mb-1">
                ระบบลงทะเบียนเข้าอาคาร
              </div>
              <div class="text-xs text-gray-500 mb-4">QUEUE TICKET RECEIPT</div>

              <!-- QR Code Placeholder -->

              <!-- Ticket ID -->
              <div
                class="bg-gray-100 inline-block px-4 py-2 rounded text-sm font-mono font-bold text-gray-700"
              >
                {{ data?.ticketId || 'N/A' }}
              </div>
            </div>

            <!-- Body -->
            <div class="p-6 space-y-3 text-sm">
              <!-- Date Time -->
              <div class="flex justify-between">
                <span class="text-gray-600">วัน-เวลา-ลาทะเบียน</span>
                <span class="font-semibold text-gray-800 text-right">{{
                  data?.timestamp || '-'
                }}</span>
              </div>

              <!-- User Name -->
              <div class="flex justify-between">
                <span class="text-gray-600">ชื่อผู้ติดต่อ</span>
                <span
                  class="font-semibold text-gray-800 text-right truncate ml-4"
                  >{{ data?.userName || '-' }}</span
                >
              </div>

              <!-- Doors -->
              <div>
                <div class="text-gray-600 mb-2">เรื่องที่มาติดต่อ</div>
                <div class="space-y-1">
                  <div
                    *ngFor="let door of data?.doors; let i = index"
                    class="text-gray-800 text-right"
                  >
                    {{ i + 1 }}. {{ door.name }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer Note -->
            <div
              class="border-t-2 border-dashed border-gray-300 p-4 text-center"
            >
              <div class="text-xs text-gray-500 leading-relaxed">
                กรุณาเก็บรักษาใบเสร็จนี้<br />
                และแสดงให้เจ้าหน้าที่ตรวจสอบเมื่อเข้าใช้งาน
              </div>
            </div>
          </div>
        </div>
      </div>
    </ion-content>

    <!-- Footer Button -->
    <ion-footer class="ion-no-border">
      <div class="bg-white border-t border-gray-200 p-4">
        <p-button
          label="เสร็จสิ้น"
          icon="pi pi-check"
          (onClick)="close()"
          styleClass="w-full"
        ></p-button>
      </div>
    </ion-footer>
  `,
})
export class DoorOfflineReceiptModal {
  private modalCtrl = inject(ModalController);

  @Input() data?: DoorOfflineReceiptData;

  getOfflineDoorNames(): string {
    return this.data?.offlineDoors?.map((d) => d.name).join(', ') || 'ไม่ระบุ';
  }

  async close() {
    await this.modalCtrl.dismiss(undefined, 'cancel');
  }
}
