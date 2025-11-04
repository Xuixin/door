import { RxCollection, RxDocument, RxQuery } from 'rxdb';
import { Observable } from 'rxjs';
import { map, startWith } from 'rxjs/operators';
import {
  CollectionAdapter,
  QuerySelector,
  QueryRequest,
  QueryResult,
} from '../../adapter';
import { BaseDocument } from '../../base/base-schema';

/**
 * RxDB implementation of CollectionAdapter
 * Wraps RxDB collection operations to match the adapter interface
 */
export class RxDBCollectionAdapter<T extends BaseDocument>
  implements CollectionAdapter<T>
{
  constructor(private collection: RxCollection<T>) {}

  async find(selector?: QuerySelector<T>): Promise<T[]> {
    try {
      const query = this.collection.find(this.convertSelector(selector));
      const docs = await query.exec();
      return docs.map((doc) => this.toPlainDocument(doc));
    } catch (error) {
      console.error('RxDBCollectionAdapter.find error:', error);
      throw error;
    }
  }

  async findOne(idOrSelector: string | QuerySelector<T>): Promise<T | null> {
    try {
      let doc: RxDocument<T> | null;
      if (typeof idOrSelector === 'string') {
        doc = await this.collection.findOne(idOrSelector).exec();
      } else {
        doc = await this.collection
          .findOne(this.convertSelector(idOrSelector))
          .exec();
      }
      return doc ? this.toPlainDocument(doc) : null;
    } catch (error) {
      console.error('RxDBCollectionAdapter.findOne error:', error);
      throw error;
    }
  }

  async insert(document: Partial<T>): Promise<T> {
    try {
      const now = Date.now().toString();
      const docToInsert = {
        ...document,
        client_created_at: document.client_created_at || now,
        client_updated_at: document.client_updated_at || now,
      } as T;

      const doc = await this.collection.insert(docToInsert);
      return this.toPlainDocument(doc);
    } catch (error) {
      console.error('RxDBCollectionAdapter.insert error:', error);
      throw error;
    }
  }

  async update(id: string, updates: Partial<T>): Promise<T> {
    try {
      const doc = await this.collection.findOne(id).exec();
      if (!doc) {
        throw new Error(`Document with id ${id} not found`);
      }

      const now = Date.now().toString();
      const updatesWithTimestamp = {
        ...updates,
        client_updated_at: now,
      };

      await (doc as any).update({ $set: updatesWithTimestamp } as any);
      return this.toPlainDocument(doc);
    } catch (error) {
      console.error('RxDBCollectionAdapter.update error:', error);
      throw error;
    }
  }

  async delete(id: string, hard: boolean = false): Promise<boolean> {
    try {
      const doc = await this.collection.findOne(id).exec();
      if (!doc) {
        return false;
      }

      if (hard) {
        await (doc as any).remove();
      } else {
        await (doc as any).update({
          $set: { deleted: true, client_updated_at: Date.now().toString() },
        } as any);
      }
      return true;
    } catch (error) {
      console.error('RxDBCollectionAdapter.delete error:', error);
      throw error;
    }
  }

  find$(selector?: QuerySelector<T>): Observable<T[]> {
    try {
      const query = this.collection.find(this.convertSelector(selector));
      return query.$.pipe(
        map((docs) => docs.map((doc) => this.toPlainDocument(doc))),
        startWith([]),
      );
    } catch (error) {
      console.error('RxDBCollectionAdapter.find$ error:', error);
      throw error;
    }
  }

  findOne$(idOrSelector: string | QuerySelector<T>): Observable<T | null> {
    try {
      // RxDB doesn't have findOne$ directly, so we create it from find$
      // We'll watch the collection and filter for the specific document
      const selector =
        typeof idOrSelector === 'string'
          ? ({ id: idOrSelector } as QuerySelector<T>)
          : idOrSelector;

      return this.collection.find(this.convertSelector(selector)).$.pipe(
        map((docs): T | null => {
          const doc = docs.length > 0 ? docs[0] : null;
          return doc ? this.toPlainDocument(doc) : null;
        }),
        startWith(null as T | null),
      );
    } catch (error) {
      console.error('RxDBCollectionAdapter.findOne$ error:', error);
      throw error;
    }
  }

  async query(request: QueryRequest<T>): Promise<QueryResult<T>> {
    try {
      let query = this.collection.find(this.convertSelector(request.selector));

      // Apply sorting
      // RxDB sort syntax: collection.find().sort({ field: 'desc' }) or { field: 'asc' }
      if (request.sort && request.sort.length > 0) {
        const firstSort = request.sort[0];
        const sortOptions: any = {};
        sortOptions[firstSort.field] =
          firstSort.direction === 'desc' ? 'desc' : 'asc';
        query = (query as any).sort(sortOptions) as any;
      }

      // Apply limit
      if (request.limit !== undefined) {
        query = query.limit(request.limit);
      }

      // Apply skip
      if (request.skip !== undefined) {
        query = query.skip(request.skip);
      }

      const docs = await query.exec();
      const plainDocs = docs.map((doc) => this.toPlainDocument(doc));

      // Apply field projection if specified
      let resultDocs = plainDocs;
      if (request.fields && request.fields.length > 0) {
        resultDocs = plainDocs.map((doc: T) => {
          const projected: any = {};
          request.fields!.forEach((field) => {
            projected[field as string] = (doc as any)[field];
          });
          return projected as T;
        });
      }

      return {
        documents: resultDocs,
        count: resultDocs.length,
        hasMore: request.limit ? resultDocs.length === request.limit : false,
      };
    } catch (error) {
      console.error('RxDBCollectionAdapter.query error:', error);
      throw error;
    }
  }

  /**
   * Convert adapter QuerySelector to RxDB selector format
   */
  private convertSelector(selector?: QuerySelector<T>): any {
    if (!selector) {
      return {};
    }

    // RxDB uses similar format, but we need to handle special cases
    const rxdbSelector: any = {};
    const selectorAny = selector as any;

    for (const key in selectorAny) {
      if (key === '$and' || key === '$or' || key === '$nor' || key === '$not') {
        // RxDB supports these operators directly
        rxdbSelector[key] = selectorAny[key];
      } else if (
        typeof selectorAny[key] === 'object' &&
        selectorAny[key] !== null
      ) {
        // Handle operator objects like { $eq: value, $in: [...] }
        const ops = selectorAny[key] as any;
        if (ops.$eq !== undefined) {
          rxdbSelector[key] = ops.$eq;
        } else if (ops.$ne !== undefined) {
          rxdbSelector[key] = { $ne: ops.$ne };
        } else if (ops.$in !== undefined) {
          rxdbSelector[key] = { $in: ops.$in };
        } else if (ops.$nin !== undefined) {
          rxdbSelector[key] = { $nin: ops.$nin };
        } else if (
          ops.$gt !== undefined ||
          ops.$gte !== undefined ||
          ops.$lt !== undefined ||
          ops.$lte !== undefined
        ) {
          rxdbSelector[key] = {};
          if (ops.$gt !== undefined) rxdbSelector[key].$gt = ops.$gt;
          if (ops.$gte !== undefined) rxdbSelector[key].$gte = ops.$gte;
          if (ops.$lt !== undefined) rxdbSelector[key].$lt = ops.$lt;
          if (ops.$lte !== undefined) rxdbSelector[key].$lte = ops.$lte;
        } else {
          // Direct object value
          rxdbSelector[key] = selectorAny[key];
        }
      } else {
        // Direct value equality
        rxdbSelector[key] = selectorAny[key];
      }
    }

    return rxdbSelector;
  }

  /**
   * Convert RxDB document to plain object
   */
  private toPlainDocument(doc: RxDocument<T>): T {
    return doc.toJSON() as T;
  }
}
