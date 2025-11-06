/**
 * Time Utilities
 *
 * Pure utility functions for time/date operations
 * No dependencies, can be used anywhere
 */
export class TimeUtils {
  static unixToThaiDate(
    unix: number,
    withTime: boolean = false,
    onlyTime: boolean = false
  ): string {
    const date = this.fromUnixTimestamp(unix);

    // Use global format (en-US) instead of Thai locale
    if (onlyTime) {
      return date.toLocaleString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }

    if (withTime) {
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  /**
   * Get current Unix timestamp (milliseconds since epoch)
   * @returns number - Unix timestamp in milliseconds
   */
  static currentUnixTimestamp(): number {
    return Date.now();
  }

  /**
   * Get current timestamp in milliseconds
   * @returns number - Timestamp in milliseconds
   */
  static currentTimestamp(): number {
    return Date.now();
  }

  /**
   * Convert Unix timestamp to Date object
   * @param timestamp - Unix timestamp (milliseconds)
   * @returns Date
   */
  static fromUnixTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  /**
   * Convert Date to Unix timestamp
   * @param date - Date object
   * @returns number - Unix timestamp (milliseconds)
   */
  static toUnixTimestamp(date: Date): number {
    return date.getTime();
  }

  /**
   * Format Unix timestamp to readable string
   * @param timestamp - Unix timestamp (milliseconds) or null
   * @param locale - Locale string (default: 'th-TH')
   * @param options - Intl.DateTimeFormatOptions
   * @returns string - Formatted date string or 'N/A' if null
   */
  static formatTimestamp(
    timestamp: number | null,
    locale: string = 'th-TH',
    options?: Intl.DateTimeFormatOptions
  ): string {
    if (!timestamp) return 'N/A';

    const date = this.fromUnixTimestamp(timestamp);

    const defaultOptions: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options,
    };

    return date.toLocaleString(locale, defaultOptions);
  }

  /**
   * Format Unix timestamp to short date string
   * @param timestamp - Unix timestamp (milliseconds) or null
   * @param locale - Locale string (default: 'th-TH')
   * @returns string - Formatted short date or '-' if null
   */
  static formatTimestampShort(
    timestamp: number | null,
    locale: string = 'th-TH'
  ): string {
    if (!timestamp) return '-';

    const date = this.fromUnixTimestamp(timestamp);
    return date.toLocaleDateString(locale);
  }

  /**
   * Format duration in milliseconds to human-readable string
   * @param ms - Duration in milliseconds
   * @returns string - Formatted duration (e.g., "2h 30m 15s")
   */
  static formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Format milliseconds to short duration
   * @param ms - Duration in milliseconds
   * @returns string - Formatted duration (e.g., "2.5s", "150ms")
   */
  static formatDurationShort(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else {
      return `${(ms / 1000).toFixed(1)}s`;
    }
  }

  /**
   * Parse date string to Unix timestamp
   * @param dateString - Date string
   * @returns number - Unix timestamp (milliseconds)
   */
  static parseToUnixTimestamp(dateString: string): number {
    return new Date(dateString).getTime();
  }

  /**
   * Check if timestamp is in the past
   * @param timestamp - Unix timestamp (milliseconds)
   * @returns boolean
   */
  static isPast(timestamp: number): boolean {
    return timestamp < this.currentUnixTimestamp();
  }

  /**
   * Check if timestamp is in the future
   * @param timestamp - Unix timestamp (milliseconds)
   * @returns boolean
   */
  static isFuture(timestamp: number): boolean {
    return timestamp > this.currentUnixTimestamp();
  }

  /**
   * Get time difference between two timestamps
   * @param timestamp1 - First Unix timestamp (milliseconds)
   * @param timestamp2 - Second Unix timestamp (milliseconds)
   * @returns number - Difference in milliseconds
   */
  static diff(timestamp1: number, timestamp2: number): number {
    return Math.abs(timestamp1 - timestamp2);
  }

  /**
   * Get time ago string (e.g., "2 hours ago", "3 days ago")
   * @param timestamp - Unix timestamp (milliseconds)
   * @param locale - Locale string (default: 'en-US')
   * @returns string
   */
  static timeAgo(timestamp: number, locale: string = 'en-US'): string {
    const now = this.currentUnixTimestamp();
    const diffMs = now - timestamp;
    const diffSec = Math.floor(diffMs / 1000);

    const isThai = locale.startsWith('th');

    if (diffSec < 60) {
      return isThai ? 'เมื่อสักครู่' : 'just now';
    } else if (diffSec < 3600) {
      const minutes = Math.floor(diffSec / 60);
      return isThai ? `${minutes} นาทีที่แล้ว` : `${minutes} minutes ago`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return isThai ? `${hours} ชั่วโมงที่แล้ว` : `${hours} hours ago`;
    } else {
      const days = Math.floor(diffSec / 86400);
      return isThai ? `${days} วันที่แล้ว` : `${days} days ago`;
    }
  }
}
