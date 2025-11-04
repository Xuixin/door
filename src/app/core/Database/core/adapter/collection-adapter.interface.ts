import { BaseDocument } from './../base/base-schema';
import { Observable } from 'rxjs';
import { QuerySelector, QueryRequest, QueryResult } from '.';

/**
 * Collection-level operations abstraction
 * Provides database-agnostic CRUD and query operations
 */
export interface CollectionAdapter<T extends BaseDocument> {
  /**
   * Find documents matching selector
   * Returns a Promise that resolves to an array of documents
   */
  find(selector?: QuerySelector<T>): Promise<T[]>;

  /**
   * Find a single document by ID or selector
   */
  findOne(idOrSelector: string | QuerySelector<T>): Promise<T | null>;

  /**
   * Insert a new document
   * Automatically sets client_created_at and client_updated_at if not provided
   */
  insert(document: Partial<T>): Promise<T>;

  /**
   * Update a document by ID
   * Automatically updates client_updated_at
   */
  update(id: string, updates: Partial<T>): Promise<T>;

  /**
   * Delete a document by ID (soft or hard delete)
   * @param id - Document ID to delete
   * @param hard - If true, permanently removes from database. If false, sets deleted flag (default: false)
   */
  delete(id: string, hard?: boolean): Promise<boolean>;

  /**
   * Subscribe to query results (reactive)
   * Returns an Observable that emits arrays of documents whenever they change
   */
  find$(selector?: QuerySelector<T>): Observable<T[]>;

  /**
   * Subscribe to a single document (reactive)
   * Returns an Observable that emits the document whenever it changes
   */
  findOne$(idOrSelector: string | QuerySelector<T>): Observable<T | null>;

  /**
   * Execute a raw query (backend-specific)
   * Allows advanced querying capabilities specific to the backend
   */
  query(request: QueryRequest<T>): Promise<QueryResult<T>>;
}
