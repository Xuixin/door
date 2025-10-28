import { Component, computed, inject, Input, signal } from "@angular/core";
import { FlowControllerService } from "../flow-services/flow-controller.service";
import { FlowNode } from "../types/flow.types";

@Component({
  template: "",
  standalone: true,
})
export abstract class BaseFlowController {
  protected readonly flowController = inject(FlowControllerService);

  // Input properties
  @Input() node!: FlowNode;
  @Input() context: Record<string, any> = {};
  @Input() data: Record<string, any> = {};
  @Input() isSubflow: boolean = false;

  // Internal state signals
  protected readonly _isLoading = signal<boolean>(false);
  protected readonly _error = signal<Error | null>(null);
  protected readonly _localData = signal<Record<string, any>>({});

  // Public computed signals
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly localData = this._localData.asReadonly();

  // Workflow state from controller
  readonly workflowState = this.flowController.workflowState;
  readonly canGoBack = this.flowController.canNavigateBack;
  readonly canGoNext = this.flowController.canNavigateNext;
  readonly currentNode = this.flowController.currentNode;
  readonly currentFlow = this.flowController.currentFlow;
  readonly executionContext = this.flowController.executionContext;

  // Combined context (workflow + local)
  readonly combinedContext = computed(() => ({
    ...this.executionContext(),
    ...this.context,
    ...this.localData(),
    ...this.data,
  }));

  /**
   * Execute an async operation with loading state management
   */
  protected async runWithLoading<T>(
    operation: () => Promise<T>
  ): Promise<T | undefined> {
    try {
      this._isLoading.set(true);
      this._error.set(null);
      return await operation();
    } catch (error) {
      this._error.set(error as Error);
      this.flowController.handleError(error as Error, {
        nodeId: this.node?.id,
        context: this.combinedContext(),
      });
      return undefined;
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Navigate to the next step
   */
  async next(data?: Record<string, any>): Promise<void> {
    await this.runWithLoading(async () => {
      if (data) {
        this.updateLocalData(data);
        this.flowController.updateContext(data);
      }

      this.flowController.next({
        transitionData: this.combinedContext(),
      });
    });
  }

  /**
   * Navigate to the previous step
   */
  async back(): Promise<void> {
    await this.runWithLoading(async () => {
      this.flowController.back();
    });
  }

  /**
   * Jump to a specific node
   */
  async jumpTo(nodeId: string, data?: Record<string, any>): Promise<void> {
    await this.runWithLoading(async () => {
      if (data) {
        this.updateLocalData(data);
        this.flowController.updateContext(data);
      }

      this.flowController.jumpTo(nodeId, {
        transitionData: this.combinedContext(),
      });
    });
  }

  /**
   * Start a subflow by ID
   */
  async startSubflow(
    subflowId: string,
    context?: Record<string, any>,
    startNodeId?: string
  ): Promise<{ data: Record<string, any>; role?: string | undefined }> {
    return this.flowController.startSubflow(subflowId, context, startNodeId);
  }

  /**
   * Close current subflow
   */
  async closeSubflow(
    returnData?: Record<string, any>,
    role?: string
  ): Promise<void> {
    await this.runWithLoading(async () => {
      const combinedFinalData = {
        ...this.combinedContext(),
        ...returnData,
      };

      this.flowController.closeSubflow(combinedFinalData, role);
    });
  }

  /**
   * Close the entire workflow
   */
  async closeWorkflow(
    finalData?: Record<string, any>,
    role?: string
  ): Promise<void> {
    await this.runWithLoading(async () => {
      const combinedFinalData = {
        ...this.combinedContext(),
        ...finalData,
      };

      await this.flowController.closeWorkflow(combinedFinalData, role);
    });
  }

  /**
   * Update local component data
   */
  updateLocalData(data: Record<string, any>): void {
    this._localData.update((current) => ({ ...current, ...data }));
  }

  /**
   * Update workflow context
   */
  updateWorkflowContext(data: Record<string, any>): void {
    this.flowController.updateContext(data);
  }

  /**
   * Get current workflow state snapshot
   */
  getStateSnapshot() {
    return {
      node: this.node,
      context: this.combinedContext(),
      workflowState: this.workflowState(),
      localData: this.localData(),
      isLoading: this.isLoading(),
      error: this.error(),
    };
  }

  /**
   * Validate current step data
   * Override in concrete components for custom validation
   */
  protected validateStepData(): boolean {
    return true;
  }

  /**
   * Handle step initialization
   * Override in concrete components for custom initialization
   */
  protected onStepInit(): void {
    // Override in concrete components
  }

  /**
   * Handle step cleanup
   * Override in concrete components for custom cleanup
   */
  protected onStepDestroy(): void {
    // Override in concrete components
  }

  /**
   * Handle navigation validation
   * Override in concrete components for custom navigation logic
   */
  protected canNavigateNext(): boolean {
    return this.validateStepData() && this.canGoNext();
  }

  /**
   * Handle navigation validation
   * Override in concrete components for custom navigation logic
   */
  protected canNavigateBack(): boolean {
    return this.canGoBack();
  }

  /**
   * Lifecycle hook - called when component initializes
   */
  ngOnInit(): void {
    this.onStepInit();
  }

  /**
   * Lifecycle hook - called when component destroys
   */
  ngOnDestroy(): void {
    this.onStepDestroy();
  }
}
