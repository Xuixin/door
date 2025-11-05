/**
 * Replication Constants
 * Centralized constants for replication identifiers and mappings
 */

export const REPLICATION_IDENTIFIERS = [
  'txn-primary-10102',
  'txn-secondary-3001',
  'device_monitoring-primary-10102',
  'device_monitoring-secondary-3001',
  'device_monitoring_history-primary-10102',
  'device_monitoring_history-secondary-3001',
] as const;

export const PRIMARY_IDENTIFIERS = [
  'txn-primary-10102',
  'device_monitoring-primary-10102',
  'device_monitoring_history-primary-10102',
] as const;

export const SECONDARY_IDENTIFIERS = [
  'txn-secondary-3001',
  'device_monitoring-secondary-3001',
  'device_monitoring_history-secondary-3001',
] as const;

/**
 * Map collection names to their primary and secondary identifiers
 */
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
};

/**
 * Reverse map: identifier → collection name
 */
export const IDENTIFIER_COLLECTION_MAP: Record<string, string> = {
  'txn-primary-10102': 'transaction',
  'txn-secondary-3001': 'transaction',
  'device_monitoring-primary-10102': 'devicemonitoring',
  'device_monitoring-secondary-3001': 'devicemonitoring',
  'device_monitoring_history-primary-10102': 'devicemonitoringhistory',
  'device_monitoring_history-secondary-3001': 'devicemonitoringhistory',
};

/**
 * Map identifier → server type
 */
export const IDENTIFIER_SERVER_MAP: Record<string, 'primary' | 'secondary'> = {
  'txn-primary-10102': 'primary',
  'txn-secondary-3001': 'secondary',
  'device_monitoring-primary-10102': 'primary',
  'device_monitoring-secondary-3001': 'secondary',
  'device_monitoring_history-primary-10102': 'primary',
  'device_monitoring_history-secondary-3001': 'secondary',
};

/**
 * Collection name mapping for display/usage
 */
export const COLLECTION_NAMES = {
  TRANSACTION: 'transaction',
  DEVICE_MONITORING: 'devicemonitoring',
  DEVICE_MONITORING_HISTORY: 'devicemonitoringhistory',
} as const;
