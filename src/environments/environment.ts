import { Capacitor } from '@capacitor/core';
import { getRxStorageSQLiteTrial } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsCapacitor } from 'rxdb/plugins/storage-sqlite';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { addRxPlugin } from 'rxdb';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';

const sqlite = new SQLiteConnection(CapacitorSQLite);

export const environment = {
  production: false,
  apiUrl: 'http://localhost:10102/graphql',
  wsUrl: 'ws://localhost:10102/graphql',
  apiSecondaryUrl: 'http://localhost:3001/graphql',
  wsSecondaryUrl: 'ws://localhost:3001/graphql',
  databaseName: 'door_prod',
  multiInstance: false,
  clientType: 'door',
  adapterType: 'rxdb' as const, // Database adapter type: 'rxdb' | 'pouchdb' | 'watermelon' | 'server'

  serverId: 'server-111',
  serverName: 'server-mock',
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
