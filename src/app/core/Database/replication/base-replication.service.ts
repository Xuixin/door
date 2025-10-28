import { Injectable } from '@angular/core';
import { RxCollection } from 'rxdb';
import { RxGraphQLReplicationState } from 'rxdb/plugins/replication-graphql';
import { NetworkStatusService } from '../network-status.service';
import { Subscription } from 'rxjs';

@Injectable()
export abstract class BaseReplicationService<T = any> {
  public replicationState?: RxGraphQLReplicationState<T, any>;
  protected collection?: RxCollection;
  protected networkSubscription?: Subscription;
  protected replicationIdentifier?: string;

  constructor(protected networkStatus: NetworkStatusService) {
    this.setupNetworkHandling();
  }

  private setupNetworkHandling() {
    this.networkSubscription = this.networkStatus.isOnline$.subscribe(
      (isOnline) => {
        if (isOnline) {
          this.handleOnline();
        } else {
          this.handleOffline();
        }
      },
    );
  }

  private async handleOnline() {
    console.log('🌐 Replication: Application is now online');

    if (this.collection && !this.replicationState) {
      console.log('🔄 Restarting replication after coming online...');
      try {
        await this.setupReplication(this.collection);
        console.log('✅ Replication restarted successfully');
      } catch (error) {
        console.error('❌ Failed to restart replication:', error);
      }
    }
  }

  private async handleOffline() {
    console.log(
      '⚠️ Replication: Application is now offline - stopping replication',
    );

    // Stop replication
    if (this.replicationState) {
      await this.replicationState.cancel();
      this.replicationState = undefined;
      console.log('✅ Replication stopped due to offline status');
    }
  }

  protected abstract setupReplication(
    collection: RxCollection,
  ): Promise<RxGraphQLReplicationState<T, any> | undefined>;

  /**
   * Register collection for replication without starting immediately
   * @param collection - The RxDB collection to replicate
   * @param identifier - Unique identifier for this replication
   */
  async register_replication(
    collection: RxCollection,
    identifier: string,
  ): Promise<RxGraphQLReplicationState<T, any> | undefined> {
    console.log(`Registering replication: ${identifier}`);

    this.collection = collection;
    this.replicationIdentifier = identifier;

    // Check if app is online before starting replication
    if (!this.networkStatus.isOnline()) {
      console.log('⚠️ Application is offline - replication setup skipped');
      console.log(
        '📝 Replication will start automatically when connection is restored',
      );
      return undefined;
    }

    // Start replication if online
    return await this.setupReplication(collection);
  }

  /**
   * Stop replication
   */
  async stopReplication() {
    if (this.replicationState) {
      await this.replicationState.cancel();
      this.replicationState = undefined;
      console.log('Replication stopped');
    }
  }

  /**
   * Clean up resources
   */
  ngOnDestroy() {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
    this.stopReplication();
  }

  /**
   * Check current online status
   */
  getOnlineStatus(): boolean {
    return this.networkStatus.isOnline();
  }
}
