import { Injectable } from '@angular/core';

/**
 * Canvas Service
 *
 * Provides canvas manipulation utilities with proper error handling.
 * Uses exception framework for structured error reporting.
 */
@Injectable({
  providedIn: 'root',
})
export class CanvasService {
  constructor() {}

  createCanvas(width: number, height: number): HTMLCanvasElement {
    if (width <= 0 || height <= 0) {
      throw new Error('Invalid canvas size');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    if (!canvas) {
      const error = new Error('Invalid canvas element');

      throw error;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Invalid canvas context');
    }

    return ctx;
  }

  clearCanvas(canvas: HTMLCanvasElement): void {
    try {
      const ctx = this.getContext(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } catch (error) {
      throw error;
    }
  }

  drawImage(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement | HTMLVideoElement,
    x: number = 0,
    y: number = 0,
    width?: number,
    height?: number
  ): void {
    try {
      if (!image) {
        throw new Error('Invalid image or video element');
      }

      const ctx = this.getContext(canvas);

      if (width && height) {
        ctx.drawImage(image, x, y, width, height);
      } else {
        ctx.drawImage(image, x, y);
      }
    } catch (error) {
      throw error;
    }
  }

  // วาด overlay กรอบบัตรประชาชน
  drawIDCardOverlay(
    canvas: HTMLCanvasElement,
    overlayConfig: IDCardOverlayConfig
  ): void {
    const ctx = this.getContext(canvas);
    if (!ctx) return;

    const { width, height } = canvas;
    const {
      overlayColor = 'rgba(0, 0, 0, 0.5)',
      cardOutlineColor = '#00ff00',
      cardOutlineWidth = 3,
      cornerLength = 40,
      showGuideText = true,
      guideText = 'วางบัตรประชาชนให้อยู่ในกรอบ',
    } = overlayConfig;

    // คำนวณขนาดกรอบบัตร (อัตราส่วน 85.6:53.98 ≈ 1.586:1)
    const cardRatio = 1.586;
    const cardWidth = Math.min(width * 0.85, height * 0.85 * cardRatio);
    const cardHeight = cardWidth / cardRatio;

    const cardX = (width - cardWidth) / 2;
    const cardY = (height - cardHeight) / 2;

    // วาดพื้นหลังทึบรอบๆ กรอบ
    ctx.fillStyle = overlayColor;
    ctx.fillRect(0, 0, width, height);

    // ตัดส่วนกลางให้โปร่งใส
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(cardX, cardY, cardWidth, cardHeight);
    ctx.globalCompositeOperation = 'source-over';

    // วาดกรอบบัตร
    ctx.strokeStyle = cardOutlineColor;
    ctx.lineWidth = cardOutlineWidth;
    ctx.strokeRect(cardX, cardY, cardWidth, cardHeight);

    // วาดมุมกรอบ (4 มุม)
    this.drawCorners(
      ctx,
      cardX,
      cardY,
      cardWidth,
      cardHeight,
      cornerLength,
      cardOutlineColor,
      cardOutlineWidth
    );

    // แสดงข้อความแนะนำ
    if (showGuideText) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(guideText, width / 2, cardY - 30);
      ctx.shadowBlur = 0;
    }
  }

  private drawCorners(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    length: number,
    color: string,
    lineWidth: number
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth + 2;
    ctx.lineCap = 'round';

    // มุมบนซ้าย
    ctx.beginPath();
    ctx.moveTo(x, y + length);
    ctx.lineTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.stroke();

    // มุมบนขวา
    ctx.beginPath();
    ctx.moveTo(x + width - length, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + length);
    ctx.stroke();

    // มุมล่างซ้าย
    ctx.beginPath();
    ctx.moveTo(x, y + height - length);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x + length, y + height);
    ctx.stroke();

    // มุมล่างขวา
    ctx.beginPath();
    ctx.moveTo(x + width - length, y + height);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x + width, y + height - length);
    ctx.stroke();
  }

  /**
   * Capture canvas as data URL
   */
  captureFrame(
    canvas: HTMLCanvasElement,
    format: 'image/jpeg' | 'image/png' = 'image/jpeg',
    quality: number = 0.95
  ): string {
    try {
      if (!canvas) {
        throw new Error('Invalid canvas element');
      }

      return canvas.toDataURL(format, quality);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert data URL to Blob
   */
  async dataURLToBlob(dataURL: string): Promise<Blob> {
    try {
      if (!dataURL || !dataURL.startsWith('data:')) {
        throw new Error('Invalid data URL');
      }

      const response = await fetch(dataURL);
      return response.blob();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Convert data URL to File
   */
  async dataURLToFile(
    dataURL: string,
    filename: string = 'image.jpg'
  ): Promise<File> {
    try {
      const blob = await this.dataURLToBlob(dataURL);
      return new File([blob], filename, { type: blob.type });
    } catch (error) {
      throw error;
    }
  }

  /**
   * Resize canvas to fit within max dimensions
   */
  resizeCanvas(
    canvas: HTMLCanvasElement,
    maxWidth: number,
    maxHeight: number
  ): void {
    const { width, height } = canvas;
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth) {
      newWidth = maxWidth;
      newHeight = (height * maxWidth) / width;
    }

    if (newHeight > maxHeight) {
      newHeight = maxHeight;
      newWidth = (width * maxHeight) / height;
    }

    if (newWidth !== width || newHeight !== height) {
      const tempCanvas = this.createCanvas(width, height);
      const tempCtx = this.getContext(tempCanvas);
      tempCtx?.drawImage(canvas, 0, 0);

      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = this.getContext(canvas);
      ctx?.drawImage(tempCanvas, 0, 0, newWidth, newHeight);
    }
  }

  /**
   * Add watermark to canvas
   */
  addWatermark(
    canvas: HTMLCanvasElement,
    text: string,
    options?: WatermarkOptions
  ): void {
    const ctx = this.getContext(canvas);
    if (!ctx) return;

    const {
      position = 'bottom-right',
      fontSize = 16,
      color = 'rgba(255, 255, 255, 0.7)',
      padding = 10,
    } = options || {};

    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.textBaseline = 'bottom';

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;

    let x: number;
    let y: number;

    switch (position) {
      case 'top-left':
        x = padding;
        y = fontSize + padding;
        break;
      case 'top-right':
        x = canvas.width - textWidth - padding;
        y = fontSize + padding;
        break;
      case 'bottom-left':
        x = padding;
        y = canvas.height - padding;
        break;
      case 'bottom-right':
      default:
        x = canvas.width - textWidth - padding;
        y = canvas.height - padding;
        break;
    }

    // Add shadow for better visibility
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * Apply filter to canvas
   */
  applyFilter(canvas: HTMLCanvasElement, filter: CanvasFilter): void {
    const ctx = this.getContext(canvas);
    if (!ctx) return;

    switch (filter) {
      case 'grayscale':
        ctx.filter = 'grayscale(100%)';
        break;
      case 'sepia':
        ctx.filter = 'sepia(100%)';
        break;
      case 'blur':
        ctx.filter = 'blur(5px)';
        break;
      case 'brightness':
        ctx.filter = 'brightness(1.2)';
        break;
      case 'contrast':
        ctx.filter = 'contrast(1.2)';
        break;
      default:
        ctx.filter = 'none';
    }

    // Apply filter by redrawing
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(imageData, 0, 0);
  }
}

export interface IDCardOverlayConfig {
  overlayColor?: string;
  cardOutlineColor?: string;
  cardOutlineWidth?: number;
  cornerLength?: number;
  showGuideText?: boolean;
  guideText?: string;
}

export interface WatermarkOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  fontSize?: number;
  color?: string;
  padding?: number;
}

export type CanvasFilter =
  | 'none'
  | 'grayscale'
  | 'sepia'
  | 'blur'
  | 'brightness'
  | 'contrast';
