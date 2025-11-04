import { ErrorHandler, Injectable, inject } from '@angular/core';
import { ClientEventLoggingService } from '../monitoring/client-event-logging.service';
import { NetworkStatusService } from '../Database/core/services/network-status.service';

/**
 * User-friendly error messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Network errors
  ECONNREFUSED:
    'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
  ENOTFOUND: 'ไม่พบเซิร์ฟเวอร์ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
  ETIMEDOUT: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง',
  'Network request failed':
    'การเชื่อมต่อเครือข่ายล้มเหลว กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
  'Failed to fetch':
    'ไม่สามารถดึงข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต',
  NetworkError: 'เกิดข้อผิดพลาดจากการเชื่อมต่อเครือข่าย',
  timeout: 'การเชื่อมต่อหมดเวลา กรุณาลองใหม่อีกครั้ง',

  // Database errors
  'Database not initialized': 'ฐานข้อมูลยังไม่พร้อม กำลังโหลด...',
  'Database locked': 'ฐานข้อมูลถูกล็อค กรุณาปิดแอปและเปิดใหม่',
  RxStorageInstanceClosedError: 'ฐานข้อมูลถูกปิด กรุณาเปิดแอปใหม่อีกครั้ง',

  // Generic errors
  'Unknown error': 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ',
};

/**
 * Global Error Handler Service
 * Catches all unhandled errors and provides user-friendly error messages
 */
@Injectable()
export class GlobalErrorHandlerService implements ErrorHandler {
  private readonly eventLogging = inject(ClientEventLoggingService);
  private readonly networkStatus = inject(NetworkStatusService);

  handleError(error: any): void {
    // Ignore storage closed errors - these are expected when replication is stopped
    if (this.isStorageClosedError(error)) {
      return; // Silently ignore
    }

    const errorInfo = this.extractErrorInfo(error);

    // Log error for debugging
    console.error('🚨 Global Error Handler:', errorInfo);

    // Determine if this is a network error
    const isNetworkError = this.isNetworkError(error);
    const isOffline = !this.networkStatus.isOnline();

    // Log to event logging service (if available)
    try {
      if (this.eventLogging && typeof this.eventLogging === 'function') {
        // this.eventLogging.logError({
        //   message: errorInfo.message,
        //   stack: errorInfo.stack,
        //   isNetworkError,
        //   isOffline,
        //   timestamp: new Date().toISOString(),
        // } as any);
      }
    } catch (loggingError) {
      console.error('Failed to log error:', loggingError);
    }

    // Show user-friendly error message
    this.showUserFriendlyError(errorInfo, isNetworkError, isOffline);
  }

  /**
   * Extract error information
   */
  private extractErrorInfo(error: any): {
    message: string;
    stack?: string;
    name?: string;
    code?: string;
  } {
    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: (error as any).code,
      };
    }

    if (typeof error === 'string') {
      return { message: error };
    }

    if (error && typeof error === 'object') {
      return {
        message: error.message || error.error?.message || 'Unknown error',
        stack: error.stack,
        name: error.name,
        code: error.code || error.error?.code,
      };
    }

    return { message: 'Unknown error occurred' };
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: any): boolean {
    const errorString = JSON.stringify(error).toLowerCase();
    const errorMessage = error?.message?.toLowerCase() || '';
    const errorName = error?.name?.toLowerCase() || '';
    const errorCode = error?.code?.toLowerCase() || '';

    const networkPatterns = [
      'network',
      'connection',
      'econnrefused',
      'enotfound',
      'timeout',
      'etimedout',
      'failed to fetch',
      'networkerror',
      'websocket',
      'socket',
    ];

    return (
      networkPatterns.some(
        (pattern) =>
          errorString.includes(pattern) ||
          errorMessage.includes(pattern) ||
          errorName.includes(pattern) ||
          errorCode.includes(pattern),
      ) ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ETIMEDOUT'
    );
  }

  /**
   * Show user-friendly error message
   */
  private showUserFriendlyError(
    errorInfo: { message: string; code?: string },
    isNetworkError: boolean,
    isOffline: boolean,
  ): void {
    // Don't show alerts for every error - too intrusive
    // Instead, log and let components handle their own error states
    // Only show critical errors that need immediate attention

    let userMessage =
      ERROR_MESSAGES[errorInfo.code || ''] ||
      ERROR_MESSAGES[errorInfo.message] ||
      errorInfo.message;

    // Add offline context if applicable
    if (isNetworkError && isOffline) {
      userMessage = 'คุณกำลังออฟไลน์ ' + userMessage;
    }

    // Only show alert for critical errors
    // Most errors should be handled by components with proper error states
    if (this.isCriticalError(errorInfo)) {
      // In production, use a toast service or error notification component
      // For now, just log - components should handle their own error states
      console.warn(
        '⚠️ Critical error (would show user notification):',
        userMessage,
      );
    }
  }

  /**
   * Check if error is critical and requires user notification
   */
  private isCriticalError(errorInfo: {
    message: string;
    code?: string;
  }): boolean {
    const criticalPatterns = [
      'database locked',
      'database not initialized',
      'storage',
      'memory',
    ];

    return criticalPatterns.some((pattern) =>
      errorInfo.message.toLowerCase().includes(pattern),
    );
  }

  /**
   * Check if error is related to closed storage instance
   * These errors are expected when replication is stopped and should be ignored
   */
  private isStorageClosedError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error?.message?.toLowerCase() || '';
    const errorString = JSON.stringify(error).toLowerCase();
    const errorName = error?.name || '';
    const errorStack = error?.stack?.toLowerCase() || '';

    // Check exact error name first
    if (errorName === 'RxStorageInstanceClosedError') {
      return true;
    }

    // Check error message for closed storage patterns
    const messagePatterns = [
      'rxstorageinstancedexie is closed',
      'rxstorageinstance.*closed',
      'rxstorageinstanceclosederror',
      'is closed',
      'storage.*closed',
      'replication.*meta',
    ];

    // Check if error message contains any closed pattern
    const messageMatch = messagePatterns.some((pattern) => {
      const regex = new RegExp(pattern, 'i');
      return (
        regex.test(errorMessage) ||
        regex.test(errorString) ||
        regex.test(errorStack)
      );
    });

    if (messageMatch) {
      return true;
    }

    // Additional regex checks for various formats
    return (
      /rxstorageinstance.*closed/i.test(errorMessage) ||
      /rxstorageinstance.*closed/i.test(errorString) ||
      /rxstorageinstance.*closed/i.test(errorStack) ||
      /rx.*replication.*meta.*closed/i.test(errorMessage) ||
      /rx.*replication.*meta.*closed/i.test(errorString)
    );
  }
}
