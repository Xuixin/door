import { DeviceMonitoringDocument } from './schema';
import { CreateRxDocument, CreateRxCollection } from '../../core/types/utils';

/**
 * ORM methods for DeviceMonitoring collection
 */
export interface RxDeviceMonitoringMethods {
  findAll: () => Promise<RxDeviceMonitoringDocument[]>;
  findById: (id: string) => Promise<RxDeviceMonitoringDocument | null>;
  create: (
    deviceMonitoring: DeviceMonitoringDocument,
  ) => Promise<RxDeviceMonitoringDocument>;
  update: (
    deviceMonitoring: DeviceMonitoringDocument,
  ) => Promise<RxDeviceMonitoringDocument>;
  findByStatus: (status: string) => Promise<RxDeviceMonitoringDocument[]>;
  findByType: (type: string) => Promise<RxDeviceMonitoringDocument[]>;
}

export type RxDeviceMonitoringDocument = CreateRxDocument<
  DeviceMonitoringDocument,
  RxDeviceMonitoringMethods
>;

export type RxDeviceMonitoringCollection = CreateRxCollection<
  DeviceMonitoringDocument,
  RxDeviceMonitoringMethods
>;
