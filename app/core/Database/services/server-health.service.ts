import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DatabaseService } from './database.service';
import { NetworkStatusService } from './network-status.service';
import { ReplicationCoordinatorService } from './replication-coordinator.service';

@Injectable({
  providedIn: 'root',
})
export class ServerHealthService {
  private ws: WebSocket | null = null;
  private reconnectTimer: Subscription | null = null;
  private readonly PRIMARY_WS_URL = environment.wsUrl;
  private readonly SECONDARY_WS_URL =
    environment.wsSecondaryUrl || environment.wsUrl;
  private readonly databaseService = inject(DatabaseService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly replicationCoordinator = inject(
    ReplicationCoordinatorService,
  );
  private isUsingSecondary = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  public readonly isOnline$ = new BehaviorSubject<boolean>(false);

  constructor(private zone: NgZone) {
    this.connect();
  }

  /** เปิดการเชื่อมต่อ */
  private connect() {
    // Check if already connected/connecting
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      console.log('⏭️ [ServerHealth] Already connected/connecting');
      return;
    }

    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
    }

    // Use primary server by default, or secondary if primary failed
    const wsUrl = this.isUsingSecondary
      ? this.SECONDARY_WS_URL
      : this.PRIMARY_WS_URL;

    console.log(
      `🔌 [ServerHealth] Connecting to ${this.isUsingSecondary ? 'SECONDARY' : 'PRIMARY'} server: ${wsUrl}`,
    );

    // Create WebSocket with GraphQL transport protocol
    this.ws = new WebSocket(wsUrl, 'graphql-transport-ws');

    this.ws.onopen = () => {
      this.zone.run(() => {
        console.log(
          `🟢 [ServerHealth] ${this.isUsingSecondary ? 'SECONDARY' : 'PRIMARY'} WS connected`,
        );

        try {
          this.ws?.send(
            JSON.stringify({
              type: 'connection_init',
              payload: {},
            }),
          );
          console.log('✅ [ServerHealth] Sent connection_init');
        } catch (error) {
          console.error(
            '❌ [ServerHealth] Error sending connection_init:',
            error,
          );
        }

        this.isOnline$.next(true);
        this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('📨 [ServerHealth] Message received:', msg);

        if (msg.type === 'connection_ack') {
          console.log('✅ [ServerHealth] Server ACK: connection established!');
          this.zone.run(() => {
            this.isOnline$.next(true);
          });
        }
      } catch (error) {
        console.log('⚠️ [ServerHealth] Error parsing message:', error);
      }
    };

    this.ws.onclose = (event) => {
      this.zone.run(() => {
        console.log(
          `🔴 [ServerHealth] ${this.isUsingSecondary ? 'SECONDARY' : 'PRIMARY'} WS disconnected`,
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          },
        );
        this.isOnline$.next(false);

        // If primary server disconnected, switch to secondary
        if (!this.isUsingSecondary) {
          console.log(
            '🔄 [ServerHealth] Primary server disconnected, switching to secondary...',
          );
          this.handlePrimaryDisconnect();
        } else {
          // If secondary also disconnected, cancel all replications
          console.log(
            '⚠️ [ServerHealth] Secondary server also disconnected, both servers are down!',
          );
          this.handleBothServersDown();
        }
      });
    };

    this.ws.onerror = (err) => {
      console.log('⚠️ [ServerHealth] WS error:', err);
      this.zone.run(() => {
        this.isOnline$.next(false);
      });
      // WebSocket will call onclose automatically on error
    };
  }

  /**
   * Handle primary server disconnect - delegate to coordinator
   */
  private async handlePrimaryDisconnect(): Promise<void> {
    try {
      // Check if ClientHealthService is already handling offline state
      // If network is offline, ClientHealthService will handle replication stopping
      if (!this.networkStatus.isOnline()) {
        console.log(
          '⏭️ [ServerHealth] Network is offline, ClientHealthService will handle replication stopping',
        );
        // Still update flag and try to connect to secondary
        this.isUsingSecondary = true;
        setTimeout(() => {
          this.connect();
        }, 1000);
        return;
      }

      // Delegate to coordinator
      console.log(
        '🔄 [ServerHealth] Primary server disconnected - delegating to coordinator...',
      );
      await this.replicationCoordinator.handlePrimaryServerDown();

      // Check if replications were stopped (both servers down)
      // If stopped, don't try to reconnect - wait for manual start
      if (this.replicationCoordinator.isReplicationsStopped()) {
        console.log(
          '⏸️ [ServerHealth] Replications stopped (both servers down), not connecting to secondary',
        );
        // Update flag but don't connect
        this.isUsingSecondary = true;
        // Cancel any pending reconnect
        this.reconnectTimer?.unsubscribe();
        this.reconnectTimer = null;
        return;
      }

      // Secondary server is available, update flag and connect
      this.isUsingSecondary = true;

      // Try to connect to secondary server
      setTimeout(() => {
        this.connect();
      }, 1000); // Wait 1 second before reconnecting
    } catch (error: any) {
      console.error(
        '❌ [ServerHealth] Error handling primary disconnect:',
        error.message,
      );
      // Still try to reconnect
      this.scheduleReconnect();
    }
  }

  /**
   * Handle when both primary and secondary servers are down
   * Delegate to coordinator
   * Stop reconnecting when both servers are down - replications are stopped
   */
  private async handleBothServersDown(): Promise<void> {
    console.log(
      '🛑 [ServerHealth] Both servers are down - delegating to coordinator...',
    );

    await this.replicationCoordinator.handleBothServersDown();

    // Cancel any pending reconnect attempts
    this.reconnectTimer?.unsubscribe();
    this.reconnectTimer = null;

    // Don't schedule reconnect - wait for manual start or server recovery
    console.log(
      '⏸️ [ServerHealth] Reconnection stopped - waiting for manual start or server recovery',
    );
  }

  /**
   * Schedule reconnection attempt
   * Only schedule if not at max attempts and replications are not stopped
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log(
        `❌ [ServerHealth] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
      );
      // Cancel any pending reconnect
      this.reconnectTimer?.unsubscribe();
      this.reconnectTimer = null;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000); // Exponential backoff, max 10s

    console.log(
      `⏳ [ServerHealth] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`,
    );

    // Cancel existing timer if any
    this.reconnectTimer?.unsubscribe();

    // Use setTimeout wrapped in subscription for cleanup
    const timeoutId = setTimeout(() => {
      this.reconnectTimer?.unsubscribe();
      this.reconnectTimer = null;
      this.connect();
    }, delay);

    // Create a subscription that will cancel the timeout on unsubscribe
    this.reconnectTimer = new Subscription(() => {
      clearTimeout(timeoutId);
    });
  }

  /**
   * Try to reconnect to primary server (if currently using secondary)
   */
  public async tryReconnectToPrimary(): Promise<void> {
    if (!this.isUsingSecondary) {
      console.log('ℹ️ [ServerHealth] Already using primary server');
      return;
    }

    console.log(
      '🔄 [ServerHealth] Attempting to reconnect to primary server...',
    );
    this.isUsingSecondary = false;
    this.reconnectAttempts = 0;

    // Close secondary connection
    if (this.ws) {
      this.ws.close();
    }

    // Wait a bit then connect to primary
    setTimeout(() => {
      this.connect();
    }, 500);
  }

  /** หยุด reconnect และปิดการเชื่อมต่อ */
  public disconnect() {
    this.reconnectTimer?.unsubscribe();
    this.reconnectTimer = null;
    this.ws?.close();
    this.ws = null;
    this.isOnline$.next(false);
    this.isUsingSecondary = false;
    this.reconnectAttempts = 0;
  }

  /**
   * Start server health monitoring
   * Connect to appropriate server (primary or secondary) based on current replication state
   * Called after manual start to resume monitoring
   */
  public startMonitoring(): void {
    console.log('🔄 [ServerHealth] Starting server health monitoring...');

    // Determine which server to connect to based on replication state
    // Check if secondary replications are active
    const replicationStates = this.databaseService.getAllReplicationStates();
    let hasActiveSecondary = false;

    for (const [identifier, state] of replicationStates.entries()) {
      if (identifier.includes('secondary') && (state as any).wasStarted) {
        hasActiveSecondary = true;
        break;
      }
    }

    // Update flag based on which server is being used
    this.isUsingSecondary = hasActiveSecondary;

    // Reset reconnect attempts
    this.reconnectAttempts = 0;

    // Cancel any pending reconnect
    this.reconnectTimer?.unsubscribe();
    this.reconnectTimer = null;

    // Connect to appropriate server
    console.log(
      `🔌 [ServerHealth] Connecting to ${hasActiveSecondary ? 'SECONDARY' : 'PRIMARY'} server for monitoring`,
    );
    this.connect();
  }
}
