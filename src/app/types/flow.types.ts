/**
 * Core schema types for the Flow Engine (Node grahs)
 * Based on PRD specifications for graph-based flow with event-driven actions
 */

export interface FlowNode {
  id: string;
  type?: NodeType;
  tags?: string[];
  config?: { page?: string };
  meta?: NodeMeta;
}

export type NodeType = 'task' | 'guide' | 'subflow';

export interface NodeMeta {
  title?: string;
  subtitle?: string;
  icon?: string;
  color?: string;
  hideInIndicator?: boolean;
  subflowId?: string;
  returnTo?: string;
  initialContext?: Record<string, unknown>;
  type?: string;
  code?: string;
  props?: Record<string, any>;
  display?: {
    stickyRootOnMobile?: boolean;
    rootKeepsChildrenUntil?: string;
    showOn?: 'all' | 'mobile' | 'tablet+' | 'none';
  };
  completeWhen?: string;
  order?: number;
  parentId?: string;
  // [key: string]: unknown;
}

export interface FlowEdge {
  id?: string;
  source: string;
  target: string;
  condition?: string;
}

export interface FlowPolicy {
  id: string;
  when: string;
  onFail?: {
    redirect?: string;
    reason?: string;
  };
  scope?: 'global' | 'node' | 'edge';
}

export interface Flow {
  id: string;
  version: string;
  start: string;
  preload?: boolean; // ← เพิ่มบรรทัดนี้
  returnTo?: string;
  globals?: Record<string, any>;
  nodes: Record<string, FlowNode>;
  edges: FlowEdge[];
  policies?: FlowPolicy[];
  subflows?: Record<string, Flow>;
}

export type FlowCommand =
  | 'START'
  | 'NEXT'
  | 'BACK'
  | 'CLOSE'
  | 'START_SUBFLOW'
  | 'NEXT_SUBFLOW'
  | 'BACK_SUBFLOW'
  | 'CLOSE_SUBFLOW'
  | 'RESUME'
  | 'FLOW_SYNC'
  | 'JUMP_TO'
  | 'RESET'
  | 'ERROR';

export interface FlowEvent {
  command: FlowCommand;
  payload?: Record<string, any> & {
    flow?: Flow;
    startNodeId?: string;
    targetNodeId?: string;
    context?: Record<string, any>;
  };
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  meta?: {
    source?: string;
    ts?: number;
  };
}

export type TelemetryEventType =
  | 'node.enter'
  | 'edge.taken'
  | 'flow.started'
  | 'flow.closed'
  | 'flow.error'
  | 'policy.evaluated'
  | 'subflow.started'
  | 'subflow.closed';

export interface TelemetryEvent {
  type: TelemetryEventType;
  timestamp: Date | number;
  flowId: string;
  nodeId?: string;
  previousNodeId?: string;
  edge?: {
    source: string;
    target: string;
    condition?: string;
  };
  error?: {
    code?: string;
    message?: string;
    stack?: string;
  };
  data?: Record<string, any>;
  role?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export interface FlowState {
  current: FlowNode | null;
  lastTask: FlowNode | null;
  history: FlowNode[];
  flow: Flow | null;
  context: Record<string, any>;
  isRunning: boolean;
  subflowStack: Array<{
    flow: Flow;
    returnTo: string;
    context: Record<string, any>;
  }>;
}
