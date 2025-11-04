import { CreateRxDatabase } from './utils';
import { RxTxnCollection } from '../../collections/txn/types';
import { RxDeviceMonitoringCollection } from '../../collections/device-monitoring/types';
import { RxDeviceMonitoringHistoryCollection } from '../../collections/device-monitoring-history/types';

/**
 * All collections in the database
 * To add a new collection:
 * 1. Create a folder in collections/{table-name}/
 * 2. Create types.ts in that folder
 * 3. Import the collection type here
 * 4. Add it to RxTxnsCollections interface
 */
export interface RxTxnsCollections {
  txn: RxTxnCollection;
  device_monitoring: RxDeviceMonitoringCollection;
  device_monitoring_history: RxDeviceMonitoringHistoryCollection;
  [key: string]: any; // Index signature for compatibility
}

/**
 * Main database type
 */
export type RxTxnsDatabase = CreateRxDatabase<RxTxnsCollections>;
