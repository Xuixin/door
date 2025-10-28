import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  inject,
  computed,
} from '@angular/core';
import { FlowControllerService } from '../flow-services/flow-controller.service';
import { TransactionService } from '../core/Database/facade';
import {
  REGISTRY_WALKIN_WORKFLOW,
  REGISTRY_INITIAL_CONTEXT,
} from '../workflow/registry-workflow';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  currentDate = new Date();
  currentTime = new Date();

  // Inject services
  private readonly flowController = inject(FlowControllerService);
  private readonly transactionService = inject(TransactionService);
  private readonly cdr = inject(ChangeDetectorRef);

  // Computed properties for template
  public readonly inCount = computed(() => this.transactionService.stats().in);

  private timeInterval?: any;

  constructor() {
    console.log('HomePage constructor');

    this.timeInterval = setInterval(() => {
      this.currentTime = new Date();
      this.cdr.detectChanges();
    }, 60000);
  }

  ngOnInit() {}

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
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
}
