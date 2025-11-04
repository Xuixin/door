import { Injectable, Injector, Signal } from '@angular/core';
import {
  RxDatabase,
  RxCollection,
  RxJsonSchema,
  RxReactivityFactory,
  createRxDatabase,
} from 'rxdb';
import { toSignal } from '@angular/core/rxjs-interop';
import { untracked } from '@angular/core';
import {
  DBAdapter,
  CollectionAdapter,
  ReplicationAdapter,
  SchemaDefinition,
  DatabaseInfo,
} from '../../adapter';
import { BaseDocument } from '../../base/base-schema';
import { RxDBCollectionAdapter } from './rxdb-collection-adapter';
import { RxDBReplicationAdapter } from './rxdb-replication-adapter';
import { environment } from '../../../../../../environments/environment';
import { RxTxnsDatabase, RxTxnsCollections } from '../../types/database.types';

/**
 * RxDB implementation of DBAdapter
 * Wraps existing RxDB functionality to provide database-agnostic interface
 */
@Injectable()
export class RxDBAdapter implements DBAdapter {
  private db?: RxTxnsDatabase;
  private collections = new Map<string, RxDBCollectionAdapter<any>>();
  private replicationAdapter?: RxDBReplicationAdapter;
  private readyPromise?: Promise<void>;
  private readyResolve?: () => void;
  private isInitialized = false;

  constructor(private injector?: Injector) {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  /**
   * Generate database name from client ID and client type
   * Format: CLIENTTYPE-last5chars (uppercase clientType + last 5 chars of clientId)
   */
  static generateDatabaseName(clientId: string, clientType: string): string {
    const upperType = clientType.toUpperCase();
    const lastChars = clientId.length > 5 ? clientId.slice(-5) : clientId;
    return `${upperType}-${lastChars}`;
  }

  async initialize(
    schemas: SchemaDefinition[],
    databaseName?: string,
  ): Promise<void> {
    if (this.isInitialized) {
      console.warn('RxDBAdapter already initialized');
      return;
    }

    try {
      environment.addRxDBPlugins();

      // Use provided databaseName or fallback to environment default
      const dbName = databaseName || environment.databaseName || 'kiosk_db';
      console.log(`RxDBAdapter: creating database with name: ${dbName}`);

      const injector = this.injector;
      const reactivityFactory: RxReactivityFactory<Signal<any>> = {
        fromObservable(obs, initialValue: any) {
          if (!injector) {
            throw new Error('Injector required for reactivity');
          }
          return untracked(() =>
            toSignal(obs, {
              initialValue,
              injector: injector,
            }),
          );
        },
      };

      // Convert adapter schemas to RxDB format
      const rxdbSchemas = this.convertSchemasToRxDB(schemas);

      this.db = (await createRxDatabase<RxTxnsCollections>({
        name: dbName,
        storage: environment.getRxStorage(),
        multiInstance: environment.multiInstance || false,
        reactivity: reactivityFactory,
        cleanupPolicy: {
          minimumDeletedTime: 1000 * 60 * 5, // 5 minutes
          runEach: 1000 * 60 * 5, // 5 minutes
          waitForLeadership: true,
          awaitReplicationsInSync: true,
        },
      })) as RxTxnsDatabase;

      console.log('RxDBAdapter: database created');

      if (environment.multiInstance) {
        this.db.waitForLeadership().then(() => {
          console.log('RxDBAdapter: isLeader now');
          document.title = '♛ ' + document.title;
        });
      }

      console.log('RxDBAdapter: adding collections...');

      await this.db.addCollections(rxdbSchemas);

      // Initialize collection adapters
      for (const schema of schemas) {
        const collection = (this.db as any)[schema.name] as RxCollection;
        if (collection) {
          this.collections.set(
            schema.name,
            new RxDBCollectionAdapter(collection),
          );
        }
      }

      // Initialize replication adapter
      this.replicationAdapter = new RxDBReplicationAdapter(this.db);
      // Set database reference (in case it wasn't passed in constructor)
      this.replicationAdapter.setDatabase(this.db);

      this.isInitialized = true;
      if (this.readyResolve) {
        this.readyResolve();
      }

      console.log('RxDBAdapter: initialization complete');
    } catch (error) {
      console.error('RxDBAdapter initialization error:', error);
      throw error;
    }
  }

  getCollection<T extends BaseDocument>(
    collectionName: string,
  ): CollectionAdapter<T> {
    if (!this.isReady()) {
      throw new Error(
        'Database not ready. Call initialize() first or wait until ready.',
      );
    }

    const adapter = this.collections.get(collectionName);
    if (!adapter) {
      throw new Error(`Collection ${collectionName} not found`);
    }

    return adapter as CollectionAdapter<T>;
  }

  getReplication(): ReplicationAdapter {
    if (!this.replicationAdapter) {
      throw new Error(
        'Replication adapter not available. Database not initialized.',
      );
    }
    return this.replicationAdapter;
  }

  async close(): Promise<void> {
    if (this.db) {
      await (this.db as any).destroy();
      this.db = undefined;
      this.collections.clear();
      this.replicationAdapter = undefined;
      this.isInitialized = false;
    }
  }

  async getInfo(): Promise<DatabaseInfo> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return {
      name: this.db.name,
      adapter: 'rxdb',
      version: '16.20.0', // RxDB version - update as needed
      collections: Array.from(this.collections.keys()),
    };
  }

  isReady(): boolean {
    return this.isInitialized && !!this.db;
  }

  async waitUntilReady(timeout: number = 5000): Promise<void> {
    if (this.isReady()) {
      return;
    }

    return Promise.race([
      this.readyPromise || Promise.resolve(),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('Database initialization timeout')),
          timeout,
        ),
      ),
    ]);
  }

  /**
   * Get the underlying RxDB database instance
   * This is used for backward compatibility during migration
   */
  getRxDB(): RxTxnsDatabase {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Convert adapter SchemaDefinition to RxDB schema format
   */
  private convertSchemasToRxDB(
    schemas: SchemaDefinition[],
  ): Record<string, { schema: RxJsonSchema<any> }> {
    const rxdbSchemas: Record<string, { schema: RxJsonSchema<any> }> = {};

    for (const schema of schemas) {
      rxdbSchemas[schema.name] = {
        schema: {
          title: schema.title || schema.name,
          description: schema.description,
          version: schema.version,
          primaryKey: schema.primaryKey,
          type: 'object',
          properties: schema.properties,
          required: schema.required || [],
          keyCompression: false,
        } as RxJsonSchema<any>,
      };
    }

    return rxdbSchemas;
  }
}
