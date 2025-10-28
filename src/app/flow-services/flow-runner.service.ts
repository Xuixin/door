// ========== TYPES ==========

import {
  computed,
  effect,
  inject,
  Injectable,
  OnDestroy,
  signal,
  Type,
} from "@angular/core";
import { Router } from "@angular/router";
import { Subject } from "rxjs";
import {
  Flow,
  FlowCommand,
  FlowEdge,
  FlowEvent,
  FlowNode,
  FlowState,
  TelemetryEvent,
} from "../types/flow.types";
import {
  FLOW_ERROR_CODES,
  FlowContext,
  FlowError,
} from "../types/workflow-error";
import {
  FlowModalConfig,
  ModalResult,
  ModalsControllerService,
} from "./modals-controller.service";
import { NodeComponentRegistryService } from "./node-component-registry.service";

// type WorkflowCommand =
//   | 'START'
//   | 'NEXT'
//   | 'BACK'
//   | 'CLOSE'
//   | 'START_SUBFLOW'
//   | 'NEXT_SUBFLOW'
//   | 'BACK_SUBFLOW'
//   | 'CLOSE_SUBFLOW'
//   | 'RESUME'
//   | 'JUMP_TO'
//   | 'RESET'
//   | 'ERROR';

// type NavigationDirection = 'forward' | 'backward';
type BackBehavior = "allow" | "skip" | "close";
type DeviceTarget = "all" | "mobile" | "tablet+" | "none";

interface SubflowStackEntry {
  flow: Flow;
  returnTo: string;
  context: FlowContext;
}

interface NavigationResult {
  node: FlowNode;
  isSkipped: boolean;
}

interface EdgeCondition {
  field: string;
  operator: "==" | "===" | "!=" | "!==" | ">" | ">=" | "<" | "<=";
  value: any;
}

// ========== SERVICE ==========

@Injectable({
  providedIn: "root",
})
export class FlowRunnerService implements OnDestroy {
  // ========== DEPENDENCIES ==========
  private readonly modalsController = inject(ModalsControllerService);
  private readonly nodeComponentRegistry = inject(NodeComponentRegistryService);
  private readonly router = inject(Router);

  // ========== STATE SIGNALS ==========
  private readonly state = {
    currentNode: signal<FlowNode | null>(null),
    lastTask: signal<FlowNode | null>(null),
    history: signal<FlowNode[]>([]),
    flow: signal<Flow | null>(null),
    context: signal<FlowContext>({}),
    isRunning: signal<boolean>(false),
    subflowStack: signal<SubflowStackEntry[]>([]),
    error: signal<Error | null>(null),
    stickyRootCheckpointId: signal<string | null>(null),
  };

  // ========== PUBLIC READONLY STATE ==========
  readonly current = this.state.currentNode.asReadonly();
  readonly lastTask = this.state.lastTask.asReadonly();
  readonly history = this.state.history.asReadonly();
  readonly flow = this.state.flow.asReadonly();
  readonly context = this.state.context.asReadonly();
  readonly isRunning = this.state.isRunning.asReadonly();
  readonly subflowStack = this.state.subflowStack.asReadonly();
  readonly error = this.state.error.asReadonly();

  // ========== COMPUTED STATE ==========
  readonly canGoBack = computed(() => this.state.history().length > 1);
  readonly canGoNext = computed(() => {
    const current = this.state.currentNode();
    const flow = this.state.flow();
    if (!current || !flow) return false;
    return (
      this.navigation.getValidEdges(current.id, flow, this.state.context())
        .length > 0
    );
  });

  readonly isInSubflow = computed(() => this.state.subflowStack().length > 0);
  readonly workflowState = computed<FlowState>(() => ({
    current: this.state.currentNode(),
    lastTask: this.state.lastTask(),
    history: this.state.history(),
    flow: this.state.flow(),
    context: this.state.context(),
    isRunning: this.state.isRunning(),
    subflowStack: this.state.subflowStack(),
    error: this.state.error(),
  }));

  // ========== EVENT STREAMS ==========
  private readonly events = new Subject<FlowEvent>();
  private readonly telemetry = new Subject<TelemetryEvent>();
  private readonly destroy = new Subject<void>();

  readonly events$ = this.events.asObservable();
  readonly telemetry$ = this.telemetry.asObservable();

  constructor() {
    effect(() => {
      console.log("Current state:", this.workflowState());
      // console.log('Can go next:', this.canGoNext());
      // console.log('Can go back:', this.canGoBack());
    });
  }

  ngOnDestroy(): void {
    this.destroy.next();
    this.destroy.complete();
    this.events.complete();
    this.telemetry.complete();
  }

  dispatch(event: FlowEvent): void {
    if (!event) {
      return;
    }

    this.state.error.set(null);
    const handler = this.commandHandlers[event.command];
    if (!handler) {
      this.handlers.handleError({
        command: "ERROR",
        payload: {
          error: new FlowError(
            `Unknown command '${event.command}'`,
            FLOW_ERROR_CODES.COMMAND_EXECUTION_FAILED,
            { command: event.command }
          ),
        },
      });
      return;
    }

    try {
      const result = handler(event);
      void Promise.resolve(result).catch((error) =>
        this.handlers.handleError({
          command: "ERROR",
          payload: { error },
        })
      );
    } catch (error) {
      this.handlers.handleError({
        command: "ERROR",
        payload: { error },
      });
    }
  }

  // ========== COMMAND HANDLERS ==========
  private readonly commandHandlers: Record<
    FlowCommand,
    (event: FlowEvent) => void | Promise<void>
  > = {
    START: (e) => this.handlers.handleStart(e),
    NEXT: (e) => this.handlers.handleNext(e),
    BACK: (e) => this.handlers.handleBack(e),
    CLOSE: (e) => this.handlers.handleClose(e),
    START_SUBFLOW: (e) => this.handlers.handleStartSubflow(e),
    NEXT_SUBFLOW: (e) => this.handlers.handleNextSubflow(e),
    BACK_SUBFLOW: (e) => this.handlers.handleBackSubflow(e),
    CLOSE_SUBFLOW: (e) => this.handlers.handleCloseSubflow(e),
    RESUME: (e) => this.handlers.handleResume(e),
    FLOW_SYNC: (e) => this.handlers.handleFlowSync(e),
    JUMP_TO: (e) => this.handlers.handleJumpTo(e),
    RESET: (e) => this.handlers.handleReset(e),
    ERROR: (e) => this.handlers.handleError(e),
  };

  // ========== HANDLER METHODS ==========
  private readonly handlers = {
    handleStart: async (event: FlowEvent): Promise<void> => {
      const { flow, startNodeId, context } = event.payload || {};

      this.validators.validateFlow(flow);

      this.stateManager.initialize(flow!, context);

      const targetNodeId = startNodeId || flow!.start;
      const targetNode = this.validators.validateNode(flow!, targetNodeId);
      const resolvedNode = this.navigation.resolveForward(targetNode, flow!);

      this.stateManager.setCurrentNode(resolvedNode);
      this.stateManager.addToHistory(resolvedNode);

      if (resolvedNode.type === "task") {
        this.stateManager.setLastTask(resolvedNode);
      }

      this.eventManager.emitNodeEnter(resolvedNode, flow!.id);
      this.eventManager.emitWorkflowEvent("START", {
        flowId: flow!.id,
        startNodeId: resolvedNode.id,
      });

      await this.modalManager.handleTransition(
        resolvedNode,
        flow!.id,
        "START",
        "Handle Start..."
      );
    },

    handleNext: async (event: FlowEvent): Promise<void> => {
      console.log("handleNext called with event:", event);

      const { nodeId, context: contextUpdates } = event.payload || {};
      console.log("Extracted payload:", { nodeId, contextUpdates });

      const current = this.state.currentNode();
      const flow = this.state.flow();
      console.log("Current state:", { current, flow });

      if (!this.validators.canNavigate(current, flow)) {
        console.log("Cannot navigate - validation failed");
        return;
      }

      if (contextUpdates) {
        console.log("Updating context with:", contextUpdates);
        this.stateManager.updateContext(contextUpdates);
      }

      const targetNodeId =
        nodeId || this.navigation.getNextNodeId(current!.id, flow!);
      console.log("Resolved target node ID:", targetNodeId);
      if (!targetNodeId) {
        console.log("No target node ID found");
        return;
      }

      const targetNode = this.validators.validateNode(flow!, targetNodeId);
      console.log("Validated target node:", targetNode);

      const resolvedNode = this.navigation.resolveForward(targetNode, flow!);
      console.log("Resolved forward node:", resolvedNode);

      console.log("Navigating to node:", resolvedNode);
      this.stateManager.navigateToNode(resolvedNode);

      console.log("Emitting events");
      this.eventManager.emitNodeEnter(resolvedNode, flow!.id, current!.id);
      this.eventManager.emitEdgeTaken(current!.id, resolvedNode.id, flow!);
      this.eventManager.emitWorkflowEvent("NEXT", {
        from: current!.id,
        to: resolvedNode.id,
        targetNodeId: resolvedNode.id,
      });

      console.log("Handling modal transition");
      await this.modalManager.handleTransition(
        resolvedNode,
        flow!.id,
        "NEXT",
        "Handle Next..."
      );
      console.log("handleNext completed");
    },

    handleBack: async (event: FlowEvent): Promise<void> => {
      const { context: contextUpdates } = event.payload || {};
      const history = this.state.history();
      const flow = this.state.flow();

      if (!this.validators.canGoBack(history, flow)) return;

      if (contextUpdates) {
        this.stateManager.updateContext(contextUpdates);
      }

      const previousNode = this.navigation.resolveBackward(history, flow!);

      if (!previousNode) {
        return this.handlers.handleClose(event);
      }

      this.stateManager.navigateBack(previousNode, history);

      this.eventManager.emitNodeEnter(
        previousNode,
        flow!.id,
        history[history.length - 1].id
      );
      await this.modalManager.handleTransition(
        previousNode,
        flow!.id,
        "BACK",
        "Handle Back..."
      );
    },

    handleClose: async (event: FlowEvent): Promise<void> => {
      const {
        reason = "user-initiated",
        context: contextUpdates,
        ...payloadData
      } = event.payload || {};

      if (contextUpdates) {
        this.stateManager.updateContext(contextUpdates);
      }

      this.stateManager.stopWorkflow();

      const flow = this.state.flow();
      const currentNode = this.state.currentNode();
      const finalContext = this.state.context();

      this.eventManager.emitWorkflowClosed(flow?.id, currentNode?.id, reason);
      this.eventManager.emitWorkflowEvent("CLOSE", {
        ...finalContext,
        ...payloadData,
        reason,
        targetNodeId: currentNode?.id,
      });

      this.stateManager.reset();
      await this.modalsController.closeAllModals();
    },

    handleStartSubflow: async (event: FlowEvent): Promise<void> => {
      const { subflow, returnTo, context, startNodeId } = event.payload || {};

      this.validators.validateFlow(subflow);

      const currentFlow = this.state.flow();
      const currentContext = this.state.context();
      const currentNode = this.state.currentNode();

      if (!currentFlow) {
        throw new FlowError(
          "No active flow",
          FLOW_ERROR_CODES.FLOW_START_FAILED
        );
      }

      const subflowReturnTo = (subflow?.globals?.["returnTo"] ?? undefined) as
        | string
        | undefined;
      const targetReturnTo =
        returnTo || subflowReturnTo || currentNode?.id || currentFlow.start;

      this.stateManager.pushSubflow(
        currentFlow,
        targetReturnTo,
        currentContext
      );
      this.stateManager.initializeSubflow(subflow!, {
        ...currentContext,
        ...context,
      });

      // ใช้ startNodeId ถ้ามี ไม่งั้นใช้ subflow.start (default)
      const targetStartNodeId = startNodeId || subflow!.start;
      const startNode = subflow!.nodes[targetStartNodeId];

      if (!startNode) {
        throw new FlowError(
          `Start node '${targetStartNodeId}' not found in subflow '${
            subflow!.id
          }'`,
          FLOW_ERROR_CODES.INVALID_NODE_ID
        );
      }

      this.stateManager.setCurrentNode(startNode);
      this.stateManager.addToHistory(startNode);

      this.eventManager.emitSubflowStarted(
        subflow!,
        currentFlow.id,
        targetReturnTo
      );
      this.eventManager.emitNodeEnter(startNode, subflow!.id);

      if (this.modalManager.shouldOpenModal(startNode)) {
        const currentModal = this.modalsController.getCurrentMainModal();
        await this.modalManager.openModal(startNode, subflow!.id, {
          type: "subflow",
          parentModalId: currentModal?.id,
        });
      }
    },

    handleNextSubflow: async (event: FlowEvent): Promise<void> => {
      if (!this.isInSubflow()) return;

      const { nodeId, context: contextUpdates } = event.payload || {};
      const current = this.state.currentNode();
      const flow = this.state.flow();

      if (!this.validators.canNavigate(current, flow)) return;

      if (contextUpdates) {
        this.stateManager.updateContext(contextUpdates);
      }

      const targetNodeId =
        nodeId || this.navigation.getNextNodeId(current!.id, flow!);
      if (!targetNodeId) return;

      const targetNode = flow!.nodes[targetNodeId];
      this.stateManager.navigateToNode(targetNode);

      this.eventManager.emitNodeEnter(targetNode, flow!.id, current!.id);
      this.eventManager.emitWorkflowEvent("NEXT_SUBFLOW", {
        from: current!.id,
        to: targetNode.id,
        targetNodeId: targetNode.id,
      });

      await this.modalsController.closeAllSubflowModals();

      if (this.modalManager.shouldOpenModal(targetNode)) {
        const mainModal = this.modalsController.getCurrentMainModal();
        await this.modalManager.openModal(targetNode, flow!.id, {
          type: "subflow",
          parentModalId: mainModal?.id,
        });
      }
    },

    handleBackSubflow: async (event: FlowEvent): Promise<void> => {
      if (!this.isInSubflow()) return;

      const { context: contextUpdates } = event.payload || {};
      const history = this.state.history();
      const flow = this.state.flow();

      if (!this.validators.canGoBack(history, flow)) return;

      if (contextUpdates) {
        this.stateManager.updateContext(contextUpdates);
      }

      const previousNode = this.navigation.resolveBackward(history, flow!);
      if (!previousNode) return;

      this.stateManager.navigateBack(previousNode, history);

      this.eventManager.emitNodeEnter(
        previousNode,
        flow!.id,
        history[history.length - 1].id
      );
      this.eventManager.emitWorkflowEvent("BACK_SUBFLOW", {
        from: history[history.length - 1].id,
        to: previousNode.id,
        targetNodeId: previousNode.id,
      });

      await this.modalsController.closeSubflowModal();

      if (this.modalManager.shouldOpenModal(previousNode)) {
        const mainModal = this.modalsController.getCurrentMainModal();
        await this.modalManager.openModal(previousNode, flow!.id, {
          type: "subflow",
          parentModalId: mainModal?.id,
        });
      }
    },

    handleCloseSubflow: async (event: FlowEvent): Promise<void> => {
      const subflowStack = this.state.subflowStack();
      if (subflowStack.length === 0) return;

      const {
        reason = "completed",
        context: contextUpdates,
        ...payloadData
      } = event.payload || {};
      const currentSubflow = this.state.flow();

      const restored = this.stateManager.popSubflow(contextUpdates);
      if (!restored) return;

      const { flow: parentFlow, returnTo } = restored;

      const fallbackReturnId = parentFlow.start;
      let resolvedReturnId: string | undefined = returnTo;
      let returnNode: FlowNode | undefined;

      if (resolvedReturnId) {
        returnNode = parentFlow.nodes[resolvedReturnId];
        if (!returnNode) {
          console.warn("Return node not found, falling back to flow start", {
            flowId: parentFlow.id,
            requestedReturnTo: resolvedReturnId,
          });
          resolvedReturnId = undefined;
        }
      }

      if (!resolvedReturnId && fallbackReturnId) {
        resolvedReturnId = fallbackReturnId;
        returnNode = parentFlow.nodes[fallbackReturnId];
      }

      if (returnNode) {
        this.stateManager.setCurrentNode(returnNode);
        this.stateManager.addToHistory(returnNode);
        this.eventManager.emitNodeEnter(returnNode, parentFlow.id);
      } else {
        console.warn("Unable to resolve return node after subflow", {
          flowId: parentFlow.id,
          returnTo,
          fallbackReturnId,
        });
      }

      const eventPayload = {
        ...(contextUpdates ?? {}),
        ...payloadData,
        ...(resolvedReturnId ? { targetNodeId: resolvedReturnId } : {}),
      };

      this.eventManager.emitSubflowClosed(
        currentSubflow?.id,
        parentFlow.id,
        resolvedReturnId ?? "",
        reason,
        eventPayload
      );
      await this.modalsController.closeSubflowModal();
    },

    handleJumpTo: async (event: FlowEvent): Promise<void> => {
      const { targetNodeId, context: contextUpdates } = event.payload || {};
      if (!targetNodeId) {
        throw new FlowError(
          "Target node required",
          FLOW_ERROR_CODES.INVALID_NODE_ID
        );
      }

      const flow = this.state.flow();
      const current = this.state.currentNode();

      if (!this.validators.canNavigate(current, flow)) return;

      if (contextUpdates) {
        this.stateManager.updateContext(contextUpdates);
      }

      const targetNode = this.validators.validateNode(flow!, targetNodeId);
      const resolvedNode = this.navigation.resolveForward(targetNode, flow!);

      this.stateManager.navigateToNode(resolvedNode);

      this.eventManager.emitNodeEnter(resolvedNode, flow!.id, current!.id);

      await this.modalsController.closeMainModal();
      if (this.modalManager.shouldOpenModal(resolvedNode)) {
        await this.modalManager.openModal(resolvedNode, flow!.id);
      }
    },

    handleResume: (event: FlowEvent): void => {
      const { nodeId, context } = event.payload || {};

      if (!this.state.flow()) {
        throw new FlowError(
          "No flow to resume",
          FLOW_ERROR_CODES.FLOW_START_FAILED
        );
      }

      if (context) {
        this.stateManager.updateContext(context);
      }

      this.stateManager.startWorkflow();
      this.eventManager.emitWorkflowEvent("RESUME", {
        resumedAt: nodeId || this.state.currentNode()?.id,
        context: { ...this.state.context() },
      });
    },

    handleFlowSync: (event: FlowEvent): void => {
      const { nodeId, context } = event.payload || {};

      if (!this.state.flow()) {
        throw new FlowError(
          "No flow to resume",
          FLOW_ERROR_CODES.FLOW_START_FAILED
        );
      }

      if (context) {
        this.stateManager.updateContext(context);
      }

      this.stateManager.startWorkflow();
      this.eventManager.emitWorkflowEvent("FLOW_SYNC", {
        resumedAt: nodeId || this.state.currentNode()?.id,
        context: { ...this.state.context() },
      });
    },

    handleReset: async (event: FlowEvent): Promise<void> => {
      this.stateManager.reset();
      this.eventManager.emitWorkflowClosed("reset", null, "reset");
    },

    handleError: (event: FlowEvent): void => {
      const { error } = event.payload || {};
      const errorObj =
        error instanceof Error ? error : new Error(String(error));

      this.stateManager.setError(errorObj);
      this.stateManager.stopWorkflow();

      this.eventManager.emitWorkflowError(errorObj);
    },
  };

  // ========== NAVIGATION HELPERS ==========
  private readonly navigation = {
    resolveForward: (from: FlowNode, flow: Flow): FlowNode => {
      let current = from;
      let iterations = 0;

      while (current && iterations < 100) {
        if (this.modalManager.shouldOpenModal(current)) {
          return current;
        }

        const nextId = this.navigation.getNextNodeId(current.id, flow);
        if (!nextId) break;

        current = flow.nodes[nextId];
        iterations++;
      }

      return current || from;
    },

    resolveBackward: (history: FlowNode[], flow: Flow): FlowNode | null => {
      if (history.length <= 1) return null;

      const candidates = [...history];
      candidates.pop();

      while (candidates.length > 0) {
        const candidate = candidates.pop()!;
        // const behavior = this.navigation.getBackBehavior(candidate);
        // if (behavior === 'close') return null;
        // if (behavior === 'skip') continue;
        // if (!this.modalManager.shouldOpenModal(candidate)) continue;

        return candidate;
      }

      return null;
    },

    // getBackBehavior: (node: FlowNode): BackBehavior => {
    //   return (
    //     node.meta?.['backBehavior'] ??
    //     (node.type === 'guide' ? 'skip' : 'allow')
    //   );
    // },

    getNextNodeId: (nodeId: string, flow: Flow): string | null => {
      const edges = this.navigation.getValidEdges(
        nodeId,
        flow,
        this.state.context()
      );
      return edges.length > 0 ? edges[0].target : null;
    },

    getValidEdges: (
      nodeId: string,
      flow: Flow,
      context: FlowContext
    ): FlowEdge[] => {
      const outgoing = flow.edges.filter((e) => e.source === nodeId);
      console.log("outgoing", outgoing);
      const isEdgeValid = outgoing.filter((e) =>
        this.navigation.isEdgeValid(e, context)
      );
      return isEdgeValid;
    },

    isEdgeValid: (edge: FlowEdge, context: FlowContext): boolean => {
      if (!edge.condition || edge.condition === "true") return true;

      try {
        console.log("Edge condition:", edge.condition);
        console.log("Context:", context);
        return this.navigation.evaluateCondition(edge.condition, context);
      } catch {
        return false;
      }
    },

    evaluateCondition: (
      condition: string | EdgeCondition,
      context: FlowContext
    ): boolean => {
      if (typeof condition === "object") {
        return this.navigation.evaluateObjectCondition(condition, context);
      }
      return this.navigation.evaluateStringCondition(condition, context);
    },

    evaluateObjectCondition: (
      condition: EdgeCondition,
      context: FlowContext
    ): boolean => {
      const { field, operator, value } = condition;
      const fieldValue = context[field];

      switch (operator) {
        case "==":
          return fieldValue == value;
        case "===":
          return fieldValue === value;
        case "!=":
          return fieldValue != value;
        case "!==":
          return fieldValue !== value;
        case ">":
          return Number(fieldValue) > Number(value);
        case ">=":
          return Number(fieldValue) >= Number(value);
        case "<":
          return Number(fieldValue) < Number(value);
        case "<=":
          return Number(fieldValue) <= Number(value);
        default:
          return false;
      }
    },

    evaluateStringCondition: (
      condition: string,
      context: FlowContext
    ): boolean => {
      try {
        const func = new Function(
          ...Object.keys(context),
          `return ${condition};`
        );
        return func(...Object.values(context));
      } catch {
        return false;
      }
    },
  };

  // ========== STATE MANAGEMENT ==========
  private readonly stateManager = {
    initialize: (flow: Flow, context?: FlowContext): void => {
      this.state.flow.set(flow);
      this.state.context.set(context || {});
      this.state.history.set([]);
      this.state.currentNode.set(null);
      this.state.lastTask.set(null);
      this.state.subflowStack.set([]);
      this.state.isRunning.set(true);
      this.state.error.set(null);
    },

    initializeSubflow: (flow: Flow, context: FlowContext): void => {
      this.state.flow.set(flow);
      this.state.context.set(context);
      this.state.history.set([]);
    },

    reset: (): void => {
      this.state.flow.set(null);
      this.state.currentNode.set(null);
      this.state.lastTask.set(null);
      this.state.history.set([]);
      this.state.context.set({});
      this.state.isRunning.set(false);
      this.state.subflowStack.set([]);
      this.state.error.set(null);
      this.state.stickyRootCheckpointId.set(null);
    },

    setCurrentNode: (node: FlowNode): void => {
      this.state.currentNode.set(node);
    },

    setLastTask: (node: FlowNode): void => {
      this.state.lastTask.set(node);
    },

    setError: (error: Error): void => {
      this.state.error.set(error);
    },

    addToHistory: (node: FlowNode): void => {
      this.state.history.update((h) => [...h, node]);
    },

    navigateToNode: (node: FlowNode): void => {
      this.state.currentNode.set(node);
      this.state.history.update((h) => [...h, node]);
      if (node.type === "task") {
        this.state.lastTask.set(node);
      }
    },

    navigateBack: (node: FlowNode, history: FlowNode[]): void => {
      const index = history.findIndex((n) => n.id === node.id);
      this.state.history.set(history.slice(0, index + 1));
      this.state.currentNode.set(node);
    },

    updateContext: (updates: FlowContext): void => {
      console.log("Updating context:", updates);
      this.state.context.update((ctx) => ({ ...ctx, ...updates }));
    },

    startWorkflow: (): void => {
      this.state.isRunning.set(true);
      this.state.error.set(null);
    },

    stopWorkflow: (): void => {
      this.state.isRunning.set(false);
    },

    pushSubflow: (flow: Flow, returnTo: string, context: FlowContext): void => {
      this.state.subflowStack.update((stack) => [
        ...stack,
        { flow, returnTo, context },
      ]);
    },

    popSubflow: (mergeContext?: FlowContext): SubflowStackEntry | null => {
      const stack = this.state.subflowStack();
      if (stack.length === 0) return null;

      const entry = stack[stack.length - 1];
      this.state.subflowStack.update((s) => s.slice(0, -1));
      this.state.flow.set(entry.flow);
      this.state.context.set({ ...entry.context, ...mergeContext });

      return entry;
    },
  };

  // ========== MODAL MANAGEMENT ==========
  private readonly modalManager = {
    shouldOpenModal: (node: FlowNode): boolean => {
      if (!node) {
        return false;
      }

      const showConfig = node.meta?.display?.showOn ?? "all";
      if (showConfig === "none") {
        return false;
      }

      const target = showConfig ?? "all";
      const isMobile = this.modalManager.isMobile();

      const isCompatible =
        target === "all" ||
        (target === "mobile" && isMobile) ||
        (target === "tablet+" && !isMobile);

      if (!isCompatible) {
        return false;
      }

      return this.modalManager.hasComponent(node);
    },

    hasComponent: (node: FlowNode): boolean => {
      return Boolean(
        (node.config?.page &&
          this.nodeComponentRegistry.has(node.config?.page)) ||
          (node.type && this.nodeComponentRegistry.has(node.type))
      );
    },

    isMobile: (): boolean => {
      return (
        typeof window !== "undefined" &&
        window.matchMedia("(max-width: 767.98px)").matches
      );
    },

    handleTransition: async (
      node: FlowNode,
      flowId: string,
      action: "START" | "NEXT" | "BACK",
      source: string
    ): Promise<void> => {
      console.log("handleTransition called with:", {
        node,
        flowId,
        action,
        source,
      });
      let isNested = false;

      if (action === "BACK") {
        console.log("Action is BACK, closing main modal");
        await this.modalsController.closeMainModal();
      }

      if (this.modalManager.isMobile()) {
        console.log("Device is mobile");

        console.log(
          "Node is checkpoint:",
          this.modalManager.isCheckpoint(node)
        );
        console.log(
          "Node is sticky root checkpoint:",
          node.meta?.display?.stickyRootOnMobile
        );
        console.log(
          "State stickyRootCheckpointId:",
          this.state.stickyRootCheckpointId()
        );

        if (
          this.modalManager.isCheckpoint(node) &&
          node.meta?.display?.stickyRootOnMobile
        ) {
          console.log("Node is sticky root checkpoint:", node.id);
          this.state.stickyRootCheckpointId.set(node.id);
          await this.modalsController.closeAllModals();
        } else if (this.state.stickyRootCheckpointId()) {
          const stickyId = this.state.stickyRootCheckpointId()!;
          const sticky = this.state.flow()?.nodes[stickyId];
          const until = sticky?.meta?.display?.rootKeepsChildrenUntil;
          console.log("Processing sticky root checkpoint:", {
            stickyId,
            until,
            currentNodeId: node.id,
          });

          if (until && node.id === until) {
            console.log(
              "Reached until node, updating sticky checkpoint to:",
              node.id
            );
            this.state.stickyRootCheckpointId.set(node.id);
            await this.modalsController.closeAllModals();
          } else {
            console.log("Handling nested modal navigation");
            await this.modalsController.closeNestedModal();
            isNested = true;
          }
        }
      } else {
        console.log("Device is desktop, closing main modal");
        await this.modalsController.closeMainModal();
      }

      if (!this.modalManager.shouldOpenModal(node)) {
        console.log("Modal should not open for node:", node.id);
        return;
      }

      console.log("Opening new modal:", {
        nodeId: node.id,
        flowId,
        modalType: isNested ? "nested" : "main",
      });

      await this.modalManager.openModal(node, flowId, {
        type: isNested ? "nested" : "main",
      });
      console.log("Modal opened successfully");
    },

    isCheckpoint: (node: FlowNode): boolean => {
      return node.tags?.includes("checkpoint") || false;
    },

    openModal: async <T = any>(
      node: FlowNode,
      flowId: string,
      options?: Partial<FlowModalConfig>
    ): Promise<ModalResult<T>> => {
      const existing = this.modalsController.getModalsByFlow(flowId);
      if (existing.some((m) => m.nodeId === node.id)) {
        return Promise.resolve({ dismissed: false });
      }

      const component = await this.modalManager.getComponent(node);
      const config: FlowModalConfig = {
        component,
        nodeId: node.id,
        flowId,
        data: node.meta,
        ...options,
      };

      return this.modalsController.openModal<T>(config);
    },

    getComponent: async (node: FlowNode): Promise<Type<any>> => {
      if (!node) {
        throw new FlowError(
          "Node required",
          FLOW_ERROR_CODES.COMPONENT_NOT_FOUND
        );
      }

      if (
        node.config?.page &&
        this.nodeComponentRegistry.has(node.config?.page)
      ) {
        return await this.nodeComponentRegistry.get(node.config?.page);
      }

      if (node.type && this.nodeComponentRegistry.has(node.type)) {
        return await this.nodeComponentRegistry.get(node.type);
      }

      throw new FlowError(
        `No component for node '${node.id}'`,
        FLOW_ERROR_CODES.COMPONENT_NOT_FOUND,
        { nodeId: node.id, page: node.config?.page, kind: node.type }
      );
    },
  };

  private readonly eventManager = {
    emitWorkflowEvent: (command: FlowCommand, payload?: any): void => {
      this.events.next({
        command,
        payload,
        meta: { source: "flow-runner", ts: Date.now() },
      });
    },

    emitNodeEnter: (
      node: FlowNode,
      flowId: string,
      previousId?: string
    ): void => {
      this.telemetry.next({
        type: "node.enter",
        flowId,
        nodeId: node.id,
        timestamp: Date.now(),
        previousNodeId: previousId,
        data: {
          nodeType: node.type,
          context: { ...this.state.context() },
        },
      });
    },

    emitEdgeTaken: (source: string, target: string, flow: Flow): void => {
      const edge = flow.edges.find(
        (e) => e.source === source && e.target === target
      );
      if (!edge) return;

      this.telemetry.next({
        type: "edge.taken",
        flowId: flow.id,
        timestamp: Date.now(),
        edge: {
          source: edge.source,
          target: edge.target,
          condition: edge.condition,
        },
      });
    },

    emitSubflowStarted: (
      subflow: Flow,
      parentFlowId: string,
      returnTo?: string
    ): void => {
      const ts = Date.now();

      this.telemetry.next({
        type: "subflow.started",
        flowId: subflow.id,
        timestamp: ts,
        data: {
          parentFlowId,
          returnTo,
          context: { ...this.state.context() },
        },
      });

      this.events.next({
        command: "START_SUBFLOW",
        payload: {
          subflowId: subflow.id,
          parentFlowId,
          returnTo,
          timestamp: ts,
        },
        meta: { source: "flow-runner", ts },
      });
    },

    emitSubflowClosed: (
      subflowId: string | undefined,
      parentFlowId: string,
      returnTo: string,
      reason: string,
      details?: Record<string, any>
    ): void => {
      const ts = Date.now();

      this.telemetry.next({
        type: "subflow.closed",
        flowId: subflowId || "unknown",
        timestamp: ts,
        data: {
          reason,
          parentFlowId,
          returnTo,
          ...(details && Object.keys(details).length
            ? { payload: details }
            : {}),
        },
      });

      this.events.next({
        command: "CLOSE_SUBFLOW",
        payload: {
          ...(details || {}),
          reason,
          subflowId,
          parentFlowId,
          returnTo,
          timestamp: ts,
        },
        meta: { source: "flow-runner", ts },
      });
    },

    emitWorkflowClosed: (
      flowId?: string,
      nodeId?: string | null,
      reason?: string
    ): void => {
      this.telemetry.next({
        type: "flow.closed",
        flowId: flowId || "unknown",
        nodeId: nodeId ?? undefined,
        timestamp: Date.now(),
        data: { reason, finalNodeId: nodeId },
      });
    },

    emitWorkflowError: (error: Error): void => {
      const flow = this.state.flow();
      const node = this.state.currentNode();

      this.telemetry.next({
        type: "flow.error",
        flowId: flow?.id || "unknown",
        nodeId: node?.id || "unknown",
        timestamp: Date.now(),
        data: {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
        },
      });
    },
  };

  // ========== VALIDATION ==========
  private readonly validators = {
    validateFlow: (flow?: Flow | null): void => {
      if (!flow) {
        throw new FlowError(
          "Flow is required",
          FLOW_ERROR_CODES.FLOW_START_FAILED
        );
      }
    },

    validateNode: (flow: Flow, nodeId?: string | null): FlowNode => {
      if (!nodeId) {
        throw new FlowError(
          "Target node required",
          FLOW_ERROR_CODES.INVALID_NODE_ID,
          { flowId: flow.id }
        );
      }

      const node = flow.nodes[nodeId];
      if (!node) {
        throw new FlowError(
          `Node '${nodeId}' not found in flow '${flow.id}'`,
          FLOW_ERROR_CODES.NODE_NOT_FOUND,
          { flowId: flow.id, nodeId }
        );
      }

      return node;
    },

    canNavigate: (current: FlowNode | null, flow: Flow | null): boolean => {
      if (!flow) {
        console.warn("Attempted navigation without active flow");
        return false;
      }

      if (!current) {
        console.warn("Attempted navigation without current node", {
          flowId: flow.id,
        });
        return false;
      }

      return true;
    },

    canGoBack: (history: FlowNode[], flow: Flow | null): boolean => {
      if (!flow) {
        console.warn("Attempted backward navigation without active flow");
        return false;
      }

      if (history.length <= 1) {
        console.warn("Insufficient history for backward navigation", {
          flowId: flow.id,
          historyLength: history.length,
        });
        return false;
      }

      return true;
    },
  };
}
