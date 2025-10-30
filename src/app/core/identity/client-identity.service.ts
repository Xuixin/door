import { Injectable } from '@angular/core';
import { environment } from 'src/environments/environment';
import { Preferences } from '@capacitor/preferences';

const CLIENT_ID_KEY = 'client_id';
const DOOR_NAME_KEY = 'door_name';

@Injectable({ providedIn: 'root' })
export class ClientIdentityService {
  private cachedId?: string;

  getClientType(): string {
    return (environment as any).clientType || 'DOOR';
  }

  async getClientId(): Promise<string | null> {
    if (this.cachedId) return this.cachedId;
    const { value } = await Preferences.get({ key: CLIENT_ID_KEY });
    this.cachedId = value || undefined;
    return value;
  }

  // ---- ClientId methods ----

  async getClientIdRaw(): Promise<string | null> {
    try {
      const result = await Preferences.get({ key: CLIENT_ID_KEY });
      return result.value;
    } catch (error) {
      console.error('Error getting client ID from preferences:', error);
      return null;
    }
  }

  async setClientId(clientId: string): Promise<boolean> {
    try {
      await Preferences.set({ key: CLIENT_ID_KEY, value: clientId });
      console.log('Client ID saved to preferences:', clientId);
      return true;
    } catch (error) {
      console.error('Error saving client ID to preferences:', error);
      return false;
    }
  }

  async hasClientId(): Promise<boolean> {
    try {
      const clientId = await this.getClientIdRaw();
      return clientId !== null && clientId !== '';
    } catch (error) {
      console.error('Error checking client ID existence:', error);
      return false;
    }
  }

  async removeClientId(): Promise<boolean> {
    try {
      await Preferences.remove({ key: CLIENT_ID_KEY });
      console.log('Client ID removed from preferences');
      return true;
    } catch (error) {
      console.error('Error removing client ID from preferences:', error);
      return false;
    }
  }

  // ---- DoorName methods ----

  async getDoorName(): Promise<string | null> {
    try {
      const result = await Preferences.get({ key: DOOR_NAME_KEY });
      return result.value;
    } catch (error) {
      console.error('Error getting door name from preferences:', error);
      return null;
    }
  }

  async setDoorName(doorName: string): Promise<boolean> {
    try {
      await Preferences.set({ key: DOOR_NAME_KEY, value: doorName });
      console.log('Door name saved to preferences:', doorName);
      return true;
    } catch (error) {
      console.error('Error saving door name to preferences:', error);
      return false;
    }
  }

  async removeDoorName(): Promise<boolean> {
    try {
      await Preferences.remove({ key: DOOR_NAME_KEY });
      console.log('Door name removed from preferences');
      return true;
    } catch (error) {
      console.error('Error removing door name from preferences:', error);
      return false;
    }
  }
}
