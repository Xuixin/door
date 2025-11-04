# Database Folder File Organization

## โครงสร้างและหน้าที่ของแต่ละกลุ่ม

### 1. collections/

- **หน้าที่**: Table-based collections (self-contained)
- **โครงสร้าง**: แต่ละ collection มี schema, types, facade, replication, query-builder
- **ตัวอย่าง**: `txn/`, `device-monitoring/`, `device-monitoring-history/`
- **การใช้งาน**: ทุก collection จะมี folder ของตัวเองที่มีไฟล์ทั้งหมดที่เกี่ยวข้อง

### 2. core/services/

- **หน้าที่**: Root-level services (public API)
- **ไฟล์**:
  - `database.service.ts` - Main database service สำหรับจัดการ database instance และ replication services
  - `network-status.service.ts` - Network status monitoring สำหรับตรวจสอบ online/offline status (รองรับทั้ง Web และ Mobile)
- **การใช้งาน**: Services เหล่านี้เป็น public API ที่ใช้โดย components และ services อื่นๆ

### 3. core/base/

- **หน้าที่**: Base classes สำหรับ inheritance
- **ไฟล์**:
  - `base-facade.service.ts` - Base class สำหรับ facade services (จัดการ subscriptions, collection access)
  - `base-replication.service.ts` - Base class สำหรับ replication services (จัดการ network status, retry logic)
  - `base-schema.ts` - Base schema utilities และ type helpers
- **การใช้งาน**: Extended โดย facade และ replication services ของแต่ละ collection

### 4. core/config/

- **หน้าที่**: Configuration และ registry
- **ไฟล์**:
  - `collection-registry.ts` - Central registry สำหรับ collection metadata (Single Source of Truth)
  - `replication-config-builder.ts` - Utility สำหรับสร้าง replication configurations
- **การใช้งาน**: ใช้สำหรับ register collections และ build replication configs

### 5. core/adapter/

- **หน้าที่**: Adapter interfaces (database-agnostic contracts)
- **ไฟล์**:
  - `db-adapter.interface.ts` - Database adapter interface
  - `collection-adapter.interface.ts` - Collection adapter interface
  - `replication-adapter.interface.ts` - Replication adapter interface
  - `query.types.ts` - Query types
- **การใช้งาน**: กำหนด contracts สำหรับ database operations ที่ database-agnostic

### 6. core/adapters/

- **หน้าที่**: Concrete adapter implementations
- **โครงสร้าง**:
  - `adapters/rxdb/` - RxDB implementation
    - `rxdb-adapter.ts` - RxDB database adapter
    - `rxdb-collection-adapter.ts` - RxDB collection adapter
    - `rxdb-replication-adapter.ts` - RxDB replication adapter
    - `rxdb-helpers.ts` - RxDB helper functions
    - `types/` - RxDB-specific types
- **การใช้งาน**: Implementation จริงของ adapter interfaces สำหรับ RxDB

### 7. core/factory/

- **หน้าที่**: Factory pattern สำหรับสร้าง adapters
- **ไฟล์**:
  - `adapter-factory.ts` - Factory สำหรับสร้าง adapters
  - `adapter-provider.service.ts` - Angular service ที่จัดการ adapter lifecycle
- **การใช้งาน**: ใช้สำหรับ initialize และ manage database adapters

### 8. core/types/

- **หน้าที่**: Shared TypeScript types
- **ไฟล์**:
  - `database.types.ts` - Main database types (RxTxnsDatabase, RxTxnsCollections)
  - `utils.ts` - Type utility helpers (CreateRxDocument, CreateRxCollection, etc.)
  - `index.ts` - Type exports
- **การใช้งาน**: Type definitions ที่ใช้ร่วมกันทั้งระบบ

### 9. core/utils/

- **หน้าที่**: Utility functions
- **ไฟล์**:
  - `schema-converter.ts` - Converter สำหรับแปลง RxDB schema เป็น adapter schema
  - `base-query-builder.ts` - Base class สำหรับ GraphQL query builders
- **การใช้งาน**: Utility functions ที่ใช้ในการแปลง schemas และ build queries

### 10. core/index.ts

- **หน้าที่**: Public API barrel exports
- **การใช้งาน**: Export ทั้งหมดจาก core module เพื่อให้ง่ายต่อการ import

## File Naming Conventions

- **Services**: `*.service.ts`
- **Interfaces**: `*.interface.ts`
- **Types**: `types.ts` หรือ `*.types.ts`
- **Schemas**: `schema.ts`
- **Facades**: `facade.service.ts`
- **Replication**: `replication.service.ts`
- **Query Builders**: `query-builder.ts`
- **Index**: `index.ts` (barrel exports)

## Import Path Patterns

### จากภายนอก Database module:

```typescript
import { DatabaseService } from "./core/Database/core/services/database.service";
import { NetworkStatusService } from "./core/Database/core/services/network-status.service";
```

### จาก collections:

```typescript
import { BaseFacadeService } from "../../core/base/base-facade.service";
import { COLLECTION_NAMES } from "../../core/config/collection-registry";
```

### จาก core files:

```typescript
import { CollectionRegistry } from "../config/collection-registry";
import { ReplicationConfigBuilder } from "../config/replication-config-builder";
```

## Best Practices

1. **ใช้ barrel exports**: Import จาก `core/index.ts` หรือ `collections/{name}/index.ts` เมื่อเป็นไปได้
2. **Type Safety**: ใช้ `COLLECTION_NAMES` constants แทน hardcoded strings
3. **Single Source of Truth**: Collection metadata ทั้งหมดมาจาก `collection-registry.ts`
4. **Separation of Concerns**: แต่ละ folder มีหน้าที่ชัดเจน
5. **Self-contained Collections**: ทุก collection มีไฟล์ทั้งหมดที่จำเป็นใน folder ของตัวเอง
