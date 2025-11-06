/**
 * Blob Utilities
 *
 * Pure utility functions for Blob/Base64 conversions
 * No dependencies, can be used anywhere
 */
export class BlobUtils {
  /**
   * Convert Blob to Base64 string
   * @param blob - Blob to convert
   * @returns Promise<string> - Base64 string with data URL prefix
   */
  static async toBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Convert Base64 string to Blob
   * @param base64 - Base64 string (with or without data URL prefix)
   * @param contentType - MIME type (optional, will be extracted from data URL if present)
   * @returns Blob
   */
  static fromBase64(base64: string, contentType: string = ''): Blob {
    // Extract content type from data URL if present
    let actualContentType = contentType;
    let base64Data = base64;

    if (base64.includes(',')) {
      const parts = base64.split(',');
      base64Data = parts[1];

      // Extract content type from data URL (e.g., "data:image/jpeg;base64,...")
      if (!contentType && parts[0].includes(':')) {
        const match = parts[0].match(/:(.*?);/);
        if (match) {
          actualContentType = match[1];
        }
      }
    }

    // Decode base64
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);

    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: actualContentType });
  }

  /**
   * Convert Blob to Data URL (alias for toBase64)
   * @param blob - Blob to convert
   * @returns Promise<string> - Data URL string
   */
  static async toDataUrl(blob: Blob): Promise<string> {
    return this.toBase64(blob);
  }

  /**
   * Convert Data URL to Blob (alias for fromBase64)
   * @param dataUrl - Data URL string
   * @returns Blob
   */
  static fromDataUrl(dataUrl: string): Blob {
    return this.fromBase64(dataUrl);
  }

  /**
   * Get Blob size in bytes
   * @param blob - Blob to measure
   * @returns number - Size in bytes
   */
  static getSize(blob: Blob): number {
    return blob.size;
  }

  /**
   * Get Blob size in human-readable format
   * @param blob - Blob to measure
   * @returns string - Formatted size (e.g., "1.5 MB")
   */
  static getFormattedSize(blob: Blob): string {
    const bytes = blob.size;

    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Create object URL from Blob
   * @param blob - Blob to create URL from
   * @returns string - Object URL
   */
  static createObjectURL(blob: Blob): string {
    return URL.createObjectURL(blob);
  }

  /**
   * Revoke object URL
   * @param url - Object URL to revoke
   */
  static revokeObjectURL(url: string): void {
    URL.revokeObjectURL(url);
  }
}
