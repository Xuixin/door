import { computed, Injectable, signal } from '@angular/core';

export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  deviceId?: string;
}

/**
 * Camera Service
 *
 * Handles camera access, capture, and management.
 */
@Injectable({
  providedIn: 'root',
})
export class CameraService {
  private currentStream: MediaStream | null = null;
  private isInitializing = false;

  // Signals for reactive state
  private _isActive = signal<boolean>(false);
  private _currentFacingMode = signal<'user' | 'environment'>('environment');

  // Public readonly signals
  readonly isActiveSignal = this._isActive.asReadonly();
  readonly currentFacingMode = this._currentFacingMode.asReadonly();
  readonly isFrontCamera = computed(() => this._currentFacingMode() === 'user');

  constructor() {
    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.stopCamera());
    }
  }

  /**
   * เปิดกล้องและรับ MediaStream พร้อม error handling ที่ครอบคลุม
   */
  async startCamera(
    constraints: CameraConstraints = { facingMode: 'environment' }
  ): Promise<MediaStream> {
    // ตรวจสอบว่า browser รองรับหรือไม่
    if (!this.isSupported()) {
      throw new Error('Browser does not support camera');
    }

    // ป้องกันการเรียกซ้ำซ้อน
    if (this.isInitializing) {
      throw new Error('Camera is already initializing');
    }

    this.isInitializing = true;

    try {
      // ปิดกล้องเดิมก่อน (ถ้ามี)
      this.stopCamera();

      // สร้าง video constraints แบบ flexible
      const videoConstraints: MediaTrackConstraints = {
        facingMode: constraints.facingMode || 'environment',
      };

      // ถ้าระบุ deviceId มา ให้ใช้แทน facingMode
      if (constraints.deviceId) {
        delete videoConstraints.facingMode;
        videoConstraints.deviceId = { exact: constraints.deviceId };
      }

      // เพิ่ม width/height แบบ ideal (ไม่บังคับ)
      if (constraints.width) {
        videoConstraints.width = { ideal: constraints.width };
      } else {
        videoConstraints.width = { ideal: 1920 };
      }

      if (constraints.height) {
        videoConstraints.height = { ideal: constraints.height };
      } else {
        videoConstraints.height = { ideal: 1080 };
      }

      let stream: MediaStream;

      try {
        // ลองเปิดกล้องด้วย constraints ที่ระบุ
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
      } catch (firstError: any) {
        // ถ้าเกิด OverconstrainedError ลองใช้ constraints แบบง่ายกว่า
        if (
          firstError.name === 'OverconstrainedError' ||
          firstError.name === 'ConstraintNotSatisfiedError'
        ) {
          try {
            // ลองแบบ fallback (เอาแค่ facingMode หรือไม่ระบุอะไร)
            stream = await navigator.mediaDevices.getUserMedia({
              video: constraints.facingMode
                ? { facingMode: constraints.facingMode }
                : true,
              audio: false,
            });
          } catch (secondError: any) {
            // ลองอีกครั้งโดยไม่มีข้อกำหนดใดๆ
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false,
              });
            } catch (thirdError: any) {
              throw firstError; // ถ้าทุกอย่างล้มเหลว ให้ throw error แรก
            }
          }
        } else {
          throw firstError;
        }
      }

      // ตรวจสอบว่า stream ใช้งานได้
      if (!stream || !stream.active) {
        throw new Error('Stream is not active');
      }

      this.currentStream = stream;
      this._isActive.set(true);
      this._currentFacingMode.set(constraints.facingMode || 'environment');

      return stream;
    } catch (error: any) {
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * ปิดกล้อง
   */
  stopCamera(): void {
    try {
      if (this.currentStream) {
        // หยุดทุก track
        this.currentStream.getTracks().forEach(track => {
          try {
            track.stop();
          } catch (e) {
            // Ignore track stop errors
          }
        });
        this.currentStream = null;
        this._isActive.set(false);
      }
    } catch (error) {
      // ไม่ throw error เพราะเป็นการปิด
    }
  }

  /**
   * ถ่ายภาพจาก video element และคืนค่าเป็น data URL
   */
  capturePhoto(
    videoElement: HTMLVideoElement,
    canvasElement: HTMLCanvasElement,
    format: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/jpeg',
    quality: number = 0.9
  ): string {
    try {
      // ตรวจสอบ parameters
      if (!videoElement) {
        throw new Error('Video element is invalid');
      }

      if (!canvasElement) {
        throw new Error('Canvas element is invalid');
      }

      // ตรวจสอบว่า video พร้อมหรือยัง
      if (videoElement.readyState < 2) {
        throw new Error('Video is not ready');
      }

      if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        throw new Error('Video has no dimensions');
      }

      const context = canvasElement.getContext('2d', {
        willReadFrequently: false,
        alpha: false,
      });

      if (!context) {
        throw new Error('Cannot create canvas context');
      }

      // ตั้งค่าขนาด canvas ให้เท่ากับ video
      canvasElement.width = videoElement.videoWidth;
      canvasElement.height = videoElement.videoHeight;

      // วาดภาพจาก video ลง canvas
      context.drawImage(
        videoElement,
        0,
        0,
        canvasElement.width,
        canvasElement.height
      );

      // ตรวจสอบ quality
      const validQuality = Math.max(0, Math.min(1, quality));

      // แปลง canvas เป็น data URL
      let dataUrl: string;
      try {
        dataUrl = canvasElement.toDataURL(format, validQuality);
      } catch (e) {
        // ถ้า format ไม่ support ให้ลอง jpeg แทน
        dataUrl = canvasElement.toDataURL('image/jpeg', validQuality);
      }

      if (!dataUrl || dataUrl.length < 100) {
        throw new Error('Cannot create image');
      }

      return dataUrl;
    } catch (error: any) {
      throw error;
    }
  }

  /**
   * วาด guideline สำหรับบัตรประชาชนบน canvas
   */
  drawIdCardGuideline(
    canvasElement: HTMLCanvasElement,
    videoWidth: number,
    videoHeight: number
  ): void {
    try {
      if (!canvasElement) {
        return;
      }

      if (videoWidth <= 0 || videoHeight <= 0) {
        return;
      }

      const context = canvasElement.getContext('2d', {
        willReadFrequently: true,
        alpha: true,
      });

      if (!context) {
        return;
      }

      canvasElement.width = videoWidth;
      canvasElement.height = videoHeight;

      // Clear canvas
      context.clearRect(0, 0, canvasElement.width, canvasElement.height);

      // คำนวณขนาดและตำแหน่งของ guideline
      const guideWidth = Math.min(videoWidth * 0.8, videoWidth - 40);
      const guideHeight = guideWidth * 0.63; // อัตราส่วนบัตรประชาชน

      // ตรวจสอบว่า guide ไม่เกินขนาดหน้าจอ
      const maxHeight = videoHeight - 100;
      const finalGuideHeight = Math.min(guideHeight, maxHeight);
      const finalGuideWidth = finalGuideHeight / 0.63;

      const guideX = (videoWidth - finalGuideWidth) / 2;
      const guideY = (videoHeight - finalGuideHeight) / 2;

      // วาด overlay มืด
      context.fillStyle = 'rgba(0, 0, 0, 0.5)';
      context.fillRect(0, 0, videoWidth, videoHeight);

      // ลบส่วนตรงกลางออก (ให้เห็นภาพจากกล้อง)
      context.clearRect(guideX, guideY, finalGuideWidth, finalGuideHeight);

      // วาดกรอบสีขาว
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.strokeRect(guideX, guideY, finalGuideWidth, finalGuideHeight);

      // วาดมุม
      const cornerLength = Math.min(30, finalGuideWidth * 0.1);
      context.strokeStyle = '#00ff00';
      context.lineWidth = 4;

      // มุมซ้ายบน
      context.beginPath();
      context.moveTo(guideX, guideY + cornerLength);
      context.lineTo(guideX, guideY);
      context.lineTo(guideX + cornerLength, guideY);
      context.stroke();

      // มุมขวาบน
      context.beginPath();
      context.moveTo(guideX + finalGuideWidth - cornerLength, guideY);
      context.lineTo(guideX + finalGuideWidth, guideY);
      context.lineTo(guideX + finalGuideWidth, guideY + cornerLength);
      context.stroke();

      // มุมซ้ายล่าง
      context.beginPath();
      context.moveTo(guideX, guideY + finalGuideHeight - cornerLength);
      context.lineTo(guideX, guideY + finalGuideHeight);
      context.lineTo(guideX + cornerLength, guideY + finalGuideHeight);
      context.stroke();

      // มุมขวาล่าง
      context.beginPath();
      context.moveTo(
        guideX + finalGuideWidth - cornerLength,
        guideY + finalGuideHeight
      );
      context.lineTo(guideX + finalGuideWidth, guideY + finalGuideHeight);
      context.lineTo(
        guideX + finalGuideWidth,
        guideY + finalGuideHeight - cornerLength
      );
      context.stroke();

      // ข้อความแนะนำ
      context.fillStyle = '#ffffff';
      const fontSize = Math.max(14, Math.min(18, videoWidth * 0.025));
      context.font = `bold ${fontSize}px sans-serif`;
      context.textAlign = 'center';

      const textY = Math.max(20, guideY - 20);
      context.fillText('วางบัตรประชาชนให้อยู่ในกรอบ', videoWidth / 2, textY);
    } catch (error) {
      // ไม่ throw error เพื่อไม่ให้ระบบหยุดทำงาน
    }
  }

  /**
   * ตรวจสอบว่าเบราว์เซอร์รองรับ getUserMedia หรือไม่
   */
  isSupported(): boolean {
    try {
      return !!(
        navigator?.mediaDevices?.getUserMedia &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * ดึงรายการกล้องที่มี
   */
  async getCameras(): Promise<CameraDevice[]> {
    try {
      if (!this.isSupported()) {
        return [];
      }

      // ขอสิทธิ์เข้าถึงก่อน (บางเบราว์เซอร์ต้องการ)
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        tempStream.getTracks().forEach(track => track.stop());
      } catch (permError) {
        // ไม่ throw เพราะบางเบราว์เซอร์อาจ list ได้โดยไม่ต้องขอสิทธิ์
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          id: device.deviceId,
          label: device.label || `Camera ${device.deviceId.substring(0, 5)}`,
        }));

      return cameras;
    } catch (error) {
      return [];
    }
  }

  /**
   * ตรวจสอบว่ากล้องกำลังทำงานอยู่หรือไม่
   */
  isActive(): boolean {
    return !!(this.currentStream && this.currentStream.active);
  }

  /**
   * สลับกล้อง (หน้า/หลัง)
   */
  async switchCamera(
    currentFacingMode: 'user' | 'environment'
  ): Promise<MediaStream> {
    const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    return this.startCamera({ facingMode: newFacingMode });
  }

  /**
   * เปลี่ยนกล้องตาม deviceId
   */
  async switchCameraByDeviceId(deviceId: string): Promise<MediaStream> {
    return this.startCamera({ deviceId });
  }

  /**
   * ดึง capabilities ของกล้องปัจจุบัน
   */
  getCurrentCameraCapabilities(): MediaTrackCapabilities | null {
    try {
      if (!this.currentStream) return null;

      const videoTrack = this.currentStream.getVideoTracks()[0];
      if (!videoTrack) return null;

      return videoTrack.getCapabilities?.() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * ดึง settings ของกล้องปัจจุบัน
   */
  getCurrentCameraSettings(): MediaTrackSettings | null {
    try {
      if (!this.currentStream) return null;

      const videoTrack = this.currentStream.getVideoTracks()[0];
      if (!videoTrack) return null;

      return videoTrack.getSettings?.() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current stream
   */
  getStream(): MediaStream | null {
    return this.currentStream;
  }

  /**
   * Check if device has multiple cameras
   */
  async hasMultipleCameras(): Promise<boolean> {
    try {
      const cameras = await this.getCameras();
      return cameras.length > 1;
    } catch (error) {
      return false;
    }
  }
}

export interface CameraDevice {
  id: string;
  label: string;
}
