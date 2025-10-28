# คู่มือการเพิ่ม RxDB Table ใหม่

เอกสารนี้จะอธิบายขั้นตอนการเพิ่ม RxDB table ใหม่ในระบบ kiosk

## 📋 Overview

เมื่อต้องการเพิ่ม table ใหม่ จำเป็นต้องทำตามลำดับดังนี้:

1. ✅ สร้าง **Schema** - กำหนดโครงสร้างข้อมูล
2. ✅ อัพเดต **RxDB.D.ts** - เพิ่ม Type definitions
3. ✅ อัพเดต **rxdb.service.ts** - เพิ่ม collection
4. ✅ สร้าง **Replication Service** (ถ้าต้องการ sync กับ server)
5. ✅ สร้าง **Facade Service** - เรียกใช้งานจาก UI
6. ✅ สร้าง **Query Builder** (ถ้าต้องการ GraphQL queries)

---

## 📝 Step-by-Step Guide

### Step 1: สร้าง Schema

สร้างไฟล์ schema ใหม่ใน `src/app/core/schema/`

**ตัวอย่าง: สร้าง `product.schema.ts`**

```typescript
import { RxJsonSchema, toTypedRxJsonSchema, ExtractDocumentTypeFromTypedRxJsonSchema } from "rxdb";

export const PRODUCT_SCHEMA_LITERAL = {
  title: "Product",
  description: "Product schema",
  version: 0,
  primaryKey: "id",
  keyCompression: false,
  type: "object",
  properties: {
    id: { type: "string", primary: true, maxLength: 100 },
    name: { type: "string", maxLength: 200 },
    price: { type: "number" },
    description: { type: "string", maxLength: 1000 },
    category: { type: "string", maxLength: 50 },
    created_at: { type: "string", maxLength: 20 },
    updated_at: { type: "string", maxLength: 20 },
  },
  required: ["id", "name", "price", "created_at"],
};

export const productSchema = toTypedRxJsonSchema(PRODUCT_SCHEMA_LITERAL);

export type RxProductDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productSchema>;

export const PRODUCT_SCHEMA: RxJsonSchema<RxProductDocumentType> = PRODUCT_SCHEMA_LITERAL;
```

---

### Step 2: อัพเดต RxDB.D.ts

เพิ่ม Type definitions ใน `src/app/core/Database/RxDB.D.ts`

```typescript
import type { RxDocument, RxCollection, RxDatabase } from "rxdb";
import { RxTxnDocumentType } from "../schema/txn.schema";
import { RxProductDocumentType } from "../schema/product.schema"; // เพิ่มบรรทัดนี้
import { Signal } from "@angular/core";

// 1. เพิ่ม ORM methods
type RxProductMethods = {
  findAll: () => Promise<RxProductDocument[]>;
  findById: (id: string) => Promise<RxProductDocument | null>;
  create: (product: RxProductDocumentType) => Promise<RxProductDocument>;
  update: (product: RxProductDocumentType) => Promise<RxProductDocument>;
};

// 2. เพิ่ม Document Type
export type RxProductDocument = RxDocument<RxProductDocumentType, RxProductMethods>;

// 3. เพิ่ม Collection Type
export type RxProductCollection = RxCollection<RxProductDocumentType, RxProductMethods, unknown, unknown, Signal<unknown>>;

// 4. อัพเดต Collections Type
export type RxTxnsCollections = {
  txn: RxTxnCollection;
  product: RxProductCollection; // เพิ่มบรรทัดนี้
};

// rxdb.service.ts จะใช้ RxTxnsDatabase ซึ่งมี collections ทั้งหมด
```

---

### Step 3: อัพเดต rxdb.service.ts

เพิ่ม collection ใน `src/app/core/Database/rxdb.service.ts`

```typescript
import { TXN_SCHEMA } from "../schema/txn.schema";
import { PRODUCT_SCHEMA } from "../schema/product.schema"; // เพิ่มบรรทัดนี้

const collectionsSettings = {
  txn: {
    schema: TXN_SCHEMA as any,
  },
  product: {
    // เพิ่ม collection ใหม่
    schema: PRODUCT_SCHEMA as any,
  },
};

// ส่วน replication (ถ้าต้องการ)
async function _create(injector: Injector): Promise<RxTxnsDatabase> {
  // ... existing code ...
  // ถ้าต้องการ replication สำหรับ product
  // ให้เพิ่ม code นี้ในส่วน initDatabase
}
```

---

### Step 4: สร้าง Replication Service (Optional)

**ถ้าต้องการ sync กับ server** ให้สร้าง replication service

สร้างไฟล์ `src/app/core/D/router-replication/product-replication.service.ts`

````typescript
import { Injectable } from '@angular/core';
import { replicateGraphQL } from 'rxdb/plugins/replication-graphql';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { RxCollection } from 'rxdb';
import { RxProductCollection } from '../RxDB.D';
import { RxProductDocumentType } from '../../schema/product.schema';
import { environment } from 'src/environments/environment';
import { NetworkStatusService } from '../network-status.service';
import { BaseReplicationService } from './base-replication.service';
import {
  PUSH_PRODUCT_MUTATION,
  PULL_PRODUCT_QUERY,
  STREAM_PRODUCT_SUBSCRIPTION,
} from '../query-builder/product-query-builder';

@Injectable({
  providedIn: 'root',
})
export class ProductReplicationService extends BaseReplicationService<RxProductDocumentType> {
  Generated fields
}

---

### Step 5: สร้าง Facade Service

สร้างไฟล์ `src/app/core/Database/facade/product.service.ts`

```typescript
import { Injectable, signal, computed, inject, OnDestroy } from '@angular/core';
import { DatabaseService } from '../rxdb.service';
import { ProductReplicationService } from '../replication/product-replication.service';
import { Subscription } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class ProductService implements OnDestroy {
  private readonly databaseService = inject(DatabaseService);
  private readonly replicationService = inject(ProductReplicationService);
  private dbSubscription?: Subscription;
  private replicationSubscription?: Subscription;

  // Signals for reactive data
  private _products = signal<any[]>([]);
  public readonly products = this._products.asReadonly();

  constructor() {
    setTimeout(() => {
      this.setupSubscriptions();
    }, 2000);
  }

  ngOnDestroy() {
    this.dbSubscription?.unsubscribe();
    this.replicationSubscription?.unsubscribe();
  }

  private setupSubscriptions() {
    // Subscribe to local database changes
    this.dbSubscription = this.databaseService.db.product.find().$.subscribe({
      next: (products) => {
        this._products.set(products);
      },
      error: (error) => {
        console.error('❌ Error in database subscription:', error);
      },
    });

    // Subscribe to replication if available
    if (this.replicationService.replicationState) {
      this.replicationSubscription =
        this.replicationService.replicationState.received$.subscribe({
          next: () => {
            this.refreshProducts();
          },
          error: (error) => {
            console.error('❌ Error in replication subscription:', error);
          },
        });
    }
  }

  async findAll() {
    const products = await this.databaseService.db.product.find().exec();
    this._products.set(products);
    return products;
  }

  async findById(id: string) {
    return await this.databaseService.db.product
      .findOne({ selector: { id } } as any)
      .exec();
  }

  async create(product: any) {
    return await this.databaseService.db.product.insert(product);
  }

  async update(id: string, updates: Partial<any>) {
    const product = await this.databaseService.db.product
      .findOne({ selector: { id } } as any)
      .exec();

    if (product) {
      await (product as any).update(updates);
      return product;
    }
    throw new Error('Product not found');
  }

  async delete(id: string) {
    const product = await this.databaseService.db.product
      .findOne({ selector: { id } } as any)
      .exec();

    if (product) {
      await (product as any).remove();
      return true;
    }
    throw new Error('Product not found');
  }

  async refreshProducts() {
    const products = await this.databaseService.db.product.find().exec();
    this._products.set(products);
    return products;
  }
}
````

---

### Step 6: สร้าง Query Builder (Optional)

**ถ้าต้องการ GraphQL queries** ให้สร้าง query builder

สร้างไฟล์ `src/app/core/Database/query-builder/product-query-builder.ts`

```typescript
export const PULL_PRODUCT_QUERY = `
  query PullProduct($input: PullProductInput!) {
    pullProduct(input: $input) {
      documents {
        id
        name
        price
        description
        category
        created_at
        updated_at
      }
      checkpoint {
        id
        server_updated_at
      }
    }
  }
`;

export const PUSH_PRODUCT_MUTATION = `
  mutation PushProduct($writeRows: [ProductInput!]!) {
    pushProduct(writeRows: $writeRows) {
      id
    }
  }
`;

export const STREAM_PRODUCT_SUBSCRIPTION = `
  subscription StreamProduct {
    streamProduct2 {
      documents {
        id
        name
        price
        description
        category
        created_at
        updated_at
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

## 📂 โครงสร้างไฟล์

หลังจากเพิ่ม table ใหม่ โครงสร้างควรเป็นแบบนี้:

```
src/app/core/
├── Database/
│   ├── facade/
│   │   ├── transaction.service.ts
│   │   └── product.service.ts          ← ใหม่
│   ├── replication/
│   │   ├── base-replication.service.ts
│   │   ├── transaction-replication.service.ts
│   │   └── product-replication.service.ts  ← ใหม่ (optional)
│   ├── query-builder/
│   │   ├── txn-query-builder.ts
│   │   └── product-query-builder.ts    ← ใหม่ (optional)
│   ├── network-status.service.ts
│   ├── rxdb.service.ts
│   └── RxDB.D.ts
└── schema/
    ├── txn.schema.ts
    └── product.schema.ts               ← ใหม่
```

---

## 🎯 Checklist

- [ ] สร้าง Schema (product.schema.ts)
- [ ] อัพเดต RxDB.D.ts (เพิ่ม types)
- [ ] อัพเดต rxdb.service.ts (เพิ่ม collection)
- [ ] สร้าง Replication Service (ถ้าต้องการ sync)
- [ ] สร้าง Facade Service (product.service.ts)
- [ ] สร้าง Query Builder (ถ้าต้องการ GraphQL)
- [ ] Test การใช้งาน

---

## 📝 ตัวอย่างการใช้งาน

```typescript
// ใน Component
import { ProductService } from "../core/Database/facade/product.service";

export class SomeComponent {
  private productService = inject(ProductService);

  async ngOnInit() {
    // Get all products
    const products = await this.productService.findAll();

    // Create new product
    await this.productService.create({
      id: "prod-1",
      name: "iPhone 15",
      price: 29900,
      description: "Latest iPhone",
      category: "electronics",
      created_at: Date.now().toString(),
    });

    // Update product
    await this.productService.update("prod-1", { price: 25900 });

    // Delete product
    await this.productService.delete("prod-1");
  }
}
```

---

## ⚠️ ข้อควรระวัง

1. **Primary Key**: ต้องกำหนด primary key ใน schema
2. **Required Fields**: ระบุ required fields ให้ชัดเจน
3. **Version**: Schema version เริ่มจาก 0 (ถ้าเปลี่ยน schema ต้องเพิ่ม version)
4. **Types**: ต้อง sync types ให้ถูกต้องระหว่าง schema และ RxDB.D.ts
5. **Migration**: ถ้าเปลี่ยน schema ในอนาคต ต้อง handle migration

---

## 🔄 Schema Versioning & Migration

หากต้องการเปลี่ยน schema ในอนาคต:

```typescript
// product.schema.ts
export const PRODUCT_SCHEMA_LITERAL = {
  // ...
  version: 1, // เพิ่ม version
  // ...
};

// ต้องสร้าง migration logic
```

---

## 💡 Tips

- ใช้ `@Injectable({ providedIn: 'root' })` เพื่อ singleton
- Signal-based reactive approach แนะนำใช้กับ Angular
- แยก concerns: Schema → Replication → Facade
- Test ทีละ step

---

## 📚 เอกสารอ้างอิง

- [RxDB Documentation](https://rxdb.info/)
- [Angular Signals](https://angular.io/guide/signals)
- [GraphQL Replication](https://rxdb.info/plugins/replication-graphql.html)

---

**Last Updated**: 2024
**Version**: 1.0
