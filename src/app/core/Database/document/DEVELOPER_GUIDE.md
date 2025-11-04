# Database Module Developer Guide

คู่มือสำหรับนักพัฒนาเกี่ยวกับ Database Module Architecture และ Best Practices

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adapter Pattern](#adapter-pattern)
3. [Collection Registry](#collection-registry)
4. [Base Classes](#base-classes)
5. [File Organization](#file-organization)
6. [Adding New Collections](#adding-new-collections)
7. [Best Practices](#best-practices)
8. [Common Patterns](#common-patterns)

---

## Architecture Overview

Database Module ใช้ **Adapter Pattern** เพื่อให้ระบบสามารถรองรับ database backend หลายตัวได้ โดยปัจจุบันใช้ **RxDB** แต่สามารถเปลี่ยนเป็น database อื่นได้ในอนาคต

### Key Components

```
┌─────────────────────────────────────────────────┐
│           Application Layer                     │
│  (Components, Services using Facades)           │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         Facade Services Layer                   │
│  (TransactionService, DeviceMonitoringFacade, etc.) │
│  Extends: BaseFacadeService                     │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│           Adapter Layer                         │
│  (CollectionAdapter, DBAdapter)                 │
│  Interfaces: Database-agnostic                  │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│         Implementation Layer                    │
│  (RxDBAdapter, RxDBCollectionAdapter)           │
│  Concrete: RxDB-specific                        │
└──────────────────┬──────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────┐
│            Database Backend                     │
│  (RxDB / Future: IndexedDB, SQLite, etc.)       │
└─────────────────────────────────────────────────┘
```

---

## Adapter Pattern

### Concept

Adapter Pattern ช่วยให้:

- **Decouple** application code จาก database-specific APIs
- **Switch** database backend ได้โดยไม่ต้องแก้ application code
- **Test** ได้ง่ายขึ้น (mock adapters)
- **Maintain** code ได้ง่ายขึ้น (single source of truth)

### Interfaces

#### DBAdapter

```typescript
interface DBAdapter {
  initialize(schemas: SchemaDefinition[]): Promise<void>;
  getCollection<T>(name: string): CollectionAdapter<T>;
  getReplication(): ReplicationAdapter;
  close(): Promise<void>;
  isReady(): boolean;
}
```

#### CollectionAdapter

```typescript
interface CollectionAdapter<T> {
  find(selector?: QuerySelector<T>): Promise<T[]>;
  findOne(idOrSelector: string | QuerySelector<T>): Promise<T | null>;
  insert(document: Partial<T>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string, hard?: boolean): Promise<boolean>;
  find$(selector?: QuerySelector<T>): Observable<T[]>;
  findOne$(idOrSelector: string | QuerySelector<T>): Observable<T | null>;
}
```

### Current Implementation

- **RxDBAdapter**: Wraps RxDB database instance
- **RxDBCollectionAdapter**: Wraps RxCollection
- **RxDBReplicationAdapter**: Wraps GraphQL replication

---

## Collection Registry

Collection Registry เป็น **Single Source of Truth** สำหรับ collection metadata

### Location

`src/app/core/Database/core/collection-registry.ts`

### Usage

```typescript
import { CollectionRegistry, COLLECTION_NAMES } from "../core/collection-registry";

// Get metadata
const metadata = CollectionRegistry.get("txn");

// Get by service name
const metadata = CollectionRegistry.getByServiceName("Transaction");

// Get all collections
const allCollections = CollectionRegistry.getAll();

// Type-safe collection name
const collectionName = COLLECTION_NAMES.TXN;
```

### Why Use Registry?

1. **Type Safety**: Type-safe collection names via `COLLECTION_NAMES`
2. **Single Source of Truth**: All metadata in one place
3. **Easy Updates**: Change collection name once, update everywhere
4. **Discoverability**: Easy to find all collections
5. **Validation**: Can validate collection exists

---

## Base Classes

### BaseFacadeService

Abstract base class สำหรับ Facade Services

**Benefits**:

- ✅ Automatic collection access
- ✅ Proper async initialization
- ✅ Automatic subscription cleanup
- ✅ Error handling patterns
- ✅ ~70-80% less boilerplate code

**Usage**:

```typescript
export class ProductService extends BaseFacadeService<ProductDocument> {
  protected getCollectionName(): string {
    return COLLECTION_NAMES.PRODUCT;
  }

  protected setupSubscriptions(): void {
    const subscription = this.collection.find$().subscribe(...);
    this.addSubscription(subscription);
  }
}
```

**Key Methods**:

- `getCollectionName()`: Abstract - must implement
- `setupSubscriptions()`: Abstract - must implement
- `collection`: Protected getter - automatic collection access
- `ensureInitialized()`: Proper async initialization
- `addSubscription()`: Track subscriptions for cleanup

### BaseReplicationService

Abstract base class สำหรับ Replication Services

**Benefits**:

- ✅ Network status handling
- ✅ Automatic retry logic
- ✅ Error handling
- ✅ Adapter integration

**Usage**:

```typescript
export class ProductReplicationService extends BaseReplicationService<ProductDocument> {
  constructor(networkStatus: NetworkStatusService) {
    super(networkStatus);
    this.collectionName = 'product';
  }

  protected buildReplicationConfig(): ReplicationConfig {
    // Use ReplicationConfigBuilder
    return ReplicationConfigBuilder.buildBaseConfig({...});
  }
}
```

---

## File Organization

```
src/app/core/Database/
├── adapter/                    # Interfaces (Database-agnostic)
│   ├── collection-adapter.interface.ts
│   ├── db-adapter.interface.ts
│   └── replication-adapter.interface.ts
│
├── adapters/                   # Implementations (Database-specific)
│   └── rxdb/
│       ├── rxdb-adapter.ts
│       ├── rxdb-collection-adapter.ts
│       ├── rxdb-replication-adapter.ts
│       └── types/              # RxDB-specific types
│
├── config/                     # Configuration
│   └── collection-registry.ts  # Single source of truth
│
├── facade/                     # Facade Services
│   ├── base-facade.service.ts  # Base class
│   ├── transaction.service.ts
│   └── ...
│
├── factory/                     # Factory Pattern
│   ├── adapter-factory.ts
│   └── adapter-provider.service.ts
│
├── replication/                # Replication Services
│   ├── base-replication.service.ts
│   ├── replication-config-builder.ts  # Builder utility
│   └── ...
│
└── templates/                  # Templates for new collections
    └── collection.template.ts
```

---

## Adding New Collections

ดูคู่มือละเอียดที่: `ADD_NEW_TABLE.md`

### Quick Checklist

1. ✅ Register in `CollectionRegistry`
2. ✅ Create schema file
3. ✅ Create RxDB types
4. ✅ Update database types
5. ✅ (Optional) Create facade service (extends `BaseFacadeService`)
6. ✅ (Optional) Create replication service (extends `BaseReplicationService`)
7. ✅ (Optional) Create query builder

---

## Best Practices

### 1. Always Use Collection Registry

❌ **Bad**:

```typescript
const collection = adapter.getCollection("txn"); // Hardcoded
```

✅ **Good**:

```typescript
const collection = adapter.getCollection(COLLECTION_NAMES.TXN); // Type-safe
```

### 2. Extend Base Classes

❌ **Bad**:

```typescript
export class ProductService {
  private adapterProvider = inject(AdapterProviderService);
  private subscriptions: Subscription[] = [];

  private get collection() {
    if (!this.adapterProvider.isReady()) return null;
    return this.adapterProvider.getAdapter().getCollection("product");
  }

  // ... duplicate code ...
}
```

✅ **Good**:

```typescript
export class ProductService extends BaseFacadeService<ProductDocument> {
  protected getCollectionName(): string {
    return COLLECTION_NAMES.PRODUCT;
  }

  // ... only business logic ...
}
```

### 3. Use ReplicationConfigBuilder

❌ **Bad**:

```typescript
protected buildReplicationConfig() {
  return {
    replicationId: 'product-replication',
    collectionName: 'product',
    url: { http: environment.apiUrl, ws: environment.wsUrl },
    pull: { batchSize: 10 },
    push: {},
    live: true,
    retryTime: 60000,
    // ... duplicate config ...
  };
}
```

✅ **Good**:

```typescript
protected buildReplicationConfig() {
  return ReplicationConfigBuilder.buildBaseConfig({
    collectionName: 'product',
    batchSize: 10,
    // ... only unique config ...
  });
}
```

### 4. Proper Error Handling

✅ **Good**:

```typescript
async findById(id: string) {
  const collection = this.collection;
  if (!collection) {
    throw new Error('Collection not available');
  }
  return await collection.findOne(id);
}
```

### 5. Use Signals for Reactive Data

✅ **Good**:

```typescript
private _products = signal<ProductDocument[]>([]);
public readonly products = this._products.asReadonly();

// In subscription
this.collection.find$().subscribe({
  next: (products) => this._products.set(products),
});
```

---

## Common Patterns

### Pattern 1: Facade Service with Signals

```typescript
export class ProductService extends BaseFacadeService<ProductDocument> {
  private _products = signal<ProductDocument[]>([]);
  public readonly products = this._products.asReadonly();

  protected setupSubscriptions(): void {
    const sub = this.collection.find$().subscribe({
      next: (products) => this._products.set(products),
    });
    this.addSubscription(sub);
  }
}
```

### Pattern 2: Computed Signals

```typescript
public readonly productsByCategory = computed(() => {
  const products = this._products();
  const grouped = new Map<string, ProductDocument[]>();
  products.forEach((product) => {
    const cat = product.category || 'uncategorized';
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(product);
  });
  return grouped;
});
```

### Pattern 3: Replication with Builder

```typescript
protected buildReplicationConfig() {
  return ReplicationConfigBuilder.buildBaseConfig({
    collectionName: 'product',
    batchSize: 10,
    pullQueryBuilder: (checkpoint, limit) => ({
      query: PULL_PRODUCT_QUERY,
      variables: {
        input: {
          checkpoint: ReplicationConfigBuilder.buildCheckpointInput(checkpoint),
          limit,
        },
      },
    }),
    responseModifier: ReplicationConfigBuilder.createResponseModifier([
      'pullProduct',
      'streamProduct',
    ]),
  });
}
```

---

## Troubleshooting

### Collection Not Found

**Error**: `Collection "product" not found in registry`

**Solution**: Register collection in `CollectionRegistry`

### Type Errors

**Error**: `Type 'ProductDocument' does not satisfy constraint 'BaseDocument'`

**Solution**: Ensure schema extends `BaseDocument` or includes required fields

### Subscription Not Working

**Error**: Data not updating reactively

**Solution**:

1. Check `ensureInitialized()` is called
2. Verify subscription is added via `addSubscription()`
3. Check adapter is ready: `adapterProvider.isReady()`

---

## 📚 Additional Resources

- **Adding Collections**: `ADD_NEW_TABLE.md`
- **Collection Template**: `templates/collection.template.ts`
- **Database README**: `README.md`

---

**Last Updated**: 2024-01-XX  
**Version**: 2.0
