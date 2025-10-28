import type { RxDocument, RxCollection, RxDatabase } from 'rxdb';
import { RxTxnDocumentType, HandshakeDocument } from '../schema';
import { Signal } from '@angular/core';

// orm method for txn
type RxTxnMethods = {
  findAll: () => Promise<RxTxnDocument[]>;
  findById: (id: string) => Promise<RxTxnDocument | null>;
  create: (txn: RxTxnDocumentType) => Promise<RxTxnDocument>;
  update: (txn: RxTxnDocumentType) => Promise<RxTxnDocument>;
};

// orm method for handshake
type RxHandshakeMethods = {
  findAll: () => Promise<RxHandshakeDocument[]>;
  findById: (id: string) => Promise<RxHandshakeDocument | null>;
  findByTxnId: (txn_id: string) => Promise<RxHandshakeDocument[]>;
  create: (handshake: HandshakeDocument) => Promise<RxHandshakeDocument>;
  update: (handshake: HandshakeDocument) => Promise<RxHandshakeDocument>;
};

export type RxTxnDocument = RxDocument<RxTxnDocumentType, RxTxnMethods>;
export type RxTxnCollection = RxCollection<
  RxTxnDocumentType,
  RxTxnMethods,
  unknown,
  unknown,
  Signal<unknown>
>;

export type RxHandshakeDocument = RxDocument<
  HandshakeDocument,
  RxHandshakeMethods
>;
export type RxHandshakeCollection = RxCollection<
  HandshakeDocument,
  RxHandshakeMethods,
  unknown,
  unknown,
  Signal<unknown>
>;

export type RxTxnsCollections = {
  txn: RxTxnCollection;
  handshake: RxHandshakeCollection;
};
export type RxTxnsDatabase = RxDatabase<
  RxTxnsCollections,
  unknown,
  unknown,
  Signal<unknown>
>;
