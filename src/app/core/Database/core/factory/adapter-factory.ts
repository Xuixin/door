import { Injector } from '@angular/core';
import { DBAdapter } from '../adapter';
import { RxDBAdapter } from '../adapters/rxdb';

/**
 * Supported adapter types
 */
export type AdapterType = 'rxdb' | 'pouchdb' | 'watermelon' | 'server';

/**
 * Adapter configuration
 */
export interface AdapterConfig {
  type: AdapterType;
  options?: Record<string, any>;
}

/**
 * Factory for creating database adapters
 * Creates the appropriate adapter based on configuration
 */
export class AdapterFactory {
  /**
   * Create a database adapter based on configuration
   * @param config - Adapter configuration
   * @param injector - Angular injector (required for RxDB)
   * @returns Promise that resolves to initialized adapter
   */
  static async create(
    config: AdapterConfig,
    injector?: Injector,
  ): Promise<DBAdapter> {
    let adapter: DBAdapter;

    switch (config.type) {
      case 'rxdb':
        adapter = new RxDBAdapter(injector);
        break;
      case 'pouchdb':
        // Future: PouchDB adapter
        throw new Error('PouchDB adapter not yet implemented');
      case 'watermelon':
        // Future: WatermelonDB adapter
        throw new Error('WatermelonDB adapter not yet implemented');
      case 'server':
        // Future: Server sync adapter
        throw new Error('Server sync adapter not yet implemented');
      default:
        throw new Error(`Unknown adapter type: ${config.type}`);
    }

    return adapter;
  }

  /**
   * Get default adapter configuration
   * @returns Default adapter config (RxDB)
   */
  static getDefaultConfig(): AdapterConfig {
    return {
      type: 'rxdb',
    };
  }
}
