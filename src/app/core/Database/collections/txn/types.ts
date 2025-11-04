import { RxTxnDocumentType } from './schema';
import { CreateRxDocument, CreateRxCollection } from '../../core/types/utils';

/**
 * ORM methods for Transaction collection
 */
export interface RxTxnMethods {
  findAll: () => Promise<RxTxnDocument[]>;
  findById: (id: string) => Promise<RxTxnDocument | null>;
  create: (txn: RxTxnDocumentType) => Promise<RxTxnDocument>;
  update: (txn: RxTxnDocumentType) => Promise<RxTxnDocument>;
}

export type RxTxnDocument = CreateRxDocument<RxTxnDocumentType, RxTxnMethods>;
export type RxTxnCollection = CreateRxCollection<
  RxTxnDocumentType,
  RxTxnMethods
>;
