import {
  IDENTIFIER_COLLECTION_MAP,
  IDENTIFIER_SERVER_MAP,
  COLLECTION_IDENTIFIER_MAP,
  PRIMARY_IDENTIFIERS,
  SECONDARY_IDENTIFIERS,
} from '../constants';
import { environment } from 'src/environments/environment';

/**
 * Get collection name from replication identifier
 */
export function getCollectionFromIdentifier(identifier: string): string {
  return IDENTIFIER_COLLECTION_MAP[identifier] || 'unknown';
}

/**
 * Get display name from identifier
 */
export function getNameFromIdentifier(identifier: string): string {
  const collection = getCollectionFromIdentifier(identifier);
  const server = getServerFromIdentifier(identifier);
  return `${collection} ${server.charAt(0).toUpperCase() + server.slice(1)}`;
}

/**
 * Get URL from identifier
 */
export function getUrlFromIdentifier(identifier: string): string {
  const server = getServerFromIdentifier(identifier);
  if (server === 'secondary') {
    return environment.apiSecondaryUrl || environment.apiUrl;
  }
  return environment.apiUrl;
}

/**
 * Get WebSocket URL from identifier
 */
export function getWsUrlFromIdentifier(identifier: string): string {
  const server = getServerFromIdentifier(identifier);
  if (server === 'secondary') {
    return environment.wsSecondaryUrl || environment.wsUrl;
  }
  return environment.wsUrl;
}

/**
 * Get server type from identifier
 */
export function getServerFromIdentifier(
  identifier: string,
): 'primary' | 'secondary' {
  return IDENTIFIER_SERVER_MAP[identifier] || 'primary';
}

/**
 * Check if identifier is primary
 */
export function isPrimaryIdentifier(identifier: string): boolean {
  return (
    (PRIMARY_IDENTIFIERS as readonly string[]).includes(identifier) ||
    IDENTIFIER_SERVER_MAP[identifier] === 'primary'
  );
}

/**
 * Check if identifier is secondary
 */
export function isSecondaryIdentifier(identifier: string): boolean {
  return (
    (SECONDARY_IDENTIFIERS as readonly string[]).includes(identifier) ||
    IDENTIFIER_SERVER_MAP[identifier] === 'secondary'
  );
}

/**
 * Get collection identifier mapping (primary and secondary)
 */
export function getCollectionIdentifierMapping(
  collectionName: string,
): { primary: string; secondary: string } | null {
  const normalizedName = collectionName.toLowerCase();
  return COLLECTION_IDENTIFIER_MAP[normalizedName] || null;
}
