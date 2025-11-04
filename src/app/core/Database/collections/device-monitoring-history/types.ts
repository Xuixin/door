import { DeviceMonitoringHistoryDocument } from './schema';
import { CreateRxDocument, CreateRxCollection } from '../../core/types/utils';

/**
 * ORM methods for DeviceMonitoringHistory collection
 */
export interface RxDeviceMonitoringHistoryMethods {
  findAll: () => Promise<RxDeviceMonitoringHistoryDocument[]>;
  findById: (id: string) => Promise<RxDeviceMonitoringHistoryDocument | null>;
  create: (
    deviceMonitoringHistory: DeviceMonitoringHistoryDocument,
  ) => Promise<RxDeviceMonitoringHistoryDocument>;
  findByCreatedBy: (
    createdBy: string,
  ) => Promise<RxDeviceMonitoringHistoryDocument[]>;
  findByType: (type: string) => Promise<RxDeviceMonitoringHistoryDocument[]>;
  findByStatus: (
    status: string,
  ) => Promise<RxDeviceMonitoringHistoryDocument[]>;
}

export type RxDeviceMonitoringHistoryDocument = CreateRxDocument<
  DeviceMonitoringHistoryDocument,
  RxDeviceMonitoringHistoryMethods
>;

export type RxDeviceMonitoringHistoryCollection = CreateRxCollection<
  DeviceMonitoringHistoryDocument,
  RxDeviceMonitoringHistoryMethods
>;
