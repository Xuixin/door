/**
 * Validator Utilities
 *
 * Pure utility functions for data validation
 * No dependencies, can be used anywhere
 */
export class ValidatorUtils {
  /**
   * Validate Thai National ID Card (13 digits)
   * Uses checksum algorithm
   * @param id - ID card number
   * @returns boolean
   */
  static isThaiIdCard(id: string): boolean {
    if (!id) return false;

    // Remove spaces and dashes
    const cleanId = id.replace(/[\s-]/g, '');

    // Must be exactly 13 digits
    if (!/^\d{13}$/.test(cleanId)) {
      return false;
    }

    // Validate checksum
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cleanId.charAt(i)) * (13 - i);
    }

    const mod = sum % 11;
    const checkDigit = (11 - mod) % 10;

    return checkDigit === parseInt(cleanId.charAt(12));
  }

  /**
   * Validate phone number
   * @param phone - Phone number
   * @param region - Region code (default: 'TH' for Thailand)
   * @returns boolean
   */
  static isPhoneNumber(phone: string, region: string = 'TH'): boolean {
    if (!phone) return false;

    // Remove common formatting characters
    const cleanPhone = phone.replace(/[\s\-()]/g, '');

    if (region === 'TH') {
      // Thai phone number patterns
      // Mobile: 0X-XXXX-XXXX (10 digits starting with 0)
      // Landline: 0X-XXX-XXXX (9-10 digits starting with 0)
      // International: +66-X-XXXX-XXXX (starts with +66 or 66)

      if (/^0\d{8,9}$/.test(cleanPhone)) {
        return true; // Local format
      }

      if (/^(\+66|66)\d{8,9}$/.test(cleanPhone)) {
        return true; // International format
      }

      return false;
    }

    // Generic phone number validation (10-15 digits)
    return /^\+?\d{10,15}$/.test(cleanPhone);
  }

  /**
   * Validate Thai license plate number
   * Formats: กข 1234, 1กข 1234, กข-1234, etc.
   * @param plate - License plate number
   * @returns boolean
   */
  static isLicensePlate(plate: string): boolean {
    if (!plate) return false;

    const cleanPlate = plate.trim();

    // Thai license plate patterns:
    // 1. กข 1234 (2 Thai letters + space + 1-4 digits)
    // 2. 1กข 1234 (1 digit + 2 Thai letters + space + 1-4 digits)
    // 3. กขค 1234 (3 Thai letters + space + 1-4 digits)
    // Allow optional dash/space between parts

    const thaiLetterPattern = '[\u0E00-\u0E7F]'; // Thai Unicode range

    const patterns = [
      `^${thaiLetterPattern}{2}[\\s-]?\\d{1,4}$`, // กข 1234
      `^\\d{1}${thaiLetterPattern}{2}[\\s-]?\\d{1,4}$`, // 1กข 1234
      `^${thaiLetterPattern}{3}[\\s-]?\\d{1,4}$`, // กขค 1234
    ];

    return patterns.some(pattern => new RegExp(pattern).test(cleanPlate));
  }

  /**
   * Validate email address
   * @param email - Email address
   * @returns boolean
   */
  static isEmail(email: string): boolean {
    if (!email) return false;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL
   * @param url - URL string
   * @returns boolean
   */
  static isUrl(url: string): boolean {
    if (!url) return false;

    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if string is empty or whitespace only
   * @param str - String to check
   * @returns boolean
   */
  static isEmpty(str: string | null | undefined): boolean {
    return !str || str.trim().length === 0;
  }

  /**
   * Check if string has minimum length
   * @param str - String to check
   * @param minLength - Minimum length
   * @returns boolean
   */
  static hasMinLength(str: string, minLength: number): boolean {
    return !!(str && str.length >= minLength);
  }

  /**
   * Check if string has maximum length
   * @param str - String to check
   * @param maxLength - Maximum length
   * @returns boolean
   */
  static hasMaxLength(str: string, maxLength: number): boolean {
    return !!(str && str.length <= maxLength);
  }

  /**
   * Check if value is a number
   * @param value - Value to check
   * @returns boolean
   */
  static isNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * Check if value is within range
   * @param value - Number to check
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns boolean
   */
  static isInRange(value: number, min: number, max: number): boolean {
    return this.isNumber(value) && value >= min && value <= max;
  }
}
