import { RxJsonSchema } from 'rxdb';
import { SchemaDefinition } from '../adapter';


/**
 * Convert RxDB schema to adapter SchemaDefinition format
 */
export function convertRxDBSchemaToAdapter(
  name: string,
  rxdbSchema: RxJsonSchema<any>,
): SchemaDefinition {
  // Handle primaryKey which can be string or CompositePrimaryKey
  const primaryKey =
    typeof rxdbSchema.primaryKey === 'string'
      ? rxdbSchema.primaryKey
      : (rxdbSchema.primaryKey as any).key || 'id';

  // Handle required which might be readonly
  const required = Array.isArray(rxdbSchema.required)
    ? [...rxdbSchema.required]
    : [];

  return {
    name,
    title: rxdbSchema.title || name,
    description: rxdbSchema.description,
    version: rxdbSchema.version || 0,
    primaryKey,
    properties: rxdbSchema.properties || {},
    required,
    indexes: (rxdbSchema as any).indexes,
  };
}

/**
 * Convert adapter SchemaDefinition to RxDB format
 */
export function convertAdapterSchemaToRxDB(
  schema: SchemaDefinition,
): RxJsonSchema<any> {
  return {
    title: schema.title || schema.name,
    description: schema.description,
    version: schema.version,
    primaryKey: schema.primaryKey,
    type: 'object',
    properties: schema.properties,
    required: schema.required || [],
    keyCompression: false,
    indexes: schema.indexes,
  } as RxJsonSchema<any>;
}
