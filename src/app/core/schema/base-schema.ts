import {
  RxJsonSchema,
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from 'rxdb';

export interface BaseDocument {
  id: string;
  client_created_at: string;
  client_updated_at: string;
  server_created_at?: string;
  server_updated_at?: string;
  deleted?: boolean;
}

export interface SchemaConfig {
  title: string;
  description?: string;
  version: number;
  primaryKey: string;
  properties: Record<string, any>;
  required?: string[];
}

export function createSchema<T extends BaseDocument>(config: SchemaConfig) {
  return toTypedRxJsonSchema({
    ...config,
    keyCompression: false,
    type: 'object',
  } as any);
}

export type ExtractDocumentType<T> =
  ExtractDocumentTypeFromTypedRxJsonSchema<T>;
