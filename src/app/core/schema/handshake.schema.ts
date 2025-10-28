import { RxJsonSchema } from 'rxdb';
import { createSchema } from './base-schema';

export type EVENT_TYPE =
  | 'CREATE'
  | 'UPDATE'
  | 'RECEIVE'
  | 'SUCCESS'
  | 'FAILED'
  | 'CLOSED';

export interface HandshakeEvent {
  type: EVENT_TYPE;
  at: string; // Date.now() 13 digits
  reason?: string;
  actor: string; // 'KIOSK-id', 'SERVER', 'DOOR-id', etc.
  status?: 'SUCCESS' | 'FAILED';
}

export interface HandshakeState {
  server: boolean;
  door: boolean;
  cloud?: boolean;
}

export interface HandshakeDocument {
  id: string;
  txn_id: string;
  state: HandshakeState;
  events: HandshakeEvent[];
  client_created_at: string;
  client_updated_at: string;
  server_created_at?: string;
  server_updated_at?: string;
}

export const HANDSHAKE_SCHEMA_LITERAL: RxJsonSchema<HandshakeDocument> = {
  title: 'Handshake',
  description: 'Handshake schema for tracking transaction events',
  version: 0,
  primaryKey: 'id',
  keyCompression: false,
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    txn_id: { type: 'string', maxLength: 100 },
    state: {
      type: 'object',
      properties: {
        server: { type: 'boolean' },
        door: { type: 'boolean' },
        cloud: { type: 'boolean' },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', maxLength: 20 },
          at: { type: 'string', maxLength: 20 },
          reason: { type: 'string', maxLength: 200 },
          actor: { type: 'string', maxLength: 50 },
          status: { type: 'string', maxLength: 20 },
        },
        required: ['type', 'at', 'actor'],
      },
    },
    client_created_at: { type: 'string', maxLength: 20 },
    client_updated_at: { type: 'string', maxLength: 20 },
    server_created_at: { type: 'string', maxLength: 20 },
    server_updated_at: { type: 'string', maxLength: 20 },
  },
  required: ['id', 'txn_id', 'state', 'events', 'client_created_at'],
};

export const HANDSHAKE_SCHEMA = HANDSHAKE_SCHEMA_LITERAL;
export type HandshakeDocumentType = HandshakeDocument;
