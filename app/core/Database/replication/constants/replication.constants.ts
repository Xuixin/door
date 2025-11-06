/**
 * Replication Constants
 * Contains all replication identifiers and mappings (data only, no logic)
 */

// All replication identifiers (6 total)
export const REPLICATION_IDENTIFIERS = [
  'txn-primary-10102',
  'txn-secondary-3001',
  'device_monitoring-primary-10102',
  'device_monitoring-secondary-3001',
  'device_monitoring_history-primary-10102',
  'device_monitoring_history-secondary-3001',
] as const;

// Primary replication identifiers (3)
export const PRIMARY_IDENTIFIERS = [
  'txn-primary-10102',
  'device_monitoring-primary-10102',
  'device_monitoring_history-primary-10102',
] as const;

// Secondary replication identifiers (3)
export const SECONDARY_IDENTIFIERS = [
  'txn-secondary-3001',
  'device_monitoring-secondary-3001',
  'device_monitoring_history-secondary-3001',
] as const;

// Collection name to replication identifiers mapping
export const COLLECTION_IDENTIFIER_MAP: Record<
  string,
  { primary: string; secondary: string }
> = {
  transaction: {
    primary: 'txn-primary-10102',
    secondary: 'txn-secondary-3001',
  },
  devicemonitoring: {
    primary: 'device_monitoring-primary-10102',
    secondary: 'device_monitoring-secondary-3001',
  },
  devicemonitoringhistory: {
    primary: 'device_monitoring_history-primary-10102',
    secondary: 'device_monitoring_history-secondary-3001',
  },
} as const;

// Reverse mapping: identifier to collection name
export const IDENTIFIER_COLLECTION_MAP: Record<string, string> = {
  'txn-primary-10102': 'transaction',
  'txn-secondary-3001': 'transaction',
  'device_monitoring-primary-10102': 'devicemonitoring',
  'device_monitoring-secondary-3001': 'devicemonitoring',
  'device_monitoring_history-primary-10102': 'devicemonitoringhistory',
  'device_monitoring_history-secondary-3001': 'devicemonitoringhistory',
} as const;

// Identifier to server type mapping
export const IDENTIFIER_SERVER_MAP: Record<string, 'primary' | 'secondary'> = {
  'txn-primary-10102': 'primary',
  'txn-secondary-3001': 'secondary',
  'device_monitoring-primary-10102': 'primary',
  'device_monitoring-secondary-3001': 'secondary',
  'device_monitoring_history-primary-10102': 'primary',
  'device_monitoring_history-secondary-3001': 'secondary',
} as const;

// Collection names
export const COLLECTION_NAMES = [
  'transaction',
  'devicemonitoring',
  'devicemonitoringhistory',
] as const;

// Collection name mapping (for facade services)
// Maps collection name to database collection key
export const COLLECTION_NAME_MAP: Record<string, string> = {
  transaction: 'transaction',
  devicemonitoring: 'devicemonitoring',
  devicemonitoringhistory: 'devicemonitoringhistory',
} as const;
