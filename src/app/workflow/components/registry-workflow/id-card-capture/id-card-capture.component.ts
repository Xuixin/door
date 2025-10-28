import { CommonModule } from "@angular/common";
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  ViewChild,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { ButtonModule } from "primeng/button";
import { BaseFlowController } from "../../../base-flow-controller.component";
import { RegistryContextHelper } from "../../../helpers/registry-context.helper";
import { CameraHandlerService } from "../../../services/camera-handler.service";
import { CanvasService } from "../../../services/canvas.service";

@Component({
  selector: "app-id-card-capture",
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule, ButtonModule],
  templateUrl: "./id-card-capture.component.html",
})
export class IdCardCaptureComponent
  extends BaseFlowController
  implements AfterViewInit, OnDestroy
{
  static {
    console.log("[IdCardCaptureComponent] Class loaded");
  }
  @ViewChild("videoElement") videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild("cameraCanvas") cameraCanvas!: ElementRef<HTMLCanvasElement>;

  // State
  isCameraLoading = false;
  errorMessage = "";
  capturedImage = "";
  cameras: Array<{ id: string; label: string }> = [];
  currentCameraIndex = 0;
  isFrontCamera = false;

  cameraHandler = inject(CameraHandlerService);

  // Private
  private captureCanvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private isViewInitialized = false;

  constructor(
    private canvasService: CanvasService,
    private cdr: ChangeDetectorRef
  ) {
    super();
    console.log("[IdCardCaptureComponent] Constructor called successfully");
  }

  ngAfterViewInit() {
    this.isViewInitialized = true;
  }

  async ionViewDidEnter() {
    try {
      // เช็คว่ามีรูปอยู่ใน context แล้วหรือเปล่า
      const registryContext = this.executionContext() as any;
      const existingFile = RegistryContextHelper.getFileByCategory(
        registryContext,
        "id-card"
      );

      if (existingFile?.file_blob) {
        // มีรูปอยู่แล้ว → แสดงรูปเดิม (captured state)
        this.capturedImage = URL.createObjectURL(existingFile.file_blob);
        this.cdr.detectChanges();
        return; // ไม่ต้องเปิดกล้อง
      }

      // รอให้ view พร้อม
      await this.waitForView();

      // เช็ค browser support
      if (!this.cameraHandler.isSupported()) {
        console.warn("[IdCardCaptureComponent] Camera API not available");
        this.showError("เบราว์เซอร์ของคุณไม่รองรับการใช้กล้อง");
        return;
      }

      // สร้าง capture canvas
      this.captureCanvas = document.createElement("canvas");

      // ดึงรายการกล้อง
      this.cameras = await this.cameraHandler.getCameras();

      // เปิดกล้อง
      await this.startCamera();
    } catch (error: any) {
      // Handle camera errors
      console.error(
        "[IdCardCaptureComponent] Camera initialization error:",
        error
      );
      this.showError("ไม่สามารถเปิดกล้องได้ กรุณาลองอีกครั้ง");
    }
  }

  ionViewWillLeave() {
    this.cleanup();
  }

  override ngOnDestroy() {
    this.cleanup();
  }

  /**
   * รอให้ view elements พร้อม
   */
  private async waitForView(): Promise<void> {
    // รอ flag
    if (!this.isViewInitialized) {
      await this.delay(100);
    }

    // รอ elements
    if (!this.videoElement || !this.cameraCanvas) {
      await this.delay(100);
    }

    // รอ native elements
    if (
      !this.videoElement?.nativeElement ||
      !this.cameraCanvas?.nativeElement
    ) {
      await this.delay(100);
    }

    // Final check
    if (
      !this.videoElement?.nativeElement ||
      !this.cameraCanvas?.nativeElement
    ) {
      throw new Error("Elements not available after waiting");
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * เปิดกล้อง
   */
  private async startCamera(): Promise<void> {
    try {
      this.isCameraLoading = true;
      this.errorMessage = "";
      this.cdr.detectChanges();

      // ตรวจสอบ elements
      if (!this.videoElement?.nativeElement) {
        throw new Error("Video element not found");
      }

      // เปิดกล้อง
      const facingMode = this.currentCameraIndex === 0 ? "environment" : "user";
      const stream = await this.cameraHandler.startCamera(facingMode);

      // ตรวจจับประเภทกล้อง
      this.isFrontCamera = await this.cameraHandler.detectFrontCamera(
        stream,
        this.cameras.length
      );

      // Set stream
      this.videoElement.nativeElement.srcObject = stream;

      // รอ video พร้อม
      await this.waitForVideoReady();

      // เริ่ม drawing
      this.startDrawing();

      this.isCameraLoading = false;
      this.cdr.detectChanges();
    } catch (error: any) {
      // Handle camera errors
      console.error("[IdCardCaptureComponent] Start camera error:", error);
      this.isCameraLoading = false;
      this.cdr.detectChanges();
      this.showError("ไม่สามารถเปิดกล้องได้ กรุณาลองอีกครั้ง");
      throw error;
    }
  }

  /**
   * รอให้ video โหลดเสร็จ
   */
  private waitForVideoReady(): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = this.videoElement.nativeElement;

      video.onloadedmetadata = () => {
        video
          .play()
          .then(() => {
            resolve();
          })
          .catch(reject);
      };

      video.onerror = reject;

      // Timeout
      setTimeout(() => reject(new Error("Video load timeout")), 10000);
    });
  }

  /**
   * เริ่มวาด guideline
   */
  private startDrawing(): void {
    const video = this.videoElement.nativeElement;
    const canvas = this.cameraCanvas.nativeElement;

    try {
      const ctx = this.canvasService.getContext(canvas);

      const drawFrame = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          // ตั้งค่าขนาด canvas
          if (
            canvas.width !== video.videoWidth ||
            canvas.height !== video.videoHeight
          ) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }

          // วาดภาพจาก video
          this.canvasService.drawImage(
            canvas,
            video,
            0,
            0,
            canvas.width,
            canvas.height
          );

          // วาดกรอบแนะนำ
          this.drawIdCardOverlay(ctx, canvas.width, canvas.height);
        }

        this.animationFrameId = requestAnimationFrame(drawFrame);
      };

      drawFrame();
    } catch (error) {
      console.error("[IdCardCaptureComponent] Drawing error:", error);
    }
  }

  /**
   * วาดกรอบแนะนำบัตรประชาชน
   */
  private drawIdCardOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ): void {
    const guideWidth = width * 0.8;
    const guideHeight = guideWidth * 0.63;
    const guideX = (width - guideWidth) / 2;
    const guideY = (height - guideHeight) / 2;

    // วาด overlay มืด
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, width, guideY);
    ctx.fillRect(
      0,
      guideY + guideHeight,
      width,
      height - (guideY + guideHeight)
    );
    ctx.fillRect(0, guideY, guideX, guideHeight);
    ctx.fillRect(
      guideX + guideWidth,
      guideY,
      width - (guideX + guideWidth),
      guideHeight
    );

    // วาดกรอบสีขาว
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(guideX, guideY, guideWidth, guideHeight);

    // วาดมุมสีเขียว
    const cornerLength = 30;
    ctx.strokeStyle = "#00ff00";
    ctx.lineWidth = 4;

    // 4 มุม
    ctx.beginPath();
    ctx.moveTo(guideX, guideY + cornerLength);
    ctx.lineTo(guideX, guideY);
    ctx.lineTo(guideX + cornerLength, guideY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(guideX + guideWidth - cornerLength, guideY);
    ctx.lineTo(guideX + guideWidth, guideY);
    ctx.lineTo(guideX + guideWidth, guideY + cornerLength);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(guideX, guideY + guideHeight - cornerLength);
    ctx.lineTo(guideX, guideY + guideHeight);
    ctx.lineTo(guideX + cornerLength, guideY + guideHeight);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(guideX + guideWidth - cornerLength, guideY + guideHeight);
    ctx.lineTo(guideX + guideWidth, guideY + guideHeight);
    ctx.lineTo(guideX + guideWidth, guideY + guideHeight - cornerLength);
    ctx.stroke();

    // ข้อความแนะนำ
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("วางบัตรประชาชนให้อยู่ในกรอบ", width / 2, guideY - 20);
  }

  /**
   * ถ่ายภาพ
   */
  capturePhoto(): void {
    const video = this.videoElement?.nativeElement;
    if (!video || !this.captureCanvas) return;

    try {
      this.capturedImage = this.cameraHandler.capturePhoto(
        video,
        this.captureCanvas,
        this.isFrontCamera,
        "image/jpeg",
        0.9
      );

      this.cameraHandler.stopCamera();
      this.stopDrawing();
    } catch (error: any) {
      console.error("[IdCardCaptureComponent] Capture error:", error);
      this.showError("ไม่สามารถถ่ายภาพได้ กรุณาลองอีกครั้ง");
    }
  }

  /**
   * ถ่ายใหม่
   */
  async retakePhoto(): Promise<void> {
    this.capturedImage = "";

    try {
      // รอให้ view พร้อม
      await this.waitForView();

      // เช็ค browser support
      if (!this.cameraHandler.isSupported()) {
        this.showError("เบราว์เซอร์ของคุณไม่รองรับการใช้กล้อง");
        return;
      }

      // สร้าง capture canvas (ถ้ายังไม่มี)
      if (!this.captureCanvas) {
        this.captureCanvas = document.createElement("canvas");
      }

      // ดึงรายการกล้อง (ถ้ายังไม่มี)
      if (this.cameras.length === 0) {
        this.cameras = await this.cameraHandler.getCameras();
      }

      // เปิดกล้อง
      await this.startCamera();
    } catch (error: any) {
      console.error("[IdCardCaptureComponent] Retake error:", error);
      this.showError("ไม่สามารถเปิดกล้องได้ กรุณาลองอีกครั้ง");
    }
  }

  /**
   * สลับกล้อง
   */
  async switchCamera(): Promise<void> {
    if (this.cameras.length <= 1) return;

    try {
      this.currentCameraIndex =
        (this.currentCameraIndex + 1) % this.cameras.length;
      this.cameraHandler.stopCamera();
      this.stopDrawing();
      await this.startCamera();
    } catch (error: any) {
      console.error("[IdCardCaptureComponent] Switch camera error:", error);
    }
  }

  /**
   * บันทึกและไปต่อ
   */
  async saveAndNext(): Promise<void> {
    if (!this.capturedImage) return;

    try {
      // Convert base64 to Blob
      const base64Data = this.capturedImage.split(",")[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/jpeg" });

      // Get current context
      const ctx = this.executionContext() as any;

      // Add file to context
      const updatedCtx = await RegistryContextHelper.addFile(ctx, {
        file_blob: blob,
        file_type: "image/jpeg",
        file_category: "id-card",
      });

      // ไปยัง node ถัดไป (user-data) พร้อม update context
      await this.next(updatedCtx);
    } catch (error: any) {
      console.error("[IdCardCaptureComponent] Save error:", error);
      this.showError("ไม่สามารถบันทึกข้อมูลได้ กรุณาลองอีกครั้ง");
    }
  }

  /**
   * ปิด - กลับไปที่ Summary
   */
  async close(): Promise<void> {
    try {
      this.cleanup();

      // ปิด subflow และกลับไปที่ Summary
      await this.closeSubflow({
        success: false,
        cancelled: true,
      });
    } catch (error: any) {
      console.error("[IdCardCaptureComponent] Close error:", error);
    }
  }

  /**
   * หยุดการวาด
   */
  private stopDrawing(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Cleanup
   */
  private cleanup(): void {
    this.cameraHandler.stopCamera();
    this.stopDrawing();
  }

  /**
   * แสดง error
   */
  private showError(message: string): void {
    this.errorMessage = message;
    this.cdr.detectChanges();
  }

  async viewSummary(): Promise<void> {
    try {
      await this.jumpTo("summary");
    } catch (error) {
      console.error("[IdCardCaptureComponent] Error in viewSummary:", error);
    }
  }
}
