import { BaseDocument } from "./../base/base-schema";


/**
 * Query selector type (simplified MongoDB-style)
 * Supports equality, comparison, and logical operators
 */
export type QuerySelector<T> = {
  [K in keyof T]?:
    | T[K]
    | {
        $eq?: T[K];
        $ne?: T[K];
        $in?: T[K][];
        $nin?: T[K][];
        $gt?: T[K];
        $gte?: T[K];
        $lt?: T[K];
        $lte?: T[K];
        $exists?: boolean;
        $regex?: string;
      };
} & {
  $and?: QuerySelector<T>[];
  $or?: QuerySelector<T>[];
  $nor?: QuerySelector<T>[];
  $not?: QuerySelector<T>;
};

/**
 * Query request for executing custom queries
 */
export interface QueryRequest<T extends BaseDocument> {
  selector?: QuerySelector<T>;
  sort?: { field: keyof T; direction: 'asc' | 'desc' }[];
  limit?: number;
  skip?: number;
  fields?: (keyof T)[];
}

/**
 * Query result containing documents and metadata
 */
export interface QueryResult<T extends BaseDocument> {
  documents: T[];
  count: number;
  hasMore?: boolean;
}

/**
 * Database information
 */
export interface DatabaseInfo {
  name: string;
  adapter: string;
  version: string;
  collections: string[];
}

/**
 * Schema definition for adapter initialization
 */
export interface SchemaDefinition {
  name: string;
  version: number;
  primaryKey: string;
  properties: Record<string, any>;
  required?: string[];
  indexes?: IndexDefinition[];
  title?: string;
  description?: string;
}

/**
 * Index definition for query optimization
 */
export interface IndexDefinition {
  fields: string[];
  unique?: boolean;
}
