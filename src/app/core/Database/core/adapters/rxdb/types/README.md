# RxDB Types Organization

This directory contains all RxDB type definitions organized in a scalable structure.

## Structure

```
types/
├── utils.ts                    # Utility type helpers
├── database.types.ts           # Main database types (collections union)
├── index.ts                    # Exports all types
└── query-builder/              # GraphQL query builders (organized with types)
    ├── base-query-builder.ts
    └── index.ts

Note: Collection types are now organized in table-based structure under `collections/{table-name}/types.ts`
```

## Adding a New Collection

When you need to add a new collection (e.g., `product`):

### Step 1: Create Collection Types File

Create `collections/product.types.ts`:

```typescript
import { ProductDocument } from "../../../../../schema";
import { CreateRxDocument, CreateRxCollection } from "../utils";

/**
 * ORM methods for Product collection
 */
export interface RxProductMethods {
  findAll: () => Promise<RxProductDocument[]>;
  findById: (id: string) => Promise<RxProductDocument | null>;
  create: (product: ProductDocument) => Promise<RxProductDocument>;
  update: (product: ProductDocument) => Promise<RxProductDocument>;
  // Add custom methods if needed
  findByCategory?: (category: string) => Promise<RxProductDocument[]>;
}

export type RxProductDocument = CreateRxDocument<ProductDocument, RxProductMethods>;
export type RxProductCollection = CreateRxCollection<ProductDocument, RxProductMethods>;
```

### Step 2: Add to Database Types

Update `database.types.ts`:

```typescript
import { RxProductCollection } from "./collections/product.types";

export interface RxTxnsCollections {
  // ... existing collections
  product: RxProductCollection; // Add this line
}
```

### Step 3: Export in Index

Update `types/index.ts`:

```typescript
export * from "./collections/product.types";
```

## Benefits

1. **Scalable**: Easy to add new collections without modifying existing files
2. **Maintainable**: Each collection is isolated in its own file
3. **Type-safe**: Utility helpers ensure consistent type definitions
4. **Clear structure**: Easy to find and modify specific collection types

## Utility Types

The `utils.ts` file provides helper types:

- `CreateRxDocument<DocType, Methods>` - Creates RxDocument type
- `CreateRxCollection<DocType, Methods>` - Creates RxCollection type
- `CreateRxDatabase<Collections>` - Creates RxDatabase type

Use these helpers to reduce boilerplate when adding new collections.

## Query Builders

Query builders for GraphQL replication are organized in the `query-builder/` folder. Each collection has its own query builder file containing:

- Pull query (for fetching data)
- Push mutation (for sending data)
- Stream subscription (for real-time updates)

### Structure

```
query-builder/
├── base-query-builder.ts       # Base class for query builders
└── index.ts                    # Exports query builders

Note: Collection-specific query builders are now in `collections/{table-name}/query-builder.ts`
```

### Usage

Query builders are typically used in replication services:

```typescript
import { PULL_TRANSACTION_QUERY, PUSH_TRANSACTION_MUTATION, STREAM_TRANSACTION_SUBSCRIPTION } from "../adapters/rxdb/types/query-builder/txn-query-builder";
```

All query builders are exported from `types/index.ts` for convenience.
