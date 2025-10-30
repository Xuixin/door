import { RxJsonSchema } from 'rxdb';

export type LogClientType = 'KIOSK' | 'DOOR';

export interface LogClientDocument {
  id: string; // uuid
  client_id: string; // device unique id
  type: LogClientType; // 'KIOSK' | 'DOOR'
  status: string; // ONLINE | OFFLINE | ...
  meta_data: string; // free-form message or JSON string
  server_created_at?: string | '';
  client_created_at: string; // Date.now().toString()
  diff_time_create?: number | '';
  server_updated_at?: string | '';
}

export const LOG_CLIENT_SCHEMA_LITERAL: RxJsonSchema<LogClientDocument> = {
  title: 'LogClient',
  description: 'Client-side lifecycle and connectivity log entries',
  version: 0,
  primaryKey: 'id',
  keyCompression: false,
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    client_id: { type: 'string', maxLength: 200 },
    type: { type: 'string', maxLength: 20 },
    status: { type: 'string', maxLength: 40 },
    meta_data: { type: 'string', maxLength: 4000 },
    server_created_at: { type: 'string', maxLength: 30 },
    client_created_at: { type: 'string', maxLength: 30 },
    diff_time_create: { type: ['number', 'string'] },
    server_updated_at: { type: 'string', maxLength: 30 },
  },
  required: [
    'id',
    'client_id',
    'type',
    'status',
    'meta_data',
    'client_created_at',
  ],
  indexes: ['client_created_at', 'client_id', 'status'],
};

export const LOG_CLIENT_SCHEMA = LOG_CLIENT_SCHEMA_LITERAL;
export type LogClientDocumentType = LogClientDocument;
