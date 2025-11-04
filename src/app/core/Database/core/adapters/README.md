# Database Adapter Implementations

This directory contains concrete implementations of the database adapter interfaces.

## Current Implementations

### RxDB Adapter (`rxdb/`)

The RxDB adapter wraps RxDB functionality and provides:

- Full CRUD operations
- Reactive queries (Observables)
- GraphQL replication support
- Offline-first capabilities

**Files:**

- `rxdb-adapter.ts` - Main adapter implementation
- `rxdb-collection-adapter.ts` - Collection operations
- `rxdb-replication-adapter.ts` - GraphQL replication
- `rxdb.types.ts` - RxDB type definitions (moved from `Database/RxDB.D.ts`)
- `rxdb-helpers.ts` - RxDB-specific helper functions and constants

## Adding a New Adapter

1. Create a new directory: `adapters/[backend-name]/`
2. Implement the interfaces from `../adapter/`:
   - `DBAdapter`
   - `CollectionAdapter` (via `getCollection()`)
   - `ReplicationAdapter` (via `getReplication()`)
3. Export via `index.ts`
4. Update `factory/adapter-factory.ts` to include the new adapter
5. Update environment configuration

## Example Structure

```
adapters/
├── rxdb/
│   ├── rxdb-adapter.ts
│   ├── rxdb-collection-adapter.ts
│   ├── rxdb-replication-adapter.ts
│   └── index.ts
└── [new-backend]/
    ├── [backend]-adapter.ts
    ├── [backend]-collection-adapter.ts
    └── index.ts
```
