import { Capacitor } from '@capacitor/core';
import { getRxStorageSQLiteTrial } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsCapacitor } from 'rxdb/plugins/storage-sqlite';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { addRxPlugin } from 'rxdb/plugins/core';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';

const sqlite = new SQLiteConnection(CapacitorSQLite);

export const environment = {
  production: false,
  apiUrl: 'http://localhost:3001/graphql',
  wsUrl: 'ws://localhost:3001/graphql',
  databaseName: 'kiosk_prod',
  multiInstance: false,
  clientType: 'DOOR',

  addRxDBPlugins() {
    addRxPlugin(RxDBUpdatePlugin);
    addRxPlugin(RxDBCleanupPlugin);
  },
  getRxStorage() {
    // Check if running on native platform
    if (Capacitor.isNativePlatform()) {
      return getRxStorageSQLiteTrial({
        sqliteBasics: getSQLiteBasicsCapacitor(sqlite, CapacitorSQLite),
      });
    } else {
      // Use IndexedDB for web platform
      return getRxStorageDexie();
    }
  },
};
