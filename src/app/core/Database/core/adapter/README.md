# Database Adapter Interfaces

This directory contains the core interfaces and types for the database abstraction layer.

## Files

- **`db-adapter.interface.ts`** - Main `DBAdapter` interface that all database backends must implement
- **`collection-adapter.interface.ts`** - `CollectionAdapter` interface for collection-level operations
- **`replication-adapter.interface.ts`** - `ReplicationAdapter` interface for sync/replication operations
- **`query.types.ts`** - Type definitions for queries, selectors, and results
- **`index.ts`** - Barrel export for all interfaces and types

## Usage

```typescript
import { DBAdapter, CollectionAdapter, ReplicationAdapter } from "../adapter";
```

All adapters must implement these interfaces to be compatible with the abstraction layer.
