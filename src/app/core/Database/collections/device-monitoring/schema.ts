import {
  RxJsonSchema,
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from 'rxdb';
import { SchemaDefinition } from '../../core/adapter';
import { convertRxDBSchemaToAdapter } from '../../core/utils/schema-converter';

export interface DeviceMonitoringDocument {
  id: string;
  name: string;
  type: string;
  status: string;
  meta_data: string;
  created_by: string;
  server_created_at: string;
  cloud_created_at: string;
  client_created_at: string;
  server_updated_at: string;
  cloud_updated_at: string;
  client_updated_at: string;
  diff_time_create: string;
  diff_time_update: string;
  // Note: deleted field not included - uses RxDB _deleted instead
}

export const DEVICE_MONITORING_SCHEMA_LITERAL: RxJsonSchema<DeviceMonitoringDocument> =
  {
    title: 'DeviceMonitoring',
    description:
      'Device monitoring schema for tracking device status and metadata',
    version: 0,
    primaryKey: 'id',
    keyCompression: false,
    type: 'object',
    properties: {
      id: { type: 'string', maxLength: 100 },
      name: { type: 'string', maxLength: 200 },
      type: { type: 'string', maxLength: 50 },
      status: { type: 'string', maxLength: 50 },
      meta_data: { type: 'string', maxLength: 4000 },
      created_by: { type: 'string', maxLength: 100 },
      server_created_at: { type: 'string', maxLength: 30 },
      cloud_created_at: { type: 'string', maxLength: 30 },
      client_created_at: { type: 'string', maxLength: 30 },
      server_updated_at: { type: 'string', maxLength: 30 },
      cloud_updated_at: { type: 'string', maxLength: 30 },
      client_updated_at: { type: 'string', maxLength: 30 },
      diff_time_create: { type: 'string', maxLength: 30 },
      diff_time_update: { type: 'string', maxLength: 30 },
    },
    required: [
      'id',
      'name',
      'type',
      'status',
      'meta_data',
      'created_by',
      'client_created_at',
      'diff_time_create',
      'diff_time_update',
    ],
    indexes: ['client_created_at', 'status', 'type'],
  };

export const deviceMonitoringSchema = toTypedRxJsonSchema(
  DEVICE_MONITORING_SCHEMA_LITERAL,
);

export type RxDeviceMonitoringDocumentType =
  ExtractDocumentTypeFromTypedRxJsonSchema<typeof deviceMonitoringSchema>;

export const DEVICE_MONITORING_SCHEMA: RxJsonSchema<RxDeviceMonitoringDocumentType> =
  DEVICE_MONITORING_SCHEMA_LITERAL;

// Export adapter-compatible schema
export const DEVICE_MONITORING_SCHEMA_ADAPTER: SchemaDefinition =
  convertRxDBSchemaToAdapter(
    'device_monitoring',
    DEVICE_MONITORING_SCHEMA as any,
  );
