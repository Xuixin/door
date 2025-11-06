import { environment } from 'src/environments/environment';

/**
 * Helper class for building replication configurations
 * Handles URL-specific query modifications and checkpoint handling
 */
export class ReplicationConfigBuilder {
  /**
   * Modify GraphQL query for specific server URL
   * Replaces placeholder URLs in queries with actual server URLs
   * IMPORTANT: Also replaces checkpoint field in query based on server:
   * - Server 3001 (secondary): uses cloud_updated_at
   * - Server 10102 (primary): uses server_updated_at
   */
  static modifyQueryForServer(query: string, url?: string): string {
    if (!url) {
      return query;
    }

    const isSecondary = url.includes(':3001');

    // Replace common GraphQL server URLs in query strings
    const primaryHttp = environment.apiUrl;
    const primaryWs = environment.wsUrl;
    const secondaryHttp = environment.apiSecondaryUrl || environment.apiUrl;
    const secondaryWs = environment.wsSecondaryUrl || environment.wsUrl;

    let modifiedQuery = query;

    // Replace primary URLs if target is secondary
    if (isSecondary) {
      modifiedQuery = modifiedQuery.replace(
        new RegExp(primaryHttp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        secondaryHttp,
      );
      modifiedQuery = modifiedQuery.replace(
        new RegExp(primaryWs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        secondaryWs,
      );
    } else {
      // Replace secondary URLs if target is primary
      if (secondaryHttp !== primaryHttp) {
        modifiedQuery = modifiedQuery.replace(
          new RegExp(secondaryHttp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          primaryHttp,
        );
      }
      if (secondaryWs !== primaryWs) {
        modifiedQuery = modifiedQuery.replace(
          new RegExp(secondaryWs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
          primaryWs,
        );
      }
    }

    // CRITICAL: Replace checkpoint field in query based on server
    // Server 3001 uses cloud_updated_at, Server 10102 uses server_updated_at
    if (isSecondary) {
      // Replace server_updated_at with cloud_updated_at in checkpoint block
      modifiedQuery = modifiedQuery.replace(
        /checkpoint\s*\{[^}]*server_updated_at[^}]*\}/gs,
        (match) => {
          return match.replace(/server_updated_at/g, 'cloud_updated_at');
        },
      );
    } else {
      // Replace cloud_updated_at with server_updated_at in checkpoint block (if exists)
      modifiedQuery = modifiedQuery.replace(
        /checkpoint\s*\{[^}]*cloud_updated_at[^}]*\}/gs,
        (match) => {
          return match.replace(/cloud_updated_at/g, 'server_updated_at');
        },
      );
    }

    return modifiedQuery;
  }

  /**
   * Build checkpoint input for specific URL
   * Determines which checkpoint field to use based on server URL
   *
   * IMPORTANT:
   * - Server 3001 (secondary) uses ONLY: id + cloud_updated_at
   * - Server 10102 (primary) uses ONLY: id + server_updated_at
   *
   * Do NOT send both fields to either server!
   */
  static buildCheckpointInputForUrl(
    checkpoint: any,
    url?: string,
  ): { id: string; server_updated_at?: string; cloud_updated_at?: string } {
    const isSecondary = url?.includes(':3001') || false;

    if (isSecondary) {
      // Secondary server (3001) uses ONLY cloud_updated_at + id
      return {
        id: checkpoint?.id || '',
        cloud_updated_at: checkpoint?.cloud_updated_at || '0',
        // DO NOT include server_updated_at for secondary server
      };
    } else {
      // Primary server (10102) uses ONLY server_updated_at + id
      return {
        id: checkpoint?.id || '',
        server_updated_at: checkpoint?.server_updated_at || '0',
        // DO NOT include cloud_updated_at for primary server
      };
    }
  }

  /**
   * Create response modifier for URL-specific field normalization
   * Handles different response structures from primary vs secondary servers
   */
  static createResponseModifierForUrl(
    dataPaths: string[],
    url?: string,
  ): (response: any) => any {
    const isSecondary = url?.includes(':3001') || false;

    return (response: any) => {
      if (!response || !response.data) {
        return response;
      }

      // Navigate to the data path
      let data = response.data;
      for (const path of dataPaths) {
        if (data && typeof data === 'object' && path in data) {
          data = data[path];
        }
      }

      if (!Array.isArray(data)) {
        return response;
      }

      // Normalize documents based on server type
      data.forEach((doc: any) => {
        if (!doc || typeof doc !== 'object') {
          return;
        }

        // Ensure both timestamp fields exist
        if (isSecondary) {
          // Secondary server: prioritize cloud_updated_at
          if (!doc.cloud_updated_at && doc.server_updated_at) {
            doc.cloud_updated_at = doc.server_updated_at;
          }
        } else {
          // Primary server: prioritize server_updated_at
          if (!doc.server_updated_at && doc.cloud_updated_at) {
            doc.server_updated_at = doc.cloud_updated_at;
          }
        }

        // Ensure client timestamps exist
        if (!doc.client_created_at) {
          doc.client_created_at = Date.now().toString();
        }
        if (!doc.client_updated_at) {
          doc.client_updated_at = Date.now().toString();
        }

        // Map deleted field
        if (doc.deleted === undefined && doc._deleted !== undefined) {
          doc.deleted = doc._deleted;
        }
      });

      return response;
    };
  }
}
