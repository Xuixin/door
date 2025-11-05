import {
  RxJsonSchema,
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from 'rxdb';

export interface DeviceEventDocument {
  id: string;
  transaction_id: string;
  device_id: string;
  sent_to?: string; // nullable
  cloud_created_at?: string | null;
  cloud_updated_at?: string | null;
  server_created_at?: string | null;
  server_updated_at?: string | null;
  client_created_at?: string | null;
  client_updated_at?: string | null;
}

// deleted use _deleted field rxdb automatically

export const DEVICE_EVENT_SCHEMA_LITERAL: RxJsonSchema<DeviceEventDocument> = {
  title: 'DeviceEvent',
  description: 'Schema for tracking device events and sync timestamps',
  version: 0,
  primaryKey: 'id',
  keyCompression: false,
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    transaction_id: { type: 'string', maxLength: 100 },
    device_id: { type: 'string', maxLength: 100 },
    sent_to: { type: 'string', maxLength: 200 },
    cloud_created_at: { type: 'string', maxLength: 30 },
    cloud_updated_at: { type: 'string', maxLength: 30 },
    server_created_at: { type: 'string', maxLength: 30 },
    server_updated_at: { type: 'string', maxLength: 30 },
    client_created_at: { type: 'string', maxLength: 30 },
    client_updated_at: { type: 'string', maxLength: 30 },
  },
  required: ['id', 'transaction_id', 'device_id', 'client_created_at'],
  // Note: cloud_created_at removed from indexes because Dexie.js doesn't support
  // non-required indexed fields. Only required or always-present fields can be indexed.
  indexes: ['transaction_id', 'device_id'],
};

export const deviceEventSchema = toTypedRxJsonSchema(
  DEVICE_EVENT_SCHEMA_LITERAL,
);

export type RxDeviceEventDocumentType =
  ExtractDocumentTypeFromTypedRxJsonSchema<typeof deviceEventSchema>;

export const DEVICE_EVENT_SCHEMA: RxJsonSchema<RxDeviceEventDocumentType> =
  DEVICE_EVENT_SCHEMA_LITERAL;
