import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Custom Error Handler to filter out expected RxDB errors
 * that occur during replication cleanup when storage instances are closed
 */
@Injectable()
export class RxDBErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    // Check if this is an expected RxDB storage closed error
    // This happens when RxDB tries to cleanup storage instances
    // after replication has been cancelled and storage is already closed
    const errorMessage = error?.message || error?.toString() || '';
    const errorStack = error?.stack || '';

    // Filter out expected "RxStorageInstanceDexie is closed" errors
    // These occur during RxDB internal cleanup after replication cancellation
    if (
      errorMessage.includes('RxStorageInstanceDexie is closed') ||
      errorMessage.includes('RxStorageInstance') ||
      errorStack.includes('RxStorageInstanceDexie') ||
      errorStack.includes('ensureNotClosed')
    ) {
      // This is an expected error during cleanup - don't log as error
      // It happens when RxDB tries to cleanup storage instances that are already closed
      console.debug(
        '🔇 [RxDBErrorHandler] Suppressed expected storage closed error during cleanup',
      );
      return; // Don't log or throw this error
    }

    // Log all other errors normally
    console.error('❌ [RxDBErrorHandler] Unhandled error:', error);
  }
}
