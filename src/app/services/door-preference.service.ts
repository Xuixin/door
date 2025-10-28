import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({
  providedIn: 'root',
})
export class DoorPreferenceService {
  private readonly DOOR_ID_KEY = 'door_id';
  private readonly DOOR_NAME_KEY = 'door_name';
  /**
   * Get the stored door ID
   */
  async getDoorId(): Promise<string | null> {
    try {
      const result = await Preferences.get({ key: this.DOOR_ID_KEY });
      return result.value;
    } catch (error) {
      console.error('Error getting door ID from preferences:', error);
      return null;
    }
  }

  /**
   * Set the door ID
   */
  async setDoorId(doorId: string): Promise<boolean> {
    try {
      await Preferences.set({
        key: this.DOOR_ID_KEY,
        value: doorId,
      });
      console.log('Door ID saved to preferences:', doorId);
      return true;
    } catch (error) {
      console.error('Error saving door ID to preferences:', error);
      return false;
    }
  }
    
    
    async getDoorName(): Promise<string | null> {
    try {
      const result = await Preferences.get({ key: this.DOOR_NAME_KEY });
      return result.value;
    } catch (error) {
      console.error('Error getting door name from preferences:', error);
      return null;
    }
  }
    
    
    async setDoorName(doorName: string): Promise<boolean> {
    try {
      await Preferences.set({
        key: this.DOOR_NAME_KEY,
        value: doorName,
      });
      console.log('Door name saved to preferences:', doorName);
      return true;
    } catch (error) {
      console.error('Error saving door name to preferences:', error);
      return false;
    }
  }

  /**
   * Check if door ID exists
   */
  async hasDoorId(): Promise<boolean> {
    try {
      const doorId = await this.getDoorId();
      return doorId !== null && doorId !== '';
    } catch (error) {
      console.error('Error checking door ID existence:', error);
      return false;
    }
  }

  /**
   * Remove the door ID
   */
  async removeDoorId(): Promise<boolean> {
    try {
      await Preferences.remove({ key: this.DOOR_ID_KEY });
      console.log('Door ID removed from preferences');
      return true;
    } catch (error) {
      console.error('Error removing door ID from preferences:', error);
      return false;
    }
  }

  /**
   * Clear all preferences (for testing/reset)
   */
  async clearAll(): Promise<boolean> {
    try {
      await Preferences.clear();
      console.log('All preferences cleared');
      return true;
    } catch (error) {
      console.error('Error clearing preferences:', error);
      return false;
    }
  }
}
