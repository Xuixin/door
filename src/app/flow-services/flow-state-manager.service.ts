import { computed, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Flow, FlowEdge, TelemetryEvent } from '../types/flow.types';

export interface FlowTransition {
  fromNodeId: string;
  toNodeId: string;
  edgeId: string;
  timestamp: Date;
  data?: Record<string, any>;
  conditions?: Record<string, any>;
}

export interface FlowStateSnapshot {
  flowId: string;
  currentNodeId: string | null;
  visitedNodes: string[];
  executionData: Record<string, any>;
  transitions: FlowTransition[];
  startTime: Date;
  lastUpdateTime: Date;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'error';
}

export interface StateTransitionEvent {
  type:
    | 'node-entered'
    | 'node-exited'
    | 'transition-started'
    | 'transition-completed'
    | 'flow-paused'
    | 'flow-resumed';
  flowId: string;
  nodeId?: string;
  edgeId?: string;
  data?: any;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class FlowStateManagerService {
  private readonly _destroy = new Subject<void>();

  // Core state signals
  private readonly _currentFlow = signal<Flow | null>(null);
  private readonly _currentNodeId = signal<string | null>(null);
  private readonly _visitedNodes = signal<string[]>([]);
  private readonly _executionData = signal<Record<string, any>>({});
  private readonly _transitions = signal<FlowTransition[]>([]);
  private readonly _flowStatus = signal<
    'idle' | 'running' | 'paused' | 'completed' | 'error'
  >('idle');
  private readonly _startTime = signal<Date | null>(null);
  private readonly _lastUpdateTime = signal<Date | null>(null);

  // Event streams
  private readonly _stateEvents = new Subject<StateTransitionEvent>();
  private readonly _telemetryEvents = new Subject<TelemetryEvent>();

  // Public readonly signals
  readonly currentFlow = this._currentFlow.asReadonly();
  readonly currentNodeId = this._currentNodeId.asReadonly();
  readonly visitedNodes = this._visitedNodes.asReadonly();
  readonly executionData = this._executionData.asReadonly();
  readonly transitions = this._transitions.asReadonly();
  readonly flowStatus = this._flowStatus.asReadonly();
  readonly startTime = this._startTime.asReadonly();
  readonly lastUpdateTime = this._lastUpdateTime.asReadonly();

  // Event observables
  readonly stateEvents$ = this._stateEvents.asObservable();
  readonly telemetryEvents$ = this._telemetryEvents.asObservable();

  // Computed properties
  readonly currentNode = computed(() => {
    const flow = this._currentFlow();
    const nodeId = this._currentNodeId();
    if (!flow || !nodeId || !flow.nodes) return null;
    return flow.nodes[nodeId] || null;
  });

  readonly isRunning = computed(() => this._flowStatus() === 'running');
  readonly isPaused = computed(() => this._flowStatus() === 'paused');
  readonly isCompleted = computed(() => this._flowStatus() === 'completed');
  readonly hasError = computed(() => this._flowStatus() === 'error');

  readonly canTransition = computed(() => {
    const status = this._flowStatus();
    return status === 'running' || status === 'paused';
  });

  readonly executionDuration = computed(() => {
    const start = this._startTime();
    const last = this._lastUpdateTime();
    if (!start) return 0;
    const end = last || new Date();
    return end.getTime() - start.getTime();
  });

  readonly stateSnapshot = computed(
    (): FlowStateSnapshot => ({
      flowId: this._currentFlow()?.id || '',
      currentNodeId: this._currentNodeId(),
      visitedNodes: [...this._visitedNodes()],
      executionData: { ...this._executionData() },
      transitions: [...this._transitions()],
      startTime: this._startTime() || new Date(),
      lastUpdateTime: this._lastUpdateTime() || new Date(),
      status: this._flowStatus(),
    })
  );

  /**
   * Initialize flow state management
   */
  initializeFlow(flow: Flow): void {
    this._currentFlow.set(flow);
    this._currentNodeId.set(null);
    this._visitedNodes.set([]);
    this._executionData.set({});
    this._transitions.set([]);
    this._flowStatus.set('idle');
    this._startTime.set(null);
    this._lastUpdateTime.set(null);

    this.emitTelemetry({
      type: 'flow.started',
      flowId: flow.id,
      timestamp: Date.now(),
      data: { flowId: flow.id },
    });
  }

  /**
   * Start flow execution
   */
  startFlow(startNodeId?: string): void {
    const flow = this._currentFlow();
    if (!flow) {
      throw new Error('No flow initialized');
    }

    const actualStartNodeId = startNodeId || this.findStartNode(flow);
    if (!actualStartNodeId) {
      throw new Error('No start node found');
    }

    this._flowStatus.set('running');
    this._startTime.set(new Date());
    this._lastUpdateTime.set(new Date());

    this.transitionToNode(actualStartNodeId);

    this.emitTelemetry({
      type: 'flow.started',
      flowId: flow.id,
      timestamp: Date.now(),
      data: { startNodeId: actualStartNodeId },
    });
  }

  /**
   * Transition to a specific node
   */
  transitionToNode(
    nodeId: string,
    edgeId?: string,
    transitionData?: Record<string, any>
  ): void {
    const flow = this._currentFlow();
    if (!flow || !this.canTransition()) {
      return;
    }

    const targetNode = flow.nodes?.[nodeId];
    if (!targetNode) {
      throw new Error(`Node ${nodeId} not found in flow`);
    }

    const previousNodeId = this._currentNodeId();

    // Exit previous node
    if (previousNodeId) {
      this.emitStateEvent({
        type: 'node-exited',
        flowId: flow.id,
        nodeId: previousNodeId,
        timestamp: new Date(),
      });
    }

    // Record transition
    if (previousNodeId && edgeId) {
      const transition: FlowTransition = {
        fromNodeId: previousNodeId,
        toNodeId: nodeId,
        edgeId,
        timestamp: new Date(),
        data: transitionData,
      };

      this._transitions.update(transitions => [...transitions, transition]);

      this.emitStateEvent({
        type: 'transition-completed',
        flowId: flow.id,
        nodeId,
        edgeId,
        data: transitionData,
        timestamp: new Date(),
      });
    }

    // Update state
    this._currentNodeId.set(nodeId);
    this._visitedNodes.update(visited =>
      visited.includes(nodeId) ? visited : [...visited, nodeId]
    );
    this._lastUpdateTime.set(new Date());

    // Merge execution data
    if (transitionData) {
      this._executionData.update(data => ({ ...data, ...transitionData }));
    }

    // Enter new node
    this.emitStateEvent({
      type: 'node-entered',
      flowId: flow.id,
      nodeId,
      timestamp: new Date(),
    });

    this.emitTelemetry({
      type: 'node.enter',
      flowId: flow.id,
      nodeId,
      previousNodeId: previousNodeId || undefined,
      timestamp: Date.now(),
      data: { type: targetNode.type },
    });
  }

  /**
   * Update execution data
   */
  updateExecutionData(data: Record<string, any>): void {
    this._executionData.update(current => ({ ...current, ...data }));
    this._lastUpdateTime.set(new Date());

    const flow = this._currentFlow();
    if (flow) {
      this.emitTelemetry({
        type: 'node.enter',
        flowId: flow.id,
        timestamp: Date.now(),
        data: { updatedKeys: Object.keys(data) },
      });
    }
  }

  /**
   * Pause flow execution
   */
  pauseFlow(): void {
    if (this._flowStatus() === 'running') {
      this._flowStatus.set('paused');
      this._lastUpdateTime.set(new Date());

      const flow = this._currentFlow();
      if (flow) {
        this.emitStateEvent({
          type: 'flow-paused',
          flowId: flow.id,
          timestamp: new Date(),
        });

        this.emitTelemetry({
          type: 'flow.started',
          flowId: flow.id,
          timestamp: Date.now(),
          data: { currentNodeId: this._currentNodeId(), paused: true },
        });
      }
    }
  }

  /**
   * Resume flow execution
   */
  resumeFlow(): void {
    if (this._flowStatus() === 'paused') {
      this._flowStatus.set('running');
      this._lastUpdateTime.set(new Date());

      const flow = this._currentFlow();
      if (flow) {
        this.emitStateEvent({
          type: 'flow-resumed',
          flowId: flow.id,
          timestamp: new Date(),
        });

        this.emitTelemetry({
          type: 'flow.started',
          flowId: flow.id,
          timestamp: Date.now(),
          data: { currentNodeId: this._currentNodeId(), resumed: true },
        });
      }
    }
  }

  /**
   * Complete flow execution
   */
  completeFlow(finalData?: Record<string, any>): void {
    const flow = this._currentFlow();
    if (!flow) return;

    if (finalData) {
      this.updateExecutionData(finalData);
    }

    this._flowStatus.set('completed');
    this._lastUpdateTime.set(new Date());

    this.emitTelemetry({
      type: 'flow.closed',
      flowId: flow.id,
      timestamp: Date.now(),
      data: {
        duration: this.executionDuration(),
        visitedNodesCount: this._visitedNodes().length,
        transitionsCount: this._transitions().length,
      },
    });
  }

  /**
   * Handle flow error
   */
  handleFlowError(error: Error, nodeId?: string): void {
    const flow = this._currentFlow();
    if (!flow) return;

    this._flowStatus.set('error');
    this._lastUpdateTime.set(new Date());

    this.emitTelemetry({
      type: 'flow.error',
      flowId: flow.id,
      timestamp: Date.now(),
      error: {
        message: error.message,
        stack: error.stack,
      },
      nodeId: nodeId || this._currentNodeId() || undefined,
    });
  }

  /**
   * Reset flow state
   */
  reset(): void {
    this._currentFlow.set(null);
    this._currentNodeId.set(null);
    this._visitedNodes.set([]);
    this._executionData.set({});
    this._transitions.set([]);
    this._flowStatus.set('idle');
    this._startTime.set(null);
    this._lastUpdateTime.set(null);
  }

  /**
   * Get available transitions from current node
   */
  getAvailableTransitions(): FlowEdge[] {
    const flow = this._currentFlow();
    const currentNodeId = this._currentNodeId();

    if (!flow || !currentNodeId || !flow.edges) {
      return [];
    }

    return Object.values(flow.edges).filter(
      edge => edge.source === currentNodeId
    );
  }

  /**
   * Check if transition is valid
   */
  canTransitionTo(nodeId: string): boolean {
    const availableTransitions = this.getAvailableTransitions();
    return availableTransitions.some(edge => edge.target === nodeId);
  }

  /**
   * Find start node in flow
   */
  private findStartNode(flow: Flow): string | null {
    if (!flow.nodes) return null;

    // Look for explicit start node or use flow.start property
    if (flow.start) return flow.start;

    const startNode = Object.values(flow.nodes).find(
      node => node.type === 'task'
    );
    if (startNode) return startNode.id;

    // Look for node with no incoming edges
    const nodeIds = Object.keys(flow.nodes);
    const nodesWithIncoming = new Set(
      Object.values(flow.edges || {}).map(edge => edge.target)
    );

    const startNodeId = nodeIds.find(id => !nodesWithIncoming.has(id));
    return startNodeId || null;
  }

  /**
   * Emit state transition event
   */
  private emitStateEvent(event: StateTransitionEvent): void {
    this._stateEvents.next(event);
  }

  /**
   * Emit telemetry event
   */
  private emitTelemetry(event: TelemetryEvent): void {
    this._telemetryEvents.next(event);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this._destroy.next();
    this._destroy.complete();
    this._stateEvents.complete();
    this._telemetryEvents.complete();
  }
}
