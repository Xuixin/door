/**
 * RxDB Adapter Implementation
 *
 * Provides RxDB-specific implementation of the database adapter interfaces.
 * This adapter wraps existing RxDB functionality to work with the abstraction layer.
 */

export { RxDBAdapter } from './rxdb-adapter';
export { RxDBCollectionAdapter } from './rxdb-collection-adapter';
export { RxDBReplicationAdapter } from './rxdb-replication-adapter';

// Export RxDB types (now organized in types/ folder)
export * from './types';

// Export RxDB helpers
export {
  DATABASE_NAME,
  getAdapterSchemas,
  collectionsSettings,
  setupDebugRxDB,
  _createRxDBDatabase,
} from './rxdb-helpers';

