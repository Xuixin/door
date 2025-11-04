import { Injector, Signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RxReactivityFactory, createRxDatabase } from 'rxdb/plugins/core';
import { environment } from '../../../../../../environments/environment';
import {
  TXN_SCHEMA,
  TXN_SCHEMA_ADAPTER,
} from '../../../collections/txn/schema';
import {
  DEVICE_MONITORING_SCHEMA,
  DEVICE_MONITORING_SCHEMA_ADAPTER,
} from '../../../collections/device-monitoring/schema';
import {
  DEVICE_MONITORING_HISTORY_SCHEMA,
  DEVICE_MONITORING_HISTORY_SCHEMA_ADAPTER,
} from '../../../collections/device-monitoring-history/schema';
import { SchemaDefinition } from '../../adapter';
import { RxTxnsCollections, RxTxnsDatabase } from '../../types/database.types';

export const DATABASE_NAME = 'kiosk_db';

/**
 * Get adapter-compatible schemas
 * Imports schema adapters directly from collection folders
 */
export function getAdapterSchemas(): SchemaDefinition[] {
  return [
    TXN_SCHEMA_ADAPTER,
    DEVICE_MONITORING_SCHEMA_ADAPTER,
    DEVICE_MONITORING_HISTORY_SCHEMA_ADAPTER,
  ];
}

/**
 * RxDB collection settings (used for backward compatibility)
 * Note: Collections are now managed by the adapter system
 */
export const collectionsSettings = {
  txn: {
    schema: TXN_SCHEMA as any,
  },
  device_monitoring: {
    schema: DEVICE_MONITORING_SCHEMA as any,
  },
  device_monitoring_history: {
    schema: DEVICE_MONITORING_HISTORY_SCHEMA as any,
  },
};

/**
 * Debug helper for RxDB (development only)
 * Usage: window.debugRxDB() in browser console
 * @deprecated Consider using AdapterProviderService for database access
 */
export function setupDebugRxDB(
  dbInstance: RxTxnsDatabase | undefined,
  globalDbService: any,
) {
  (window as any).debugRxDB = () => {
    console.log('DB_INSTANCE:', dbInstance);
    console.log('GLOBAL_DB_SERVICE:', globalDbService);
    if (dbInstance) {
      console.log('Collections:', Object.keys(dbInstance.collections));
      console.log('DeviceMonitoring collection:', dbInstance.device_monitoring);
      dbInstance.device_monitoring
        .find()
        .exec()
        .then((docs: any[]) => {
          console.log('Device monitoring records found:', docs.length);
          docs
            .filter((doc: any) => doc.type === 'DOOR')
            .forEach((doc: any) =>
              console.log('Door (DOOR type):', doc.toJSON()),
            );
        });
    }
  };
}

/**
 * @deprecated This function is no longer used.
 * Database initialization is now handled by AdapterProviderService via the adapter pattern.
 * Kept for reference only - will be removed in a future version.
 */
export async function _createRxDBDatabase(
  injector: Injector,
): Promise<RxTxnsDatabase> {
  environment.addRxDBPlugins();

  console.log('DatabaseService: creating database..');

  const reactivityFactory: RxReactivityFactory<Signal<any>> = {
    fromObservable(obs, initialValue: any) {
      return untracked(() =>
        toSignal(obs, {
          initialValue,
          injector,
        }),
      );
    },
  };

  const db = (await createRxDatabase<RxTxnsCollections>({
    name: DATABASE_NAME,
    storage: environment.getRxStorage(),
    multiInstance: environment.multiInstance,
    reactivity: reactivityFactory,
    cleanupPolicy: {
      minimumDeletedTime: 1000 * 60 * 5, // 5 minutes
      runEach: 1000 * 60 * 5, // 5 minutes
      waitForLeadership: true,
      awaitReplicationsInSync: true,
    },
  })) as RxTxnsDatabase;

  console.log('DatabaseService: created database');

  if (environment.multiInstance) {
    db.waitForLeadership().then(() => {
      console.log('isLeader now');
      document.title = '♛ ' + document.title;
    });
  }

  await db.addCollections(collectionsSettings);

  // เริ่ม replication อัตโนมัติ - จะถูกสร้างโดย DatabaseService
  console.log('DatabaseService: replication will be set up by DatabaseService');

  return db;
}
