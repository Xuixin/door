/**
 * Replication Utilities
 * Pure functions for working with replication identifiers and data
 */

import {
  COLLECTION_IDENTIFIER_MAP,
  IDENTIFIER_COLLECTION_MAP,
  IDENTIFIER_SERVER_MAP,
} from '../constants/replication.constants';
import { environment } from 'src/environments/environment';

/**
 * Get collection name from replication identifier
 */
export function getCollectionFromIdentifier(identifier: string): string {
  return IDENTIFIER_COLLECTION_MAP[identifier] || 'unknown';
}

/**
 * Get display name from replication identifier
 */
export function getNameFromIdentifier(identifier: string): string {
  const collection = getCollectionFromIdentifier(identifier);
  const server = getServerFromIdentifier(identifier);
  return `${collection} ${server === 'primary' ? 'Primary' : 'Secondary'}`;
}

/**
 * Get URL from replication identifier
 */
export function getUrlFromIdentifier(identifier: string): string {
  if (identifier.includes('3001')) {
    return 'http://localhost:3001/graphql';
  }
  return 'http://localhost:10102/graphql';
}

/**
 * Get server type from replication identifier
 */
export function getServerFromIdentifier(
  identifier: string,
): 'primary' | 'secondary' {
  return IDENTIFIER_SERVER_MAP[identifier] || 'primary';
}

/**
 * Check if identifier is for primary server
 */
export function isPrimaryIdentifier(identifier: string): boolean {
  return getServerFromIdentifier(identifier) === 'primary';
}

/**
 * Check if identifier is for secondary server
 */
export function isSecondaryIdentifier(identifier: string): boolean {
  return getServerFromIdentifier(identifier) === 'secondary';
}

/**
 * Get collection identifier mapping (primary and secondary)
 */
export function getCollectionIdentifierMapping(collectionName: string): {
  primary: string;
  secondary: string;
} | null {
  const mapping = COLLECTION_IDENTIFIER_MAP[collectionName.toLowerCase()];
  return mapping || null;
}
