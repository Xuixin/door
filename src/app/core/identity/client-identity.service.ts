import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Preferences } from '@capacitor/preferences';

const CLIENT_ID_KEY = 'client_id';
const CLIENT_NAME_KEY = 'client_name';
const CLIENT_TYPE_KEY = 'client_type';

@Injectable({ providedIn: 'root' })
export class ClientIdentityService {
  private cachedId?: string;
  private cachedName?: string;
  private cachedType?: string;

  getClientType(): string {
    return (environment as any).clientType || 'KIOSK';
  }

  /**
   * Get client ID from Preferences
   * Returns null if not set (does not auto-generate UUID)
   */
  async getClientId(): Promise<string | null> {
    if (this.cachedId !== undefined) return this.cachedId || null;

    const { value } = await Preferences.get({ key: CLIENT_ID_KEY });
    this.cachedId = value || undefined;
    return this.cachedId || null;
  }

  /**
   * Set client ID and save to Preferences
   */
  async setClientId(id: string): Promise<void> {
    await Preferences.set({ key: CLIENT_ID_KEY, value: id });
    this.cachedId = id;
  }

  /**
   * Remove client ID from Preferences
   */
  async removeClientId(): Promise<void> {
    await Preferences.remove({ key: CLIENT_ID_KEY });
    this.cachedId = undefined;
  }

  /**
   * Get client name from Preferences
   */
  async getClientName(): Promise<string | null> {
    if (this.cachedName !== undefined) return this.cachedName || null;

    const { value } = await Preferences.get({ key: CLIENT_NAME_KEY });
    this.cachedName = value || undefined;
    return this.cachedName || null;
  }

  /**
   * Set client name and save to Preferences
   */
  async setClientName(name: string): Promise<void> {
    await Preferences.set({ key: CLIENT_NAME_KEY, value: name });
    this.cachedName = name;
  }

  /**
   * Get client type from Preferences (or from environment as fallback)
   */
  async getClientTypeStored(): Promise<string> {
    if (this.cachedType) return this.cachedType;

    const { value } = await Preferences.get({ key: CLIENT_TYPE_KEY });
    if (value) {
      this.cachedType = value;
      return value;
    }
    // Fallback to environment
    return this.getClientType();
  }

  /**
   * Set client type and save to Preferences
   */
  async setClientType(type: string): Promise<void> {
    await Preferences.set({ key: CLIENT_TYPE_KEY, value: type });
    this.cachedType = type;
  }
}
