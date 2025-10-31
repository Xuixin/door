import { Capacitor } from '@capacitor/core';
import { getRxStorageSQLiteTrial } from 'rxdb/plugins/storage-sqlite';
import { getSQLiteBasicsCapacitor } from 'rxdb/plugins/storage-sqlite';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { addRxPlugin } from 'rxdb/plugins/core';
import { RxDBUpdatePlugin } from 'rxdb/plugins/update';
import { RxDBCleanupPlugin } from 'rxdb/plugins/cleanup';
const sqlite = new SQLiteConnection(CapacitorSQLite);

export const environment = {
  production: true,
  apiUrl: 'http://localhost:10102/graphql',
  wsUrl: 'ws://localhost:10102/graphql',
  databaseName: 'kiosk_prod',
  multiInstance: false,
  clientType: 'DOOR',
  addRxDBPlugins() {
    addRxPlugin(RxDBUpdatePlugin);
    addRxPlugin(RxDBCleanupPlugin);
  },
  getRxStorage() {
    return getRxStorageSQLiteTrial({
      sqliteBasics: getSQLiteBasicsCapacitor(sqlite, Capacitor),
    });
  },
};
