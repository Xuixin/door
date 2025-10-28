import { Injectable, OnDestroy, computed, inject, signal } from "@angular/core";
import { Subject, filter, firstValueFrom, map, takeUntil, tap } from "rxjs";
import { Flow, FlowEvent, FlowNode } from "../types/flow.types";
import { FlowContext, FlowError } from "../types/workflow-error";
import { FlowRegistryService } from "./flow-registry.service";
import { FlowRunnerService } from "./flow-runner.service";
import { FlowStateManagerService } from "./flow-state-manager.service";

/** Flow execution context type */
export type WorkflowContext = Record<string, unknown>;

/** Flow completion result */
export interface FlowResult {
  data: FlowContext;
  role?: string;
}

/** Enhanced flow controller state */
export interface FlowControllerState {
  isActive: boolean;
  currentFlow: Flow | null;
  currentNode: FlowNode | null;
  executionContext: FlowContext;
  canNavigateBack: boolean;
  canNavigateNext: boolean;
  isInSubflow: boolean;
  isRunning: boolean;
  error: Error | null;
}

/** Navigation options with clear semantics */
export interface FlowNavigationOptions {
  /** Data to pass during transition */
  transitionData?: FlowContext;

  /** Skip validation before navigation (future feature) */
  skipValidation?: boolean;

  /** Preserve existing context instead of merging (future feature) */
  preserveContext?: boolean;
}

/** Custom flow error with enhanced context */
// export class FlowError extends Error {
//   constructor(
//     message: string,
//     public readonly code: string,
//     public readonly context?: FlowContext
//   ) {
//     super(message);
//     this.name = 'FlowError';
//   }
// }

/**
 * Centralized Flow Controller Service
 */
@Injectable({
  providedIn: "root",
})
export class FlowControllerService implements OnDestroy {
  private readonly flowRunner = inject(FlowRunnerService);
  private readonly stateManager = inject(FlowStateManagerService);
  private readonly flowRegistry = inject(FlowRegistryService);

  // Signal-based state
  private readonly _isActive = signal<boolean>(false);
  private readonly _error = signal<Error | null>(null);
  private readonly _destroy$ = new Subject<void>();

  /** Whether the workflow system is active */
  readonly isActive = this._isActive.asReadonly();

  /** Current flow definition */
  readonly currentFlow = computed(() => this.flowRunner.flow());

  /** Current active node */
  readonly currentNode = computed(() => this.flowRunner.current());

  /** Current execution context */
  readonly executionContext = computed(() => this.flowRunner.context());

  /** Whether navigation back is possible */
  readonly canNavigateBack = computed(() => this.flowRunner.canGoBack());

  /** Whether navigation forward is possible */
  readonly canNavigateNext = computed(() => this.flowRunner.canGoNext());

  /** Whether currently in a subflow */
  readonly isInSubflow = computed(() => this.flowRunner.isInSubflow());

  /** Whether workflow is currently running */
  readonly isRunning = computed(() => this.flowRunner.isRunning());

  /** Current error state */
  readonly error = computed(() => this._error() || this.flowRunner.error());

  /** Unified workflow state snapshot */
  readonly workflowState = computed<FlowControllerState>(() => ({
    isActive: this._isActive(),
    currentFlow: this.currentFlow(),
    currentNode: this.currentNode(),
    executionContext: this.executionContext(),
    canNavigateBack: this.canNavigateBack(),
    canNavigateNext: this.canNavigateNext(),
    isInSubflow: this.isInSubflow(),
    isRunning: this.isRunning(),
    error: this.error(),
  }));

  /**
   * Start a new workflow
   *
   * @param flow - The flow definition to execute
   * @param startNodeId - Optional starting node (defaults to flow.start)
   * @param initialContext - Initial execution context
   * @returns Promise that resolves when workflow completes
   */
  async startWorkflow(
    flow: Flow,
    startNodeId?: string,
    initialContext: WorkflowContext = {}
  ): Promise<FlowResult> {
    if (this._isActive()) {
      throw new FlowError(
        "Cannot start workflow: another workflow is already active",
        "WORKFLOW_ALREADY_ACTIVE"
      );
    }

    try {
      this._isActive.set(true);
      this._error.set(null);

      // Ensure the flow (and its subflows) are discoverable by the registry
      // so startSubflow() can resolve them by ID
      try {
        this.flowRegistry.registerFlow(flow);
      } catch {}

      // Initialize state management
      this.stateManager.initializeFlow(flow);

      // Create completion promise with timeout and correlation
      const completionPromise = firstValueFrom(
        this.flowRunner.events$.pipe(
          tap((event) => console.log("Runner event:", event)),
          filter(
            (event: FlowEvent) =>
              event.command === "CLOSE" &&
              // Add basic correlation - could be enhanced with runId
              this.currentFlow()?.id === flow.id
          ),
          map((event) => ({
            data: event.payload || {},
            role: event.payload?.["role"] as string,
            reason: event.payload?.["reason"] as string,
          })),
          takeUntil(this._destroy$)
        )
      );

      // Start workflow execution
      this.flowRunner.dispatch({
        command: "START",
        payload: {
          flow,
          startNodeId,
          context: initialContext,
        },
      });

      return await completionPromise;
    } catch (error) {
      this._error.set(error as Error);
      this._isActive.set(false);

      throw this.enhanceError(error, "WORKFLOW_START_FAILED", {
        flowId: flow.id,
      });
    }
  }

  /**
   * Reset the workflow system
   */
  async reset(): Promise<void> {
    try {
      this.flowRunner.dispatch({ command: "RESET" });
      this.stateManager.reset();
      this._isActive.set(false);
      this._error.set(null);
    } catch (error) {
      this._error.set(error as Error);
      throw this.enhanceError(error, "RESET_FAILED");
    }
  }

  /**
   * Close the current workflow with final data
   */
  async closeWorkflow(
    finalData: WorkflowContext = {},
    role?: string
  ): Promise<void> {
    try {
      this.flowRunner.dispatch({
        command: "CLOSE",
        payload: {
          ...(finalData ? { context: finalData } : {}),
          ...(role && { role }),
        },
      });

      this.stateManager.completeFlow(finalData);
      this._isActive.set(false);
    } catch (error) {
      this._error.set(error as Error);
      throw this.enhanceError(error, "WORKFLOW_CLOSE_FAILED");
    }
  }

  /**
   * Navigate to the next step
   */
  next(options: FlowNavigationOptions = {}): void {
    // this.validateNavigation('next', this.canNavigateNext());
    try {
      const payload = options.transitionData
        ? { context: options.transitionData }
        : undefined;
      if (this.isInSubflow()) {
        this.flowRunner.dispatch({
          command: "NEXT_SUBFLOW",
          payload,
        });
      } else {
        this.flowRunner.dispatch({
          command: "NEXT",
          payload,
        });
      }

      this.syncExecutionData(options.transitionData);
    } catch (error) {
      this.handleNavigationError(error, "next");
    }
  }

  /**
   * Navigate to the previous step
   */
  back(): void {
    this.validateNavigation("back", this.canNavigateBack());

    try {
      if (this.isInSubflow()) {
        this.flowRunner.dispatch({ command: "BACK_SUBFLOW" });
      } else {
        this.flowRunner.dispatch({ command: "BACK" });
      }
    } catch (error) {
      this.handleNavigationError(error, "back");
    }
  }

  /**
   * Jump to a specific node
   */
  jumpTo(nodeId: string, options: FlowNavigationOptions = {}): void {
    if (!nodeId) {
      throw new FlowError(
        "Node ID is required for jump navigation",
        "INVALID_NODE_ID"
      );
    }

    try {
      const payload = {
        targetNodeId: nodeId,
        ...(options.transitionData ? { context: options.transitionData } : {}),
      };

      this.flowRunner.dispatch({
        command: "JUMP_TO",
        payload,
      });

      this.stateManager.transitionToNode(
        nodeId,
        undefined,
        options.transitionData
      );
    } catch (error) {
      this.handleNavigationError(error, "jumpTo");
    }
  }

  // ========================================
  // SUBFLOW MANAGEMENT
  // ========================================

  /**
   * Start a subflow by ID
   */
  async startSubflow(
    subflowId: string,
    context: WorkflowContext = {},
    startNodeId?: string
  ): Promise<FlowResult> {
    const subflow = this.flowRegistry.getSubflow(subflowId);
    if (!subflow) {
      throw new FlowError(
        `Subflow not found: ${subflowId}`,
        "SUBFLOW_NOT_FOUND",
        { subflowId }
      );
    }

    try {
      // Create completion promise for this specific subflow
      const completionPromise = firstValueFrom(
        this.flowRunner.events$.pipe(
          tap((event: FlowEvent) => console.log("Runner event:", event)),
          filter((event: FlowEvent) => event.command === "CLOSE_SUBFLOW"),
          map(
            (event: FlowEvent): FlowResult => ({
              data: event.payload || {},
              role: event.payload?.["role"],
            })
          )
        )
      );

      this.flowRunner.dispatch({
        command: "START_SUBFLOW",
        payload: {
          subflow,
          returnTo: subflow.returnTo,
          context,
          startNodeId, // ← เพิ่ม startNodeId
        },
      });

      return await completionPromise;
    } catch (error) {
      // Log critical error for subflow start failures

      throw this.enhanceError(error, "SUBFLOW_START_FAILED", { subflowId });
    }
  }

  /**
   * Close the current subflow
   */
  closeSubflow(returnData: WorkflowContext = {}, role?: string): void {
    if (!this.isInSubflow()) {
      throw new FlowError(
        "Cannot close subflow: not currently in a subflow",
        "NOT_IN_SUBFLOW"
      );
    }

    try {
      this.flowRunner.dispatch({
        command: "CLOSE_SUBFLOW",
        payload: {
          ...(returnData ? { context: returnData } : {}),
          ...(role && { role }),
        },
      });
    } catch (error) {
      this.handleNavigationError(error, "closeSubflow");
    }
  }

  // ========================================
  // CONTEXT MANAGEMENT
  // ========================================

  /**
   * Update the workflow execution context
   */
  updateContext(updates: WorkflowContext): void {
    try {
      // Single source of truth: update through runner
      // this.flowRunner.updateContext(updates);
      // State manager will be notified through events
    } catch (error) {
      this._error.set(error as Error);
      throw this.enhanceError(error, "CONTEXT_UPDATE_FAILED");
    }
  }

  // ========================================
  // STATE AND DIAGNOSTICS
  // ========================================

  /**
   * Get a comprehensive state snapshot for debugging
   */
  getStateSnapshot() {
    return {
      controller: this.workflowState(),
      runner: this.flowRunner.workflowState(),
      stateManager: this.stateManager.stateSnapshot(),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle errors with enhanced context and recovery
   */
  handleError(error: Error, context?: WorkflowContext): void {
    const enhancedError = this.enhanceError(error, "WORKFLOW_ERROR", context);
    this._error.set(enhancedError);

    // Notify state manager for persistence
    this.stateManager.handleFlowError(enhancedError, this.currentNode()?.id);

    // Consider auto-recovery or controlled shutdown based on error type
    if (this.isRecoverableError(enhancedError)) {
      // Log and continue
      console.warn("Recoverable workflow error:", enhancedError);
    } else {
      // Potentially reset the workflow for unrecoverable errors
      console.error("Unrecoverable workflow error:", enhancedError);
    }
  }

  // ========================================
  // LIFECYCLE MANAGEMENT
  // ========================================

  /**
   * Clean up resources when service is destroyed
   */
  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
    this.stateManager.destroy();
  }

  // ========================================
  // PRIVATE HELPER METHODS
  // ========================================

  /**
   * Validate navigation preconditions
   */
  private validateNavigation(operation: string, canNavigate: boolean): void {
    if (!canNavigate) {
      throw new FlowError(
        `Cannot ${operation}: navigation not allowed`,
        "NAVIGATION_NOT_ALLOWED",
        { operation, currentNode: this.currentNode()?.id }
      );
    }
  }

  /**
   * Synchronize execution data with state manager
   */
  private syncExecutionData(transitionData?: WorkflowContext): void {
    if (transitionData && this.currentNode()) {
      this.stateManager.updateExecutionData(transitionData);
    }
  }

  /**
   * Handle navigation-specific errors
   */
  private handleNavigationError(error: unknown, operation: string): void {
    const enhancedError = this.enhanceError(error, "NAVIGATION_FAILED", {
      operation,
      currentNode: this.currentNode()?.id,
    });
    this._error.set(enhancedError);
    throw enhancedError;
  }

  /**
   * Enhance errors with additional context and typing
   */
  private enhanceError(
    error: unknown,
    code: string,
    context?: WorkflowContext
  ): FlowError {
    if (error instanceof FlowError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new FlowError(message, code, context);
  }

  /**
   * Determine if an error is recoverable
   */
  private isRecoverableError(error: FlowError): boolean {
    const recoverableCodes = [
      "NAVIGATION_NOT_ALLOWED",
      "INVALID_NODE_ID",
      "CONTEXT_UPDATE_FAILED",
    ];
    return recoverableCodes.includes(error.code);
  }
}
