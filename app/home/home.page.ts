import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  inject,
  computed,
  signal,
} from '@angular/core';
import { FlowControllerService } from '../flow-services/flow-controller.service';
import { TransactionService } from '../core/Database/collection/txn/facade.service';
import {
  REGISTRY_WALKIN_WORKFLOW,
  REGISTRY_INITIAL_CONTEXT,
} from '../workflow/registry-workflow';
import { ClientIdentityService } from '../services/client-identity.service';
import { ReplicationStateMonitorService } from '../core/Database/replication/services/replication-state-monitor.service';
import { Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatabaseService } from '../core/Database/services/database.service';
import { ReplicationCoordinatorService } from '../core/Database/services/replication-coordinator.service';
import { ServerHealthService } from '../core/Database/services/server-health.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  currentDate = new Date();
  currentTime = new Date();
  clientName: string = '';

  // Inject services
  private readonly flowController = inject(FlowControllerService);
  private readonly transactionService = inject(TransactionService);
  private readonly databaseService = inject(DatabaseService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly identityService = inject(ClientIdentityService);
  private readonly replicationMonitor = inject(ReplicationStateMonitorService);
  private readonly replicationCoordinator = inject(
    ReplicationCoordinatorService,
  );
  private readonly serverHealth = inject(ServerHealthService);

  public readonly inCount = computed(() => this.transactionService.stats().in);

  public readonly replicationStates = toSignal(
    this.replicationMonitor.getStateObservable(),
    { initialValue: this.replicationMonitor.getAllReplicationsState() },
  );

  public readonly isStartingReplication = signal<boolean>(false);

  // Check if both servers are down - use coordinator state
  public readonly isBothServersDown = toSignal(
    this.replicationCoordinator.replicationsStopped$,
    { initialValue: false },
  );

  private timeInterval?: any;
  private replicationSubscription?: Subscription;

  constructor() {
    console.log('HomePage constructor');

    this.timeInterval = setInterval(() => {
      this.currentTime = new Date();
      this.cdr.detectChanges();
    }, 60000);
  }

  async ngOnInit() {
    // Load client name
    const name = await this.identityService.getClientName();
    this.clientName = name || 'ไม่ระบุชื่อ';

    // Load initial transaction data
    try {
      await this.transactionService.findAll();
    } catch (error) {
      console.error('❌ Error loading transactions on HomePage init:', error);
    }

    // Subscribe to replication state updates for change detection
    this.replicationSubscription = this.replicationMonitor
      .getStateObservable()
      .subscribe(() => {
        this.cdr.detectChanges();
      });
  }

  /**
   * Manually start replications
   * Delegate to coordinator
   */
  async startReplication(): Promise<void> {
    if (this.isStartingReplication()) {
      return; // Already starting
    }

    this.isStartingReplication.set(true);

    try {
      const result = await this.replicationCoordinator.handleManualStart();

      if (!result.success) {
        // Show alert if servers are still unavailable
        alert(result.message);
      } else {
        // Success - start server health monitoring after a short delay
        // Wait for replication to fully start before connecting WebSocket
        console.log(
          '🔄 [HomePage] Starting server health monitoring after manual start...',
        );
        setTimeout(() => {
          this.serverHealth.startMonitoring();
        }, 500);
      }
      // Coordinator will emit state change automatically
    } catch (error: any) {
      console.error('❌ Error starting replications:', error);
      alert('เกิดข้อผิดพลาดในการเริ่มต้น Replication');
    } finally {
      this.isStartingReplication.set(false);
    }
  }

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
    if (this.replicationSubscription) {
      this.replicationSubscription.unsubscribe();
    }
  }

  async startRegistryWorkflow(): Promise<void> {
    console.log('Starting Registry Workflow...');
    await this.flowController.startWorkflow(
      REGISTRY_WALKIN_WORKFLOW,
      undefined,
      REGISTRY_INITIAL_CONTEXT,
    );
  }

  clickLog() {
    const a = this.databaseService.getAllReplicationStates();
    console.log(a.values());
  }
}
