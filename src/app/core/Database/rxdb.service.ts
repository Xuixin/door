import { Injector, Injectable, Signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { BehaviorSubject } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TXN_SCHEMA, HANDSHAKE_SCHEMA } from '../schema';

import { RxReactivityFactory, createRxDatabase } from 'rxdb/plugins/core';

import { RxTxnsCollections, RxTxnsDatabase } from './RxDB.D';
import {
  TransactionReplicationService,
  HandshakeReplicationService,
} from './replication';
import { NetworkStatusService } from './network-status.service';
import { DoorPreferenceService } from '../../services/door-preference.service';

environment.addRxDBPlugins();

const collectionsSettings = {
  txn: {
    schema: TXN_SCHEMA as any,
  },
  handshake: {
    schema: HANDSHAKE_SCHEMA as any,
  },
};

let GLOBAL_DB_SERVICE: DatabaseService | undefined;

let DB_INSTANCE: RxTxnsDatabase | undefined;

async function _create(
  injector: Injector,
  doorId: string,
): Promise<RxTxnsDatabase> {
  environment.addRxDBPlugins();

  const databaseName = `door-${doorId}`;
  console.log(`DatabaseService: creating database: ${databaseName}`);

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
    name: databaseName,
    storage: environment.getRxStorage(),
    multiInstance: environment.multiInstance,
    reactivity: reactivityFactory,
  })) as RxTxnsDatabase;

  console.log(`DatabaseService: created database: ${databaseName}`);

  if (environment.multiInstance) {
    db.waitForLeadership().then(() => {
      console.log('isLeader now');
      document.title = '♛ ' + document.title;
    });
  }

  console.log('DatabaseService: create collections');

  await db.addCollections(collectionsSettings);

  console.log('DatabaseService: collections created');

  return db;
}

@Injectable()
export class DatabaseService {
  private transactionReplicationService?: TransactionReplicationService;
  private handshakeReplicationService?: HandshakeReplicationService;
  private networkStatusService?: NetworkStatusService;

  // State management
  private _isReady = false;
  private _isInitializing = false;
  private _currentDoorId?: string;
  public initState$ = new BehaviorSubject<
    'idle' | 'initializing' | 'ready' | 'error'
  >('idle');

  constructor(private injector: Injector) {
    GLOBAL_DB_SERVICE = this;
  }

  setReplicationService(service: TransactionReplicationService) {
    this.transactionReplicationService = service;
  }

  setHandshakeReplicationService(service: HandshakeReplicationService) {
    this.handshakeReplicationService = service;
  }

  get db(): RxTxnsDatabase {
    if (!DB_INSTANCE || !this._isReady) {
      throw new Error('Database not initialized. Please select a door first.');
    }
    return DB_INSTANCE;
  }

  get isInitialized(): boolean {
    return this._isReady;
  }

  get isInitializing(): boolean {
    return this._isInitializing;
  }

  get currentDoorId(): string | undefined {
    return this._currentDoorId;
  }

  /**
   * Initialize database with door ID
   */
  async initialize(doorId: string): Promise<void> {
    // Check if already initializing
    if (this._isInitializing) {
      throw new Error('Database initialization already in progress');
    }

    // Check if already initialized with same door
    if (this._isReady && this._currentDoorId === doorId) {
      console.log('Database already initialized with same door ID');
      return;
    }

    this._isInitializing = true;
    this.initState$.next('initializing');

    try {
      console.log(`🚀 Initializing database for door: ${doorId}`);

      // Create database
      const db = await _create(this.injector, doorId);
      DB_INSTANCE = db;

      // Create replication services
      this.networkStatusService = new NetworkStatusService();

      const transactionReplicationService = new TransactionReplicationService(
        this.networkStatusService,
        this.injector.get(DoorPreferenceService),
      );
      const handshakeReplicationService = new HandshakeReplicationService(
        this.networkStatusService,
        this.injector.get(DoorPreferenceService),
        this,
      );

      // Set replication services
      this.setReplicationService(transactionReplicationService);
      this.setHandshakeReplicationService(handshakeReplicationService);

      // Register replications
      const txnReplication =
        await transactionReplicationService.register_replication(
          db.txn as any,
          'txn-graphql-replication',
        );

      const handshakeReplication =
        await handshakeReplicationService.register_replication(
          db.handshake as any,
          'handshake-graphql-replication',
        );

      if (txnReplication) {
        console.log('DatabaseService: Transaction replication started');
      } else {
        console.log(
          'DatabaseService: Transaction replication not started (offline or error)',
        );
      }

      if (handshakeReplication) {
        console.log('DatabaseService: Handshake replication started');
      } else {
        console.log(
          'DatabaseService: Handshake replication not started (offline or error)',
        );
      }

      // Mark as ready
      this._isReady = true;
      this._currentDoorId = doorId;
      this.initState$.next('ready');

      console.log(`✅ Database initialized successfully for door: ${doorId}`);
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      this._isReady = false;
      this._currentDoorId = undefined;
      this.initState$.next('error');
      throw error;
    } finally {
      this._isInitializing = false;
    }
  }

  /**
   * Destroy database and clean up resources
   */
  async destroy(): Promise<void> {
    // Check if not initialized
    if (!this._isReady) {
      console.log('Database not initialized, nothing to destroy');
      return;
    }

    // Check if initializing
    if (this._isInitializing) {
      throw new Error('Cannot destroy database while initializing');
    }

    try {
      console.log('🗑️ Destroying database...');

      // Stop replication first (critical order)
      await this.stopReplication();

      // Wait a bit for replication to fully stop
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Destroy database
      if (DB_INSTANCE) {
        await DB_INSTANCE.remove();
        console.log('Database removed from IndexedDB');
      }

      // Reset state
      DB_INSTANCE = undefined;
      this._isReady = false;
      this._currentDoorId = undefined;
      this.initState$.next('idle');

      console.log('✅ Database destroyed successfully');
    } catch (error) {
      console.error('❌ Error destroying database:', error);
      throw error;
    }
  }

  /**
   * หยุด replication ทั้งหมด
   */
  async stopReplication() {
    if (this.transactionReplicationService) {
      await this.transactionReplicationService.stopReplication();
      console.log('Transaction replication stopped');
    }

    if (this.handshakeReplicationService) {
      await this.handshakeReplicationService.stopReplication();
      console.log('Handshake replication stopped');
    }

    // Unsubscribe from network status
    if (this.transactionReplicationService) {
      (this.transactionReplicationService as any).ngOnDestroy?.();
    }
    if (this.handshakeReplicationService) {
      (this.handshakeReplicationService as any).ngOnDestroy?.();
    }

    console.log('All GraphQL replications stopped');
  }

  /**
   * เช็คสถานะการเชื่อมต่อ
   */
  getOnlineStatus(): boolean {
    const txnStatus =
      this.transactionReplicationService?.getOnlineStatus() ?? false;
    const handshakeStatus =
      this.handshakeReplicationService?.getOnlineStatus() ?? false;
    return txnStatus || handshakeStatus;
  }
}
