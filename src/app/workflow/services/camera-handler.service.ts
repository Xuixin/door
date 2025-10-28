import { Injectable } from '@angular/core';
import { CameraService } from './camera.service';
import { CanvasService } from './canvas.service';

/**
 * Camera Handler Service
 *
 * รับผิดชอบ camera operations ทั้งหมด:
 * - เปิด/ปิดกล้อง
 * - ถ่ายภาพ
 * - Mirror detection
 * - Error handling
 */
@Injectable({
  providedIn: 'root',
})
export class CameraHandlerService {
  constructor(
    private cameraService: CameraService,
    private canvasService: CanvasService
  ) {}

  /**
   * เปิดกล้อง
   */
  async startCamera(
    facingMode: 'user' | 'environment' = 'environment'
  ): Promise<MediaStream> {
    try {
      const stream = await this.cameraService.startCamera({ facingMode });
      return stream;
    } catch (error) {
      throw error;
    }
  }

  /**
   * ปิดกล้อง
   */
  stopCamera(): void {
    try {
      this.cameraService.stopCamera();
    } catch (error) {
      throw error;
    }
  }

  /**
   * ตรวจสอบว่าเป็นกล้องหน้าหรือไม่
   */
  async detectFrontCamera(
    stream: MediaStream,
    cameraCount: number
  ): Promise<boolean> {
    try {
      const videoTrack = stream.getVideoTracks()[0];
      if (!videoTrack) {
        return true;
      }

      const settings = videoTrack.getSettings();
      const label = videoTrack.label.toLowerCase();

      // 1. เช็คจาก facingMode
      if (settings.facingMode) {
        const isFront = settings.facingMode === 'user';
        return isFront;
      }

      // 2. เช็คจาก label
      const frontKeywords = [
        'facetime',
        'front',
        'user',
        'webcam',
        'integrated',
        'built-in',
      ];

      for (const keyword of frontKeywords) {
        if (label.includes(keyword)) {
          return true;
        }
      }

      // 3. Single camera = front (desktop/Mac)
      if (cameraCount === 1) {
        return true;
      }

      // 4. Default
      return false;
    } catch (error) {
      return true;
    }
  }

  /**
   * ถ่ายภาพ
   */
  capturePhoto(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    isFrontCamera: boolean,
    format: 'image/jpeg' | 'image/png' = 'image/jpeg',
    quality: number = 0.9
  ): string {
    try {
      // ตั้งค่าขนาด canvas
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Cannot get canvas context');
      }

      // Mirror ถ้าเป็นกล้องหน้า
      if (isFrontCamera) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      // วาดภาพจาก video
      ctx.drawImage(video, 0, 0);

      // Reset transform
      if (isFrontCamera) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // แปลงเป็น data URL
      const dataUrl = canvas.toDataURL(format, quality);

      return dataUrl;
    } catch (error) {
      throw error;
    }
  }

  /**
   * ดึงรายการกล้อง
   */
  async getCameras(): Promise<Array<{ id: string; label: string }>> {
    try {
      const cameras = await this.cameraService.getCameras();
      return cameras;
    } catch (error) {
      throw error;
    }
  }

  /**
   * เช็คว่า browser รองรับกล้องหรือไม่
   */
  isSupported(): boolean {
    return this.cameraService.isSupported();
  }
}
