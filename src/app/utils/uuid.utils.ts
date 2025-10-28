/**
 * UUID Utilities
 *
 * Pure utility functions for UUID/ID generation
 * No dependencies, can be used anywhere
 */
export class UUIDUtils {
  /**
   * Generate UUID v4
   * Uses crypto.randomUUID() if available, fallback to manual generation
   * @returns string - UUID v4
   */
  static generateUUID(): string {
    // Use native crypto.randomUUID() if available (modern browsers)
    if (crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback: Generate UUID v4 manually
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Generate short ID (8 characters)
   * @returns string - Short ID
   */
  static generateShortId(): string {
    return this.generateUUID().split('-')[0];
  }

  /**
   * Generate transaction ID with format: parking-door-{doorId}-{uuid}
   * @param doorId - Door number (default: '1')
   * @returns string - Transaction ID
   */
  static generateTxnId(doorId: string = '1'): string {
    const uuid = this.generateUUID();
    return `parking-door-${doorId}-${uuid}`;
  }

  /**
   * Generate exception log ID with format: log-{timestamp}-{shortId}
   * @returns string - Exception log ID
   */
  static generateLogId(): string {
    const timestamp = Date.now();
    const shortId = this.generateShortId();
    return `log-${timestamp}-${shortId}`;
  }

  /**
   * Generate prefixed ID
   * @param prefix - Prefix string
   * @param separator - Separator character (default: '-')
   * @returns string - Prefixed ID
   */
  static generatePrefixedId(prefix: string, separator: string = '-'): string {
    const uuid = this.generateUUID();
    return `${prefix}${separator}${uuid}`;
  }

  /**
   * Validate UUID v4 format
   * @param uuid - UUID string to validate
   * @returns boolean
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Extract UUID from prefixed ID
   * @param prefixedId - Prefixed ID (e.g., "parking-door-1-uuid")
   * @param separator - Separator character (default: '-')
   * @returns string | null - Extracted UUID or null if not found
   */
  static extractUUID(
    prefixedId: string,
    separator: string = '-'
  ): string | null {
    const parts = prefixedId.split(separator);

    // Find UUID pattern in parts
    for (const part of parts) {
      if (this.isValidUUID(part)) {
        return part;
      }
    }

    // Check if last part could be UUID (might not be properly formatted)
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.length >= 32) {
      return lastPart;
    }

    return null;
  }
}
