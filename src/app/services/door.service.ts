import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Preferences } from '@capacitor/preferences';
import { environment } from '../../environments/environment';

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{
      line: number;
      column: number;
    }>;
    path?: string[];
  }>;
}

export interface Door {
  id: string;
  name: string;
  description?: string;
  checkpoint?: string;
  client_created_at?: string;
  client_updated_at?: string;
  server_created_at?: string;
  server_updated_at?: string;
  deleted?: boolean;
}

export interface PullDoorsResponse {
  pullDoors: {
    documents: Door[];
    checkpoint: {
      id: string;
      server_updated_at: string;
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class DoorService {
  private readonly apiUrl = environment.apiUrl;
  private readonly DOORS_CACHE_KEY = 'doors_cache';
  private readonly DOORS_TIMESTAMP_KEY = 'doors_timestamp';
  private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

  constructor(private http: HttpClient) {}

  /**
   * Execute GraphQL query
   */
  async query<T = any>(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    try {
      const response = await this.http
        .post<GraphQLResponse<T>>(this.apiUrl, {
          query,
          variables,
        })
        .toPromise();

      if (response?.errors && response.errors.length > 0) {
        console.error('GraphQL errors:', response.errors);
        throw new Error(response.errors[0].message);
      }

      return response || { data: null as T };
    } catch (error) {
      console.error('GraphQL query error:', error);
      throw error;
    }
  }

  /**
   * Save doors data to Capacitor Preferences
   */
  private async saveDoorsToPreferences(doors: Door[]): Promise<void> {
    try {
      await Promise.all([
        Preferences.set({
          key: this.DOORS_CACHE_KEY,
          value: JSON.stringify(doors),
        }),
        Preferences.set({
          key: this.DOORS_TIMESTAMP_KEY,
          value: Date.now().toString(),
        }),
      ]);
      console.log('Doors data saved to Capacitor Preferences');
    } catch (error) {
      console.error('Error saving doors to Preferences:', error);
    }
  }

  /**
   * Get doors data from Capacitor Preferences
   */
  private async getDoorsFromPreferences(): Promise<Door[] | null> {
    try {
      const [cachedData, timestampData] = await Promise.all([
        Preferences.get({ key: this.DOORS_CACHE_KEY }),
        Preferences.get({ key: this.DOORS_TIMESTAMP_KEY }),
      ]);

      if (cachedData.value && timestampData.value) {
        const cacheTimestamp = parseInt(timestampData.value);
        const now = Date.now();

        // Check if cache is still valid (within 1 day)
        if (now - cacheTimestamp < this.CACHE_DURATION) {
          console.log('Using doors data from Capacitor Preferences');
          return JSON.parse(cachedData.value);
        } else {
          console.log('Cache expired, will fetch fresh data');
        }
      }
    } catch (error) {
      console.error('Error reading from Capacitor Preferences:', error);
    }

    return null;
  }

  /**
   * Initialize doors data for offline use (call during workflow init)
   */
  async initDoorsForOffline(): Promise<Door[]> {
    try {
      // Try to get from Preferences first
      const cachedDoors = await this.getDoorsFromPreferences();
      if (cachedDoors && cachedDoors.length > 0) {
        return cachedDoors;
      }

      // If no valid cache, pull fresh data
      const doors = await this.pullDoors();
      await this.saveDoorsToPreferences(doors);
      return doors;
    } catch (error) {
      console.error('Error initializing doors for offline:', error);
      // Try to return cached data even if expired
      const cachedDoors = await this.getDoorsFromPreferences();
      if (cachedDoors && cachedDoors.length > 0) {
        console.warn('Using expired cache data due to network error');
        return cachedDoors;
      }
      throw error;
    }
  }

  /**
   * Get doors from Capacitor Preferences or pull from server
   */
  async getDoors(): Promise<Door[]> {
    try {
      // Check if we have data in Capacitor Preferences
      const cachedDoors = await this.getDoorsFromPreferences();
      if (cachedDoors && cachedDoors.length > 0) {
        return cachedDoors;
      }

      // No valid cache, pull fresh data
      console.log('No valid cache found, pulling fresh doors data');
      const doors = await this.pullDoors();
      await this.saveDoorsToPreferences(doors);
      return doors;
    } catch (error) {
      console.error('Error getting doors:', error);

      // If network error, try to use expired cache
      try {
        const [cachedData] = await Promise.all([
          Preferences.get({ key: this.DOORS_CACHE_KEY }),
        ]);

        if (cachedData.value) {
          console.warn('Using expired cache data due to network error');
          return JSON.parse(cachedData.value);
        }
      } catch (cacheError) {
        console.error('Error reading expired cache:', cacheError);
      }

      throw error;
    }
  }

  /**
   * Pull doors using replication query (optimized for offline use)
   */
  async pullDoors(): Promise<Door[]> {
    const query = `
      query PullDoors {
        pullDoors(
          input: { 
            checkpoint: {
              id: "", 
              server_updated_at: "0"
            }, 
            limit: 100 
          }
        ) {
          documents {
            id
            name
            server_updated_at
            server_created_at
            checkpoint
            client_created_at
            client_updated_at
            deleted
          }
        }
      }
    `;

    try {
      const response = await this.query<{ pullDoors: { documents: Door[] } }>(
        query,
      );

      if (response.data?.pullDoors?.documents) {
        // Filter out deleted doors
        const doors = response.data.pullDoors.documents.filter(
          (door: Door) => !door.deleted,
        );

        // Save to Capacitor Preferences
        await this.saveDoorsToPreferences(doors);

        return doors;
      }

      return [];
    } catch (error) {
      console.error('Error pulling doors:', error);

      // If we have cached data in Preferences, return it even if it's stale
      try {
        const [cachedData] = await Promise.all([
          Preferences.get({ key: this.DOORS_CACHE_KEY }),
        ]);

        if (cachedData.value) {
          console.warn('Using cached doors data due to network error');
          return JSON.parse(cachedData.value);
        }
      } catch (cacheError) {
        console.error('Error reading cached data:', cacheError);
      }

      throw error;
    }
  }
}
