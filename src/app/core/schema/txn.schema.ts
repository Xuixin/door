import {
  RxJsonSchema,
  toTypedRxJsonSchema,
  ExtractDocumentTypeFromTypedRxJsonSchema,
} from 'rxdb';

export const TXN_SCHEMA_LITERAL = {
  title: 'Txn',
  description: 'Txn schema',
  version: 0,
  primaryKey: 'id',
  keyCompression: false,
  type: 'object',
  properties: {
    id: { type: 'string', primary: true, maxLength: 100 },
    name: { type: 'string', maxLength: 200 },
    id_card_base64: { type: 'string', maxLength: 1000000 },
    student_number: { type: 'string', maxLength: 50 },
    register_type: { type: 'string', maxLength: 20 },
    door_permission: {
      type: 'array',
      items: { type: 'string', maxLength: 10 },
    },
    status: { type: 'string', maxLength: 20 },
    client_created_at: { type: 'string', maxLength: 20 }, // string format unix 13 digits
    client_updated_at: { type: 'string', maxLength: 20 },
    server_created_at: { type: 'string', maxLength: 20 },
    server_updated_at: { type: 'string', maxLength: 20 },
    diff_time_create: { type: 'string', maxLength: 20 },
    diff_time_update: { type: 'string', maxLength: 20 },
  },

  required: [
    'id',
    'name',
    'id_card_base64',
    'student_number',
    'register_type',
    'door_permission',
    'status',
    'client_created_at',
    'diff_time_create',
    'diff_time_update',
  ],
};
export const txnSchema = toTypedRxJsonSchema(TXN_SCHEMA_LITERAL);

export type RxTxnDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
  typeof txnSchema
>;
export const TXN_SCHEMA: RxJsonSchema<RxTxnDocumentType> = TXN_SCHEMA_LITERAL;
