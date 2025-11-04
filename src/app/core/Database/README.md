# Database Abstraction Layer

This directory contains the database abstraction layer that enables database-agnostic operations while maintaining backward compatibility with RxDB.

## Architecture

The database layer uses an **adapter pattern** to abstract database operations from specific implementations, allowing the application to work with different database backends (RxDB, PouchDB, WatermelonDB, etc.) through a unified interface.

### Directory Structure (Organized by Function)

```
Database/
├── collections/                      # Table-based organization
│   ├── txn/                         # Transaction collection
│   │   ├── schema.ts
│   │   ├── types.ts
│   │   ├── facade.service.ts
│   │   ├── replication.service.ts
│   │   ├── query-builder.ts
│   │   └── index.ts
│   ├── device-monitoring/            # Device monitoring collection
│   │   └── ... (same structure)
│   └── device-monitoring-history/    # Device monitoring history collection
│       └── ... (same structure)
│
├── core/
│   ├── services/                    # Root-level services (public API)
│   │   ├── database.service.ts      # Main DatabaseService
│   │   └── network-status.service.ts # Network status monitoring
│   │
│   ├── base/                        # Base classes for inheritance
│   │   ├── base-facade.service.ts
│   │   ├── base-replication.service.ts
│   │   └── base-schema.ts
│   │
│   ├── config/                      # Configuration & Registry
│   │   ├── collection-registry.ts   # Central collection registry
│   │   └── replication-config-builder.ts
│   │
│   ├── adapter/                     # Adapter interfaces (database-agnostic)
│   │   ├── db-adapter.interface.ts
│   │   ├── collection-adapter.interface.ts
│   │   ├── replication-adapter.interface.ts
│   │   └── query.types.ts
│   │
│   ├── adapters/                    # Concrete adapter implementations
│   │   └── rxdb/                    # RxDB adapter
│   │       ├── rxdb-adapter.ts
│   │       ├── rxdb-collection-adapter.ts
│   │       ├── rxdb-replication-adapter.ts
│   │       ├── rxdb-helpers.ts
│   │       └── types/
│   │
│   ├── factory/                     # Factory pattern
│   │   ├── adapter-factory.ts
│   │   └── adapter-provider.service.ts
│   │
│   ├── types/                       # Shared TypeScript types
│   │   ├── database.types.ts
│   │   └── utils.ts
│   │
│   ├── utils/                       # Utility functions
│   │   ├── schema-converter.ts
│   │   └── base-query-builder.ts
│   │
│   └── index.ts                     # Public API barrel exports
│
└── document/                        # Documentation
    ├── ADD_NEW_TABLE.md
    ├── DEVELOPER_GUIDE.md
    ├── FILE_ORGANIZATION.md         # File organization guide
    └── ...
```

## Key Benefits of New Structure

### ✅ Table-Based Organization

- **Self-contained**: All files for a table are in one folder
- **Easy to add**: Just create a new folder with all files
- **Easy to find**: Everything related to a table in one place
- **Team-friendly**: Each developer can work on different tables without conflicts

### ✅ Separation of Concerns

- **core/**: Shared utilities, base classes, and adapter implementations
- **collections/**: Table-specific business logic (self-contained)
- Clear separation makes the codebase easier to understand and maintain

## Core Concepts

### 1. DBAdapter Interface

The `DBAdapter` interface defines the contract for all database backends:

```typescript
interface DBAdapter {
  initialize(schemas: SchemaDefinition[]): Promise<void>;
  getCollection<T>(collectionName: string): CollectionAdapter<T>;
  close(): Promise<void>;
  getInfo(): Promise<DatabaseInfo>;
  isReady(): boolean;
  getReplication(): ReplicationAdapter;
}
```

### 2. CollectionAdapter Interface

Provides collection-level operations:

```typescript
interface CollectionAdapter<T> {
  find(selector?: QuerySelector<T>): Promise<T[]>;
  findOne(idOrSelector: string | QuerySelector<T>): Promise<T | null>;
  insert(document: Partial<T>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string, hard?: boolean): Promise<boolean>;
  find$(selector?: QuerySelector<T>): Observable<T[]>;
  findOne$(idOrSelector: string | QuerySelector<T>): Observable<T | null>;
  query(query: QueryRequest<T>): Promise<QueryResult<T>>;
}
```

### 3. AdapterProviderService

Angular service that manages the database adapter lifecycle:

```typescript
@Injectable({ providedIn: "root" })
export class AdapterProviderService {
  getAdapter(): DBAdapter;
  isReady(): boolean;
  waitUntilReady(): Promise<DBAdapter>;
}
```

### 4. Base Classes

- **BaseFacadeService**: Base class for facade services with automatic subscription management
- **BaseReplicationService**: Base class for replication services with network handling
- **BaseSchema**: Base schema utilities and type helpers

### 5. Configuration

- **CollectionRegistry**: Central registry for all collections (Single Source of Truth)
- **ReplicationConfigBuilder**: Utility to build replication configurations

```typescript
export class CollectionRegistry {
  static get(name: string): CollectionMetadata | undefined;
  static getAll(): CollectionMetadata[];
  // ...
}
```

### 6. Services

- **DatabaseService**: Main database service for managing database instance and replication
- **NetworkStatusService**: Network status monitoring (supports Web and Mobile)

## Adding a New Collection

See the detailed guide: [ADD_NEW_TABLE.md](./document/ADD_NEW_TABLE.md)

**Quick Steps:**

1. Register in `core/config/collection-registry.ts`
2. Create folder: `collections/{table-name}/`
3. Create files: `schema.ts`, `types.ts`, `facade.service.ts`, `replication.service.ts`, `query-builder.ts`, `index.ts`
4. Update `core/types/database.types.ts`
5. Update `core/adapters/rxdb/rxdb-helpers.ts`

## Usage Examples

### Using Facade Service

```typescript
import { TransactionService } from "./core/Database/collections/txn";

export class MyComponent {
  private transactionService = inject(TransactionService);

  async ngOnInit() {
    // Access reactive data via signals
    const transactions = this.transactionService.transactions();

    // Or use async methods
    const allTxns = await this.transactionService.findAll();
  }
}
```

### Using Database Service

```typescript
import { DatabaseService } from "./core/Database/core/services/database.service";

export class MyService {
  private dbService = inject(DatabaseService);

  async getData() {
    const db = this.dbService.db;
    if (!db) {
      throw new Error("Database not initialized");
    }
    return await db.txn.find().exec();
  }
}
```

### Direct Adapter Access

```typescript
import { AdapterProviderService } from "./core/Database/core/factory";

export class MyService {
  private adapterProvider = inject(AdapterProviderService);

  async getData() {
    await this.adapterProvider.waitUntilReady();
    const adapter = this.adapterProvider.getAdapter();
    const collection = adapter.getCollection<MyDocument>("my_collection");
    return await collection.find();
  }
}
```

## Migration Notes

### From Old Structure to New Structure

**Old (Function-Based):**

```
Database/
├── schema/txn.schema.ts
├── facade/transaction.service.ts
├── replication/transaction-replication.service.ts
└── adapters/rxdb/types/collections/txn.types.ts
```

**New (Table-Based):**

```
Database/
└── collections/txn/
    ├── schema.ts
    ├── types.ts
    ├── facade.service.ts
    ├── replication.service.ts
    └── query-builder.ts
```

All files for a collection are now in one folder!

## Documentation

- **[ADD_NEW_TABLE.md](./document/ADD_NEW_TABLE.md)**: Complete guide for adding new collections
- **[DEVELOPER_GUIDE.md](./document/DEVELOPER_GUIDE.md)**: General developer guide
- **[FILE_ORGANIZATION.md](./document/FILE_ORGANIZATION.md)**: File organization and structure guide
- **[MIGRATION.md](./document/MIGRATION.md)**: Migration guide from direct RxDB usage to adapter pattern

## File Organization

The Database folder is organized into logical groups for better maintainability:

- **collections/**: Table-based collections (self-contained)
- **core/services/**: Root-level services (public API)
- **core/base/**: Base classes for inheritance
- **core/config/**: Configuration and registry
- **core/adapter/**: Adapter interfaces
- **core/adapters/**: Adapter implementations
- **core/factory/**: Factory pattern
- **core/types/**: Shared TypeScript types
- **core/utils/**: Utility functions

See **[FILE_ORGANIZATION.md](./document/FILE_ORGANIZATION.md)** for detailed explanation of each group.

## Related Files

- `core/services/database.service.ts`: Main service for database operations
- `core/services/network-status.service.ts`: Network status monitoring for offline-first operations
- `core/config/collection-registry.ts`: Central collection registry

---

**Last Updated**: 2025-01-XX
**Version**: 4.0 (Organized Structure)
