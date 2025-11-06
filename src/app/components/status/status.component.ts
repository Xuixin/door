import { Component, OnDestroy, inject } from '@angular/core';
import { ReplicationCoordinatorService } from '../../core/Database/services/replication-coordinator.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-status',
  template: `
    <div [style.color]="isOnline ? 'green' : 'red'">
      {{ isOnline ? 'Server Online' : 'Server Offline' }}
    </div>
  `,
})
export class StatusComponent implements OnDestroy {
  isOnline = false;
  private sub: Subscription;
  private coordinator = inject(ReplicationCoordinatorService);

  constructor() {
    // Check replication state - if not stopped, server is online
    const currentState = this.coordinator.getCurrentState();
    this.isOnline = currentState !== 'stopped';

    // Subscribe to replication stopped state changes
    this.sub = this.coordinator.replicationsStopped$.subscribe((stopped) => {
      this.isOnline = !stopped;
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
