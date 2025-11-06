import { Component, OnDestroy } from '@angular/core';
import { ServerHealthService } from '../../core/Database/services/server-health.service';
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

  constructor(private health: ServerHealthService) {
    this.sub = this.health.isOnline$.subscribe((state) => {
      this.isOnline = state;

      if (!state) {
        console.log('⚠️ server down → cancel replication here');
        // replicationState.cancel();
      } else {
        console.log('✅ server up → restart replication');
        // restartReplication();
      }
    });
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }
}
