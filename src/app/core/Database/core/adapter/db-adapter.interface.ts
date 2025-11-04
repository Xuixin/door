import { BaseDocument } from './../base/base-schema';
import { CollectionAdapter } from './collection-adapter.interface';
import { ReplicationAdapter } from '.';
import { SchemaDefinition, DatabaseInfo } from '.';

/**
 * Core database adapter interface providing database-agnostic operations.
 * All database backends (RxDB, PouchDB, WatermelonDB, etc.) must implement this interface.
 */
export interface DBAdapter {
  /**
   * Initialize the database with schemas
   * @param schemas - Array of schema definitions for collections
   * @param databaseName - Optional database name (if not provided, uses default from environment)
   */
  initialize(schemas: SchemaDefinition[], databaseName?: string): Promise<void>;

  /**
   * Get a collection adapter for database operations
   * @param collectionName - Name of the collection
   * @returns CollectionAdapter instance for performing operations on the collection
   * @throws Error if collection doesn't exist
   */
  getCollection<T extends BaseDocument>(
    collectionName: string,
  ): CollectionAdapter<T>;

  /**
   * Get replication adapter for sync operations
   * @returns ReplicationAdapter instance
   */
  getReplication(): ReplicationAdapter;

  /**
   * Close the database connection
   * Cleanup resources and close all connections
   */
  close(): Promise<void>;

  /**
   * Get database info/status
   * @returns Database information including name, adapter type, version, and collections
   */
  getInfo(): Promise<DatabaseInfo>;

  /**
   * Check if database is ready
   * @returns true if database is initialized and ready for operations
   */
  isReady(): boolean;

  /**
   * Wait for database to be ready
   * Useful for ensuring database is initialized before operations
   * @param timeout - Maximum time to wait in milliseconds (default: 5000)
   * @returns Promise that resolves when database is ready
   * @throws Error if database doesn't become ready within timeout
   */
  waitUntilReady(timeout?: number): Promise<void>;
}
