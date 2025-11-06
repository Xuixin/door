import { Injectable, NgZone, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { ReplicationCoordinatorService } from './replication-coordinator.service';
import { NetworkStatusService } from './network-status.service';

@Injectable({
  providedIn: 'root',
})
export class ServerHealthService implements OnDestroy {
  private ws: WebSocket | null = null;
  private reconnectTimer: Subscription | null = null;
  private networkSubscription: Subscription | null = null;
  private readonly PRIMARY_WS_URL = environment.wsUrl;
  private readonly SECONDARY_WS_URL =
    environment.wsSecondaryUrl || environment.wsUrl;
  private readonly coordinator = inject(ReplicationCoordinatorService);
  private readonly networkStatus = inject(NetworkStatusService);
  private isUsingSecondary = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private currentWsUrl: string | null = null; // Track current connection URL

  public readonly isOnline$ = new BehaviorSubject<boolean>(false);

  constructor(private zone: NgZone) {
    this.initialize();
  }

  /**
   * Initialize server health monitoring
   */
  private initialize(): void {
    // Subscribe to network status changes
    this.networkSubscription = this.networkStatus.isOnline$
      .pipe(distinctUntilChanged())
      .subscribe((isOnline) => {
        if (isOnline) {
          // Network is online - connect if not already connected
          if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
            console.log('🌐 [ServerHealth] Network online - connecting...');
            this.connect();
          }
        } else {
    
          this.disconnect();
        }
      });

    // Only connect if network is online
    if (this.networkStatus.isOnline()) {
      this.connect();
    } else {
      console.log(
        '📴 [ServerHealth] Network offline - skipping initial connection',
      );
    }
  }

  /** เปิดการเชื่อมต่อ */
  private connect() {
    // Check network status before connecting
    if (!this.networkStatus.isOnline()) {
      console.log(
        '📴 [ServerHealth] Network offline - cannot connect WebSocket',
      );
      return;
    }

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

    // Store current connection URL
    this.currentWsUrl = wsUrl;

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
          this.zone.run(async () => {
            this.isOnline$.next(true);

            // If we're using secondary but just connected to primary, notify coordinator
            if (
              this.isUsingSecondary &&
              this.currentWsUrl &&
              this.currentWsUrl === this.PRIMARY_WS_URL
            ) {
              console.log(
                '🔄 [ServerHealth] Primary server recovered, notifying coordinator...',
              );
              // Update flag BEFORE notifying coordinator to prevent race conditions
              this.isUsingSecondary = false;
              await this.coordinator.handlePrimaryRecovery();
            }
          });
        }
      } catch (error) {
        console.warn('⚠️ [ServerHealth] Error parsing message:', error);
      }
    };

    this.ws.onclose = (event) => {
      this.zone.run(() => {
        console.warn(
          `🔴 [ServerHealth] ${this.isUsingSecondary ? 'SECONDARY' : 'PRIMARY'} WS disconnected`,
          {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          },
        );
        this.isOnline$.next(false);

        // If primary server disconnected, notify coordinator
        if (!this.isUsingSecondary) {
          console.log(
            '🔄 [ServerHealth] Primary server disconnected, notifying coordinator...',
          );
          this.handlePrimaryDisconnect();
        } else {
          // If secondary also disconnected, notify coordinator
          console.warn(
            '⚠️ [ServerHealth] Secondary server also disconnected, notifying coordinator...',
          );
          this.handleSecondaryDisconnect();
        }
      });
    };

    this.ws.onerror = (err) => {
      this.zone.run(() => {
        this.isOnline$.next(false);
      });

    };
  }

  /**
   * Handle primary server disconnect - delegate to coordinator
   */
  private lastPrimaryDisconnectTime = 0;
  private readonly PRIMARY_DISCONNECT_DEBOUNCE_MS = 3000; // 3 seconds debounce

  private async handlePrimaryDisconnect(): Promise<void> {
    try {
      // Check if replications are stopped before proceeding
      if (this.coordinator.isReplicationsStopped()) {
        console.log(
          '⏭️ [ServerHealth] Replications are stopped, skipping primary disconnect handling',
        );
        return;
      }

      // Debounce: prevent duplicate notifications within debounce period
      const now = Date.now();
      if (
        now - this.lastPrimaryDisconnectTime <
        this.PRIMARY_DISCONNECT_DEBOUNCE_MS
      ) {
        console.log(
          '⏭️ [ServerHealth] Primary disconnect notification debounced, skipping',
        );
        return;
      }
      this.lastPrimaryDisconnectTime = now;

      // Add a small delay to avoid race condition with primary recovery detection
      // This prevents switching back to secondary immediately after primary recovery
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Double-check replications are still not stopped after delay
      if (this.coordinator.isReplicationsStopped()) {
        console.log(
          '⏭️ [ServerHealth] Replications stopped during delay, skipping reconnect',
        );
        return;
      }

      // Check if coordinator is already using secondary (prevent duplicate switch)
      // We can't directly check coordinator state, but we can check if we're already using secondary
      if (this.isUsingSecondary) {
        console.log(
          '⏭️ [ServerHealth] Already using secondary, skipping duplicate notification',
        );
        return;
      }

      // Update flag to use secondary
      this.isUsingSecondary = true;

      // Notify coordinator
      await this.coordinator.handlePrimaryServerDown();

      // Check if replications are now stopped (both servers down)
      if (this.coordinator.isReplicationsStopped()) {
        console.log('⏭️ [ServerHealth] Both servers down, stopping monitoring');
        return;
      }

      // Try to connect to secondary server
      setTimeout(() => {
        this.connect();
      }, 1000); // Wait 1 second before reconnecting
    } catch (error: any) {
      console.error(
        '❌ [ServerHealth] Error handling primary disconnect:',
        error.message,
      );
      // Only try to reconnect if replications are not stopped
      if (!this.coordinator.isReplicationsStopped()) {
        this.scheduleReconnect();
      }
    }
  }

  private lastSecondaryDisconnectTime = 0;
  private readonly SECONDARY_DISCONNECT_DEBOUNCE_MS = 3000; // 3 seconds debounce

  /**
   * Handle secondary server disconnect - delegate to coordinator
   */
  private async handleSecondaryDisconnect(): Promise<void> {
    try {
      // Debounce: prevent duplicate notifications within debounce period
      const now = Date.now();
      if (
        now - this.lastSecondaryDisconnectTime <
        this.SECONDARY_DISCONNECT_DEBOUNCE_MS
      ) {
        console.log(
          '⏭️ [ServerHealth] Secondary disconnect notification debounced, skipping',
        );
        return;
      }
      this.lastSecondaryDisconnectTime = now;

      // Check if replications are stopped before proceeding
      if (this.coordinator.isReplicationsStopped()) {
        console.log(
          '⏭️ [ServerHealth] Replications are stopped, skipping secondary disconnect handling',
        );
        return;
      }

      // Notify coordinator
      await this.coordinator.handleSecondaryServerDown();

      // Check if both servers are down (replications stopped)
      if (this.coordinator.isReplicationsStopped()) {
        console.log(
          '⏭️ [ServerHealth] Both servers down, stopping monitoring and canceling reconnect',
        );
        // Cancel any pending reconnect timers
        this.reconnectTimer?.unsubscribe();
        this.reconnectTimer = null;
        return;
      }

      // Try to reconnect to primary first when secondary also fails
      this.isUsingSecondary = false;
      this.scheduleReconnect();
    } catch (error: any) {
      console.error(
        '❌ [ServerHealth] Error handling secondary disconnect:',
        error.message,
      );
      // Only try to reconnect if replications are not stopped
      if (!this.coordinator.isReplicationsStopped()) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    // Check network status before attempting reconnect
    if (!this.networkStatus.isOnline()) {
      console.log('📴 [ServerHealth] Network offline - skipping reconnect');
      return;
    }

    // Check if replications are stopped before attempting reconnect
    if (this.coordinator.isReplicationsStopped()) {
      console.log(
        '⏭️ [ServerHealth] Replications are stopped, skipping reconnect',
      );
      return;
    }

    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `❌ [ServerHealth] Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`,
      );
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
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.currentWsUrl = null;
    this.isOnline$.next(false);
    this.isUsingSecondary = false;
    this.reconnectAttempts = 0;
  }

  ngOnDestroy(): void {
    this.networkSubscription?.unsubscribe();
    this.disconnect();
  }

  /**
   * Start monitoring after manual start
   * Checks current replication state and connects to appropriate server
   */
  public startMonitoring(): void {
    console.log('🔄 [ServerHealth] Starting monitoring...');

    // Check network status first
    if (!this.networkStatus.isOnline()) {
      console.log(
        '📴 [ServerHealth] Network offline - cannot start monitoring',
      );
      return;
    }

    // Check current replication state from coordinator
    const currentState = this.coordinator.getCurrentState();

    if (currentState === 'stopped') {
      console.log(
        '⏭️ [ServerHealth] Replications are stopped, not starting monitoring',
      );
      return;
    }

    // Update isUsingSecondary flag based on current state
    if (currentState === 'primary') {
      this.isUsingSecondary = false;
      console.log('✅ [ServerHealth] Monitoring primary server');
    } else if (currentState === 'secondary') {
      this.isUsingSecondary = true;
      console.log('✅ [ServerHealth] Monitoring secondary server');
    }

    // Reset reconnect attempts
    this.reconnectAttempts = 0;

    // Cancel any existing reconnect timers
    this.reconnectTimer?.unsubscribe();
    this.reconnectTimer = null;

    // Connect to appropriate server
    this.connect();
  }
}
