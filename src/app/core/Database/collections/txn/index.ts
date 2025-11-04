/**
 * Transaction Collection
 *
 * This module exports all components of the transaction collection:
 * - Schema definitions
 * - RxDB types
 * - Facade service (TransactionService)
 * - Replication service
 * - Query builders (GraphQL)
 */

// Schema
export * from './schema';

// Types
export * from './types';

// Services
export { TransactionService } from './facade.service';
export { TransactionReplicationService } from './replication.service';

// Query builders
export * from './query-builder';
