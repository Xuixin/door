import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../../Database/services/network-status.service';

/**
 * GraphQL Response interface
 */
interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{ message: string; extensions?: any }>;
}

/**
 * Device Monitoring document interface (from API)
 */
export interface DeviceMonitoringDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  meta_data?: string;
  created_by?: string;
  server_created_at?: string;
  cloud_created_at?: string;
  client_created_at?: string;
  server_updated_at?: string;
  cloud_updated_at?: string;
  client_updated_at?: string;
  diff_time_create?: string;
  diff_time_update?: string;
}

/**
 * Device API Service
 * Direct GraphQL queries for device monitoring (no RxDB dependency)
 */
@Injectable({
  providedIn: 'root',
})
export class DeviceApiService {
  private readonly apiUrl = environment.apiUrl;
  private readonly apiSecondaryUrl =
    environment.apiSecondaryUrl || environment.apiUrl;
  private readonly networkStatus = inject(NetworkStatusService);
  private currentServerUrl = this.apiUrl; // Track which server was successfully used

  constructor(private http: HttpClient) {}

  /**
   * Get the current server URL that was successfully used
   */
  getCurrentServerUrl(): string {
    return this.currentServerUrl;
  }

  /**
   * Check if currently using secondary server
   */
  isUsingSecondaryServer(): boolean {
    return this.currentServerUrl === this.apiSecondaryUrl;
  }

  /**
   * Execute GraphQL query with automatic fallback to secondary server
   */
  private async query<T = any>(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    // Check network status
    if (!this.networkStatus.isOnline()) {
      throw new Error(
        'Network request failed: Device is offline. Internet connection is required for device selection.',
      );
    }

    // Try primary server first
    try {
      console.log('🔄 Trying PRIMARY server:', this.apiUrl);
      const response = await this.http
        .post<GraphQLResponse<T>>(this.apiUrl, {
          query,
          variables,
        })
        .toPromise();

      if (response?.errors && response.errors.length > 0) {
        console.error('GraphQL errors from primary:', response.errors);
        throw new Error(response.errors[0].message);
      }

      this.currentServerUrl = this.apiUrl;
      console.log('✅ PRIMARY server responded successfully');
      return response || { data: null as T };
    } catch (primaryError: any) {
      // Try secondary server as fallback
      try {
        console.log('🔄 Trying SECONDARY server:', this.apiSecondaryUrl);
        const response = await this.http
          .post<GraphQLResponse<T>>(this.apiSecondaryUrl, {
            query,
            variables,
          })
          .toPromise();

        if (response?.errors && response.errors.length > 0) {
          console.error('GraphQL errors from secondary:', response.errors);
          throw new Error(response.errors[0].message);
        }

        this.currentServerUrl = this.apiSecondaryUrl;
        console.log('✅ SECONDARY server responded successfully');
        return response || { data: null as T };
      } catch (secondaryError: any) {
        console.error(
          '❌ SECONDARY server also failed:',
          secondaryError.message || secondaryError,
        );
        // Both servers failed
        throw new Error(
          `ไม่สามารถเชื่อมต่อทั้งเซิร์ฟเวอร์หลักและสำรอง กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต`,
        );
      }
    }
  }

  /**
   * List devices by type
   * Query device monitoring collection filtered by type
   * Handles fallback with correct checkpoint fields for each server
   */
  async listDevicesByType(type: string): Promise<DeviceMonitoringDocument[]> {
    // Helper to build query and variables for specific checkpoint field and server type
    const buildQueryAndVariables = (
      checkpointField: 'server_updated_at' | 'cloud_updated_at',
      isPrimary: boolean,
    ) => {
      const query = `
      query pullDeviceMonitoring($input: DeviceMonitoringPull!) {
  pullDeviceMonitoring(input: $input) {
    documents {
      id
      name
      type
      status
        ${checkpointField}
    }
  }
}
    `;

      const checkpoint: any = { id: '' };
      checkpoint[checkpointField] = '0';

      // Primary server (10102) uses MongoDB query operators: { $eq: "KIOSK" }
      // Secondary server (3001) uses simple string: "KIOSK"
      const where = isPrimary ? { type } : { type: type };

      const variables = {
        input: {
          checkpoint,
          where,
          limit: 50,
        },
      };

      return { query, variables };
    };

    // Check network status first
    if (!this.networkStatus.isOnline()) {
      throw new Error(
        'Network request failed: Device is offline. Internet connection is required.',
      );
    }

    // Try primary server first
    try {
      console.log(`🔍 Querying devices by type: ${type} on PRIMARY server`);
      const { query, variables } = buildQueryAndVariables(
        'server_updated_at',
        true,
      );

      const response = await this.http
        .post<
          GraphQLResponse<{
            pullDeviceMonitoring: { documents: DeviceMonitoringDocument[] };
          }>
        >(this.apiUrl, { query, variables })
        .toPromise();

      if (response?.errors && response.errors.length > 0) {
        console.error('GraphQL errors from primary:', response.errors);
        throw new Error(response.errors[0].message);
      }

      this.currentServerUrl = this.apiUrl; // Track successful server
      const devices = response?.data?.pullDeviceMonitoring?.documents || [];
      console.log(`✅ Found ${devices.length} device(s) for type: ${type}`);
      return devices;
    } catch (primaryError: any) {
      // Try secondary server as fallback
      try {
        console.log(`🔄 Trying SECONDARY server for type: ${type}`);
        const { query, variables } = buildQueryAndVariables(
          'cloud_updated_at',
          false,
        );

        const response = await this.http
          .post<
            GraphQLResponse<{
              pullDeviceMonitoring: { documents: DeviceMonitoringDocument[] };
            }>
          >(this.apiSecondaryUrl, { query, variables })
          .toPromise();

        if (response?.errors && response.errors.length > 0) {
          console.error('GraphQL errors from secondary:', response.errors);
          throw new Error(response.errors[0].message);
        }

        this.currentServerUrl = this.apiSecondaryUrl; // Track successful server
        const devices = response?.data?.pullDeviceMonitoring?.documents || [];
        console.log(
          `✅ Found ${devices.length} device(s) for type: ${type} on SECONDARY`,
        );
        return devices;
      } catch (secondaryError: any) {
        console.error(
          '❌ SECONDARY server also failed:',
          secondaryError.message || secondaryError,
        );
        throw new Error(
          `ไม่สามารถเชื่อมต่อทั้งเซิร์ฟเวอร์หลักและสำรอง กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต`,
        );
      }
    }
  }
}
