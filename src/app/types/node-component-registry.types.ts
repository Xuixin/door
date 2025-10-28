/**
 * Node Component Registry Types
 * Defines interfaces and types for the component registration and resolution system
 */

/**
 * Component loader function type for dynamic imports
 */
export type ComponentLoader<T = any> = () => Promise<T>;

/**
 * Component factory function type for creating component instances
 */
export type ComponentFactory<T = any> = () => T | Promise<T>;

/**
 * Component metadata for registration
 */
export interface ComponentMetadata {
  /** Component display name */
  name?: string;

  /** Component description */
  description?: string;

  /** Component version */
  version?: string;

  /** Component tags for categorization */
  tags?: string[];

  /** Component category */
  category?: string;

  /** Whether component is deprecated */
  deprecated?: boolean;

  /** Fallback component identifier */
  fallback?: string;

  /** Additional metadata */
  [key: string]: any;
}

/**
 * Component registration entry
 */
export interface ComponentRegistration<T = any> {
  /** Unique component identifier */
  id: string;

  /** Component loader function */
  loader: ComponentLoader<T>;

  /** Component metadata */
  metadata?: ComponentMetadata;

  /** Registration timestamp */
  registeredAt: Date;

  /** Last accessed timestamp */
  lastAccessed?: Date;

  /** Access count for analytics */
  accessCount: number;
}

/**
 * Component resolution result
 */
export interface ComponentResolution<T = any> {
  /** Resolved component */
  component: T;

  /** Component registration info */
  registration: ComponentRegistration<T>;

  /** Resolution timestamp */
  resolvedAt: Date;

  /** Whether component was loaded from cache */
  fromCache: boolean;
}

/**
 * Component cache entry
 */
export interface ComponentCacheEntry<T = any> {
  /** Cached component instance */
  component: T;

  /** Cache timestamp */
  cachedAt: Date;

  /** Cache expiry timestamp */
  expiresAt?: Date;

  /** Cache hit count */
  hitCount: number;
}

/**
 * Registry configuration options
 */
export interface RegistryConfig {
  /** Enable component caching */
  enableCache?: boolean;

  /** Cache TTL in milliseconds */
  cacheTtl?: number;

  /** Maximum cache size */
  maxCacheSize?: number;

  /** Default fallback component ID */
  defaultFallback?: string;

  /** Enable access analytics */
  enableAnalytics?: boolean;

  /** Enable debug logging */
  enableDebugLogging?: boolean;
}

/**
 * Registry statistics
 */
export interface RegistryStats {
  /** Total registered components */
  totalRegistrations: number;

  /** Total cache hits */
  cacheHits: number;

  /** Total cache misses */
  cacheMisses: number;

  /** Cache hit ratio */
  cacheHitRatio: number;

  /** Most accessed components */
  mostAccessed: Array<{ id: string; count: number }>;

  /** Registry uptime */
  uptime: number;
}

/**
 * Component search criteria
 */
export interface ComponentSearchCriteria {
  /** Search by tags */
  tags?: string[];

  /** Search by category */
  category?: string;

  /** Search by name pattern */
  namePattern?: string;

  /** Include deprecated components */
  includeDeprecated?: boolean;

  /** Limit results */
  limit?: number;
}

/**
 * Registry event types
 */
export type RegistryEventType =
  | 'component-registered'
  | 'component-resolved'
  | 'component-cached'
  | 'component-evicted'
  | 'registry-cleared';

/**
 * Registry event payload
 */
export interface RegistryEvent {
  /** Event type */
  type: RegistryEventType;

  /** Component ID */
  componentId: string;

  /** Event timestamp */
  timestamp: Date;

  /** Additional event data */
  data?: any;
}

/**
 * Registry event listener
 */
export type RegistryEventListener = (event: RegistryEvent) => void;

/**
 * Error types for component registry
 */
export class ComponentRegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly componentId?: string
  ) {
    super(message);
    this.name = 'ComponentRegistryError';
  }
}

export class ComponentNotFoundError extends ComponentRegistryError {
  constructor(componentId: string) {
    super(
      `Component with ID '${componentId}' not found in registry`,
      'COMPONENT_NOT_FOUND',
      componentId
    );
    this.name = 'ComponentNotFoundError';
  }
}

export class ComponentLoadError extends ComponentRegistryError {
  cause: Error;
  constructor(componentId: string, cause: Error) {
    super(
      `Failed to load component '${componentId}': ${cause.message}`,
      'COMPONENT_LOAD_ERROR',
      componentId
    );
    this.name = 'ComponentLoadError';
    this.cause = cause;
  }
}

export class DuplicateComponentError extends ComponentRegistryError {
  constructor(componentId: string) {
    super(
      `Component with ID '${componentId}' is already registered`,
      'DUPLICATE_COMPONENT',
      componentId
    );
    this.name = 'DuplicateComponentError';
  }
}
