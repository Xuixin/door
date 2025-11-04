// Core base classes
export * from './base/base-facade.service';
export * from './base/base-replication.service';

// Configuration
export * from './config/replication-config-builder';
export * from './config/collection-registry';

// Services
export * from './services/database.service';
export * from './services/network-status.service';

// Adapters
export * from './adapter';
// Note: adapters exports types separately, avoid duplicate exports
export {
  RxDBAdapter,
  RxDBCollectionAdapter,
  RxDBReplicationAdapter,
  getAdapterSchemas,
  setupDebugRxDB,
} from './adapters/rxdb';

// Factory
export * from './factory';

// Types - export specific items to avoid conflicts
export type {
  CreateRxDocument,
  CreateRxCollection,
  CreateRxDatabase,
} from './types/utils';
export type { RxTxnsCollections, RxTxnsDatabase } from './types/database.types';
export {
  BaseQueryBuilder,
  type QueryBuilderConfig,
} from './utils/base-query-builder';

// Schema utilities
export {
  BaseDocument,
  type SchemaConfig,
  createSchema,
  type ExtractDocumentType,
} from './base/base-schema';
export * from './utils/schema-converter';
