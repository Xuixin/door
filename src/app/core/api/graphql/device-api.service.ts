import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../../Database/core/services/network-status.service';

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
  private readonly networkStatus = inject(NetworkStatusService);

  constructor(private http: HttpClient) {}

  /**
   * Execute GraphQL query
   */
  private async query<T = any>(
    query: string,
    variables?: Record<string, any>,
  ): Promise<any> {
    // Check network status - throw error if offline (no fallback for device selection)
    if (!this.networkStatus.isOnline()) {
      throw new Error(
        'Network request failed: Device is offline. Internet connection is required for device selection.',
      );
    }

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
    } catch (error: any) {
      console.error('GraphQL query error:', error);
      // Re-throw with clear error message
      if (error.message) {
        throw error;
      }
      throw new Error(`Failed to query device monitoring: ${error.toString()}`);
    }
  }

  /**
   * List devices by type
   * Query device monitoring collection filtered by type
   */
  async listDevicesByType(type: string): Promise<DeviceMonitoringDocument[]> {
    const query = `
      query pullDeviceMonitoring($input: DeviceMonitoringPull!) {
  pullDeviceMonitoring(input: $input) {
    documents {
      id
      name
      type
      status
      server_updated_at
    }
  }
}
    `;

    const variables = {
      input: {
        checkpoint: {
          id: '',
          server_updated_at: '0',
        },
        where: {
          type: type,
        },
        limit: 50,
      },
    };

    try {
      console.log(`🔍 Querying devices by type: ${type}`);
      const response = await this.query<{
        pullDeviceMonitoring: {
          documents: DeviceMonitoringDocument[];
        };
      }>(query, variables);

      const devices = response.data?.pullDeviceMonitoring?.documents || [];
      console.log(`✅ Found ${devices.length} device(s) for type: ${type}`);
      return devices;
    } catch (error: any) {
      console.error(`❌ Error listing devices by type ${type}:`, error);
      throw new Error(
        `Failed to load devices: ${error.message || error.toString()}`,
      );
    }
  }
}
