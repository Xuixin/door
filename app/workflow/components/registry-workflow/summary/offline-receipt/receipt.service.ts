import { Injectable } from '@angular/core';
import { DeviceMonitoringDocument } from 'src/app/core/Database/collection/device-monitoring/schema';

export interface ReceiptViewModel {
  ticketId: string;
  timestamp: string;
  userName: string;
  doors: { id: string; name: string; status?: string }[];
  offlineDoors: { id: string; name: string; status?: string }[];
  isClientOffline: boolean; // เพิ่มสถานะ client offline
  clientOfflineMessage?: string; // ข้อความแจ้งเตือน client offline
}

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  build(
    ctx: any,
    doors: DeviceMonitoringDocument[],
    ticketId: string,
  ): ReceiptViewModel {
    const selectedIds: string[] = Array.isArray(ctx?.door_permission)
      ? ctx.door_permission
      : typeof ctx?.door_permission === 'string'
        ? String(ctx.door_permission).split(',').filter(Boolean)
        : [];

    const selectedDoors = doors.filter((d) => selectedIds.includes(d.id));
    const offlineDoors = selectedDoors.filter(
      (d) => (d.status || '').toUpperCase() === 'OFFLINE',
    );

    // ตรวจสอบสถานะ client offline
    const isClientOffline = this.checkClientOfflineStatus();
    const clientOfflineMessage = isClientOffline
      ? this.getClientOfflineMessage()
      : undefined;

    return {
      ticketId,
      timestamp: this.formatTimestamp(new Date()),
      userName: ctx?.user?.name || '',
      doors: selectedDoors.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
      })),
      offlineDoors: offlineDoors.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
      })),
      isClientOffline,
      clientOfflineMessage,
    };
  }

  /**
   * ตรวจสอบสถานะ offline ของ client/kiosk
   * ใช้แค่ navigator.onLine เพื่อความง่าย
   */
  private checkClientOfflineStatus(): boolean {
    return !navigator.onLine;
  }

  /**
   * สร้างข้อความแจ้งเตือนสำหรับ client offline
   */
  private getClientOfflineMessage(): string {
    return 'ข้อมูลจะถูกบันทึกไว้ในเครื่องและส่งไปยังเซิร์ฟเวอร์เมื่อกลับมาออนไลน์';
  }

  private formatTimestamp(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }
}
