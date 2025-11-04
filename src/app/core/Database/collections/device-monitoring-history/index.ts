/**
 * DeviceMonitoringHistory Collection
 *
 * This module exports all components of the device-monitoring-history collection:
 * - Schema definitions
 * - RxDB types
 * - Facade service (DeviceMonitoringHistoryFacade)
 * - Replication service
 * - Query builders (GraphQL)
 */

// Schema
export * from './schema';

// Types
export * from './types';

// Services
export { DeviceMonitoringHistoryFacade } from './facade.service';
export { DeviceMonitoringHistoryReplicationService } from './replication.service';

// Query builders
export * from './query-builder';
