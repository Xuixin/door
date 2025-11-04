import type { RxDocument, RxCollection, RxDatabase } from 'rxdb';
import { Signal } from '@angular/core';

/**
 * Utility type helpers for creating RxDB types
 * Reduces code duplication and makes it easier to add new collections
 */

/**
 * Helper to create RxDocument type
 */
export type CreateRxDocument<
  DocType,
  Methods extends Record<string, any> = {},
> = RxDocument<DocType, Methods>;

/**
 * Helper to create RxCollection type
 */
export type CreateRxCollection<
  DocType,
  Methods extends Record<string, any> = {},
> = RxCollection<DocType, Methods, unknown, unknown, Signal<unknown>>;

/**
 * Helper to create RxDatabase type from collections object
 */
export type CreateRxDatabase<Collections> = RxDatabase<
  Collections,
  unknown,
  unknown,
  Signal<unknown>
>;
