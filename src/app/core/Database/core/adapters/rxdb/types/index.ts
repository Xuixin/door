/**
 * RxDB Type Definitions
 *
 * This module exports all RxDB types for backward compatibility.
 * NOTE: Collection types are now in collections/{table}/types.ts
 * Query builders are now in collections/{table}/query-builder.ts
 *
 * This file maintains backward compatibility by re-exporting from new locations.
 */

// Export utility types
export * from './utils';

// Re-export collection types from new locations (for backward compatibility)
// export * from '../../../collections/txn/types';
// export * from '../../../collections/device-monitoring/types';
// export * from '../../../collections/device-monitoring-history/types';

// Export database types from core/types

// } from '../../types/database.types';

// Re-export query builders from new locations (for backward compatibility)
// export * from '../../../collections/txn/query-builder';
// export * from '../../../collections/device-monitoring/query-builder';
// export * from '../../../collections/device-monitoring-history/query-builder';
