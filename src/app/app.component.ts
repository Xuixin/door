import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatabaseService } from './core/Database/rxdb.service';

import 'zone.js/plugins/zone-patch-rxjs';
@Component({
  selector: 'app-root',
  standalone: false,
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
})
export class AppComponent implements OnInit, OnDestroy {
  constructor(private databaseService: DatabaseService) {}

  async ngOnInit() {
    console.log('🚀 App component initialized');
  }

  ngOnDestroy() {
    this.databaseService.stopReplication();
  }
}
