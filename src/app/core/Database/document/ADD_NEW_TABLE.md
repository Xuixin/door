# คู่มือการเพิ่ม Collection ใหม่ (Table-Based Organization)

เอกสารนี้จะอธิบายขั้นตอนการเพิ่ม collection ใหม่ในระบบ kiosk โดยใช้ **Table-Based Organization** และ **Base Classes**

> **หมายเหตุ**: ระบบนี้ใช้ Adapter Pattern เพื่อให้สามารถเปลี่ยน database backend ได้ในอนาคต และใช้ Base Classes เพื่อลด code duplication

## 📋 Overview

เมื่อต้องการเพิ่ม collection ใหม่ จำเป็นต้องทำตามลำดับดังนี้:

1. ✅ **Register Collection** - ลงทะเบียนใน CollectionRegistry
2. ✅ **Create Collection Folder** - สร้าง folder ใหม่ใน `collections/{table-name}/`
3. ✅ สร้างไฟล์ทั้งหมดใน folder นั้น (schema, types, facade, replication, query-builder)
4. ✅ อัพเดต **Database Types** - เพิ่มใน RxTxnsCollections
5. ✅ อัพเดต **getAdapterSchemas** - เพิ่ม schema adapter

> **Template File**: ดูตัวอย่างโค้ดแบบเต็มที่ `src/app/core/Database/templates/collection.template.ts`

---

## 🎯 โครงสร้างใหม่ (Table-Based)

**ข้อดีของโครงสร้างใหม่:**

- ✅ **Self-contained**: ทุกไฟล์ที่เกี่ยวกับ table อยู่ใน folder เดียวกัน
- ✅ **ง่ายต่อการเพิ่ม**: แค่สร้าง folder ใหม่ + ไฟล์ทั้งหมด
- ✅ **จัดการง่าย**: หาไฟล์ที่เกี่ยวกับ table ได้ในที่เดียว
- ✅ **Team-friendly**: แต่ละคนทำงานกับ table ที่ต่างกันได้โดยไม่ conflict

**โครงสร้าง:**

```
collections/
  {table-name}/
    ├── schema.ts              # Schema definition
    ├── types.ts               # RxDB types
    ├── facade.service.ts      # Facade service (optional)
    ├── replication.service.ts # Replication service (optional)
    ├── query-builder.ts       # GraphQL queries (optional)
    └── index.ts               # Exports everything
```

---

## 📝 Step-by-Step Guide

### Step 1: Register Collection in CollectionRegistry

**File**: `src/app/core/Database/core/collection-registry.ts`

เพิ่ม entry ใน `collections` Map:

```typescript
[
  'product',
  {
    collectionName: 'product',
    collectionKey: 'product',
    replicationId: 'product-graphql-replication',
    serviceName: 'Product',
    displayName: 'Product',
    description: 'Product collection for managing products',
  },
],
```

**สำคัญ**: นี่คือ Single Source of Truth สำหรับ collection metadata

เพิ่มใน `COLLECTION_NAMES` constant ด้วย:

```typescript
export const COLLECTION_NAMES = {
  // ... existing
  PRODUCT: "product",
} as const;
```

---

### Step 2: Create Collection Folder

**สร้าง folder**: `src/app/core/Database/collections/product/`

จากนั้นสร้างไฟล์ทั้งหมดใน folder นี้:

---

### Step 3: สร้าง Schema File

**File**: `collections/product/schema.ts`

```typescript
import { RxJsonSchema, toTypedRxJsonSchema, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";
import { SchemaDefinition } from "../../core/adapter";
import { convertRxDBSchemaToAdapter } from "../../core/schema-converter";

export interface ProductDocument {
  id: string;
  name: string;
  price: number;
  description?: string;
  category?: string;
  client_created_at: string;
  client_updated_at: string;
  server_created_at?: string;
  server_updated_at?: string;
}

export const PRODUCT_SCHEMA_LITERAL: RxJsonSchema<ProductDocument> = {
  title: "Product",
  description: "Product schema",
  version: 0,
  primaryKey: "id",
  keyCompression: false,
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    name: { type: "string", maxLength: 200 },
    price: { type: "number" },
    description: { type: "string", maxLength: 1000 },
    category: { type: "string", maxLength: 50 },
    client_created_at: { type: "string", maxLength: 20 },
    client_updated_at: { type: "string", maxLength: 20 },
    server_created_at: { type: "string", maxLength: 20 },
    server_updated_at: { type: "string", maxLength: 20 },
  },
  required: ["id", "name", "price", "client_created_at"],
};

export const productSchema = toTypedRxJsonSchema(PRODUCT_SCHEMA_LITERAL);
export type RxProductDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productSchema>;
export const PRODUCT_SCHEMA: RxJsonSchema<RxProductDocumentType> = PRODUCT_SCHEMA_LITERAL;

// Export adapter-compatible schema (สำคัญ!)
export const PRODUCT_SCHEMA_ADAPTER: SchemaDefinition = convertRxDBSchemaToAdapter("product", PRODUCT_SCHEMA as any);
```

---

### Step 4: สร้าง Types File

**File**: `collections/product/types.ts`

```typescript
import { ProductDocument } from "./schema";
import { CreateRxDocument, CreateRxCollection } from "../../core/types/utils";

export interface RxProductMethods {
  findAll: () => Promise<RxProductDocument[]>;
  findById: (id: string) => Promise<RxProductDocument | null>;
  create: (product: ProductDocument) => Promise<RxProductDocument>;
  update: (product: ProductDocument) => Promise<RxProductDocument>;
}

export type RxProductDocument = CreateRxDocument<ProductDocument, RxProductMethods>;
export type RxProductCollection = CreateRxCollection<ProductDocument, RxProductMethods>;
```

---

### Step 5: สร้าง Query Builder (Optional, for GraphQL)

**File**: `collections/product/query-builder.ts`

```typescript
// GraphQL Mutation สำหรับ Push Product
export const PUSH_PRODUCT_MUTATION = `
  mutation PushProduct($writeRows: [ProductInputPushRow!]!) {
    pushProduct(input: $writeRows) {
      id
      name
      price
      server_created_at
      server_updated_at
      client_created_at
      client_updated_at
    }
  }
`;

// GraphQL Query สำหรับ Pull Product
export const PULL_PRODUCT_QUERY = `
  query PullProduct($input: ProductPull!) {
    pullProduct(input: $input) {
      documents {
        id
        name
        price
        client_created_at
        client_updated_at
        server_created_at
        server_updated_at
        deleted
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;

// GraphQL Subscription สำหรับ Stream Product (Real-time)
export const STREAM_PRODUCT_SUBSCRIPTION = `
  subscription StreamProduct {
    streamProduct {
      documents {
        id
        name
        price
        client_created_at
        client_updated_at
        server_created_at
        server_updated_at
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;
```

---

### Step 6: สร้าง Facade Service (Optional)

**File**: `collections/product/facade.service.ts`

```typescript
import { Injectable, computed, signal } from "@angular/core";
import { ProductDocument } from "./schema";
import { BaseFacadeService } from "../../core/base-facade.service";
import { COLLECTION_NAMES } from "../../core/collection-registry";

@Injectable({
  providedIn: "root",
})
export class ProductService extends BaseFacadeService<ProductDocument> {
  private _products = signal<ProductDocument[]>([]);
  public readonly products = this._products.asReadonly();

  // Computed signals
  public readonly productsByCategory = computed(() => {
    const products = this._products();
    const grouped = new Map<string, ProductDocument[]>();
    products.forEach((product) => {
      const category = product.category || "uncategorized";
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(product);
    });
    return grouped;
  });

  constructor() {
    super();
    this.ensureInitialized();
  }

  protected getCollectionName(): string {
    return COLLECTION_NAMES.PRODUCT;
  }

  protected setupSubscriptions(): void {
    const collection = this.collection;
    if (!collection) {
      console.warn("Product collection not ready");
      return;
    }

    const subscription = collection.find$().subscribe({
      next: (products) => {
        this._products.set(products as ProductDocument[]);
      },
      error: (error) => {
        console.error("Error in product subscription:", error);
      },
    });

    this.addSubscription(subscription);
  }

  async findAll(): Promise<ProductDocument[]> {
    const collection = this.collection;
    if (!collection) {
      throw new Error("Product collection not available");
    }
    return (await collection.find()) as ProductDocument[];
  }

  async findById(id: string): Promise<ProductDocument | null> {
    const collection = this.collection;
    if (!collection) {
      return null;
    }
    return (await collection.findOne(id)) as ProductDocument | null;
  }

  async create(product: ProductDocument): Promise<ProductDocument> {
    const collection = this.collection;
    if (!collection) {
      throw new Error("Product collection not available");
    }
    return (await collection.insert(product)) as ProductDocument;
  }

  async update(id: string, updates: Partial<ProductDocument>): Promise<ProductDocument> {
    const collection = this.collection;
    if (!collection) {
      throw new Error("Product collection not available");
    }
    return (await collection.update(id, updates)) as ProductDocument;
  }
}
```

---

### Step 7: สร้าง Replication Service (Optional)

**File**: `collections/product/replication.service.ts`

```typescript
import { Injectable } from "@angular/core";
import { replicateGraphQL } from "rxdb/plugins/replication-graphql";
import { RxGraphQLReplicationState } from "rxdb/plugins/replication-graphql";
import { RxCollection } from "rxdb";
import { NetworkStatusService } from "../../network-status.service";
import { BaseReplicationService } from "../../core/base-replication.service";
import { ProductDocument } from "./schema";
import { PUSH_PRODUCT_MUTATION, PULL_PRODUCT_QUERY, STREAM_PRODUCT_SUBSCRIPTION } from "./query-builder";
import { ReplicationConfig } from "../../core/adapter";
import { ReplicationConfigBuilder, ReplicationConfigOptions } from "../../core/replication-config-builder";

@Injectable({
  providedIn: "root",
})
export class ProductReplicationService extends BaseReplicationService<ProductDocument> {
  constructor(networkStatus: NetworkStatusService) {
    super(networkStatus);
    this.collectionName = "product";
  }

  protected buildReplicationConfig(): ReplicationConfig & Record<string, any> {
    const options: ReplicationConfigOptions = {
      collectionName: "product",
      replicationId: this.replicationIdentifier,
      batchSize: 10,
      pullQueryBuilder: (checkpoint, limit) => {
        return {
          query: PULL_PRODUCT_QUERY,
          variables: {
            input: {
              checkpoint: ReplicationConfigBuilder.buildCheckpointInput(checkpoint),
              limit: limit || 10,
            },
          },
        };
      },
      streamQueryBuilder: (headers) => {
        return {
          query: STREAM_PRODUCT_SUBSCRIPTION,
          variables: {},
        };
      },
      responseModifier: ReplicationConfigBuilder.createResponseModifier(["pullProduct", "streamProduct"]),
      pullModifier: (doc) => doc,
      pushQueryBuilder: (docs) => {
        const writeRows = docs.map((docRow) => {
          const doc = docRow.newDocumentState;
          return {
            newDocumentState: {
              id: doc.id,
              name: doc.name,
              price: doc.price,
              client_created_at: doc.client_created_at || Date.now().toString(),
              client_updated_at: doc.client_updated_at || Date.now().toString(),
              server_created_at: doc.server_created_at,
              server_updated_at: doc.server_updated_at,
              deleted: docRow.assumedMasterState === null,
            },
          };
        });
        return {
          query: PUSH_PRODUCT_MUTATION,
          variables: {
            writeRows,
          },
        };
      },
      pushDataPath: "data.pushProduct",
      pushModifier: (doc) => doc,
    };

    return ReplicationConfigBuilder.buildBaseConfig(options);
  }

  protected async setupReplication(collection: RxCollection): Promise<RxGraphQLReplicationState<ProductDocument, any> | undefined> {
    console.log("Setting up Product GraphQL replication...");
    if (!this.networkStatus.isOnline()) {
      console.log("⚠️ Application is offline - replication setup skipped");
      return undefined;
    }

    const config = this.buildReplicationConfig() as any;
    this.replicationState = replicateGraphQL<ProductDocument, any>({
      collection: collection as any,
      ...config,
    });

    if (this.replicationState) {
      this.replicationState.error$.subscribe((error) => {
        console.warn("⚠️ Product Replication error:", error);
      });

      this.replicationState.received$.subscribe((received) => {
        console.log("✅ Product Replication received:", received);
      });
    }

    return this.replicationState;
  }
}
```

---

### Step 8: สร้าง Index File

**File**: `collections/product/index.ts`

```typescript
/**
 * Product Collection
 *
 * This module exports all components of the product collection:
 * - Schema definitions
 * - RxDB types
 * - Facade service (ProductService)
 * - Replication service
 * - Query builders (GraphQL)
 */

// Schema
export * from "./schema";

// Types
export * from "./types";

// Services
export { ProductService } from "./facade.service";
export { ProductReplicationService } from "./replication.service";

// Query builders
export * from "./query-builder";
```

---

### Step 9: อัพเดต Database Types

**File**: `src/app/core/Database/core/types/database.types.ts`

```typescript
import { RxProductCollection } from "../../collections/product/types";

export interface RxTxnsCollections {
  // ... existing collections
  product: RxProductCollection;
}
```

---

### Step 10: อัพเดต getAdapterSchemas

**File**: `src/app/core/Database/core/adapters/rxdb/rxdb-helpers.ts`

```typescript
import { PRODUCT_SCHEMA_ADAPTER } from "../../../collections/product/schema";

export function getAdapterSchemas(): SchemaDefinition[] {
  return [
    // ... existing schemas
    PRODUCT_SCHEMA_ADAPTER,
  ];
}
```

และอัพเดต `collectionsSettings`:

```typescript
import { PRODUCT_SCHEMA } from "../../../collections/product/schema";

export const collectionsSettings = {
  // ... existing collections
  product: {
    schema: PRODUCT_SCHEMA as any,
  },
};
```

---

### Step 11: อัพเดต Database Service (if using replication)

**File**: `src/app/core/Database/database.service.ts`

เพิ่ม import และ case ใน switch:

```typescript
import { ProductReplicationService } from './collections/product';

// In initializeReplicationServices function:
case 'product':
  service = new ProductReplicationService(networkStatusService);
  break;
```

---

## 📂 โครงสร้างไฟล์ใหม่

หลังจากเพิ่ม collection ใหม่ โครงสร้างจะเป็นแบบนี้:

```
src/app/core/Database/
├── core/                          # Shared/base classes
│   ├── base-facade.service.ts
│   ├── base-replication.service.ts
│   ├── replication-config-builder.ts
│   ├── collection-registry.ts     # เพิ่ม entry ที่นี่
│   ├── adapter/
│   ├── adapters/
│   └── types/
│       └── database.types.ts      # เพิ่ม type ที่นี่
├── collections/                   # Table-based organization
│   ├── txn/
│   ├── device-monitoring/
│   ├── device-monitoring-history/
│   └── product/                    # ใหม่!
│       ├── schema.ts
│       ├── types.ts
│       ├── facade.service.ts
│       ├── replication.service.ts
│       ├── query-builder.ts
│       └── index.ts
└── database.service.ts            # เพิ่ม replication service ที่นี่
```

---

## 🎯 Checklist

- [ ] **Register collection** in `core/collection-registry.ts`
- [ ] **สร้าง folder** `collections/{table-name}/`
- [ ] สร้าง **schema.ts** และ export `*_SCHEMA_ADAPTER`
- [ ] สร้าง **types.ts**
- [ ] สร้าง **query-builder.ts** (optional, if using GraphQL)
- [ ] สร้าง **facade.service.ts** (optional)
- [ ] สร้าง **replication.service.ts** (optional)
- [ ] สร้าง **index.ts**
- [ ] อัพเดต **database.types.ts** (เพิ่ม collection type)
- [ ] อัพเดต **rxdb-helpers.ts** (เพิ่ม schema adapter)
- [ ] อัพเดต **database.service.ts** (if using replication)
- [ ] Test การใช้งาน

---

## 📝 ตัวอย่างการใช้งาน

```typescript
// ใน Component
import { ProductService } from "../core/Database/collections/product";

export class SomeComponent {
  private productService = inject(ProductService);

  async ngOnInit() {
    // Get all products (reactive via signals)
    const products = this.productService.products(); // Signal

    // Create new product
    await this.productService.create({
      id: "prod-1",
      name: "iPhone 15",
      price: 29900,
      description: "Latest iPhone",
      category: "electronics",
      client_created_at: Date.now().toString(),
      client_updated_at: Date.now().toString(),
    });

    // Update product
    await this.productService.update("prod-1", { price: 25900 });
  }
}
```

---

## 🆕 สิ่งที่เปลี่ยนแปลงจากโครงสร้างเก่า

### ✅ โครงสร้างใหม่ (Table-Based):

- ✅ **Self-contained collections**: ทุกไฟล์ใน folder เดียว
- ✅ **ง่ายต่อการเพิ่ม**: แค่สร้าง folder + ไฟล์ทั้งหมด
- ✅ **จัดการง่าย**: หาไฟล์ได้ในที่เดียว
- ✅ **Team-friendly**: ไม่ conflict กัน

### ❌ โครงสร้างเก่า (Function-Based):

- ❌ ไฟล์กระจายอยู่ในหลาย folder (schema/, facade/, replication/, types/)
- ❌ หาไฟล์ยากเมื่อมีหลาย table
- ❌ ต้องอัพเดตหลายไฟล์เมื่อเพิ่ม table

---

## ⚠️ ข้อควรระวัง

1. **Collection Registry**: ต้องลงทะเบียน collection ก่อน (Step 1)
2. **Schema Adapter**: ต้อง export `*_SCHEMA_ADAPTER` สำหรับ adapter system
3. **Types**: ต้อง sync types ให้ถูกต้องระหว่าง schema และ RxDB types
4. **Collection Names**: ใช้ `COLLECTION_NAMES` constant จาก registry (type-safe)
5. **Import Paths**: ใช้ relative paths จาก collections folder

---

## 💡 Tips

- ดูตัวอย่างแบบเต็มที่ `src/app/core/Database/templates/collection.template.ts`
- ใช้ `BaseFacadeService` เพื่อลด boilerplate
- ใช้ `ReplicationConfigBuilder` เพื่อลด duplicate config code
- Collection registry เป็น single source of truth - ตรวจสอบที่นี่ก่อน
- Test ทีละ step

---

## 📚 เอกสารอ้างอิง

- **Developer Guide**: `src/app/core/Database/document/DEVELOPER_GUIDE.md`
- **Collection Template**: `src/app/core/Database/templates/collection.template.ts`
- [RxDB Documentation](https://rxdb.info/)
- [Angular Signals](https://angular.io/guide/signals)

---

**Last Updated**: 2025-01-XX
**Version**: 3.0 (Table-Based Organization)
