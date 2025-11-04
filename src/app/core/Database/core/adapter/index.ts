/**
 * Database Adapter Interfaces
 *
 * This module exports all adapter interfaces and types needed for
 * database-agnostic operations. All database backends must implement
 * these interfaces to work with the abstraction layer.
 */

// Core interfaces
export { DBAdapter } from './db-adapter.interface';
export { CollectionAdapter } from './collection-adapter.interface';
export { ReplicationAdapter } from './replication-adapter.interface';

// Types
export {
  QuerySelector,
  QueryRequest,
  QueryResult,
  DatabaseInfo,
  SchemaDefinition,
  IndexDefinition,
} from './query.types';

export {
  ReplicationConfig,
  ReplicationStatus,
  ReplicationState,
  ReplicationEvent,
} from './replication-adapter.interface';

// Re-export BaseDocument for convenience
// export { BaseDocument } from '../base/base-document.interface';
