import { Capacitor } from '@capacitor/core';
import { getRxStorageSQLiteTrial } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsCapacitor } from 'rxdb/plugins/storage-sqlite';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { addRxPlugin } from 'rxdb';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
// import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'; // Disabled - requires Ajv validator

const sqlite = new SQLiteConnection(CapacitorSQLite);

export const environment = {
  production: false,
  apiUrl: 'http://localhost:10102/graphql',
  wsUrl: 'ws://localhost:10102/graphql',
  apiSecondaryUrl: 'http://localhost:3001/graphql',
  wsSecondaryUrl: 'ws://localhost:3001/graphql',
  databaseName: 'kiosk_prod',
  multiInstance: false,
  clientType: 'DOOR',
  adapterType: 'rxdb' as const, // Database adapter type: 'rxdb' | 'pouchdb' | 'watermelon' | 'server'

  serverName: 'Mini server',
  serverId: 'server-111',
  addRxDBPlugins() {
    addRxPlugin(RxDBCleanupPlugin);
    addRxPlugin(RxDBQueryBuilderPlugin);
    addRxPlugin(RxDBUpdatePlugin);
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
