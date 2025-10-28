import { computed, Injectable, signal } from '@angular/core';
import {
  Flow,
  FlowEdge,
  FlowNode,
  FlowPolicy,
  NodeType,
} from '../types/flow.types';

export interface ValidationError {
  type: 'error' | 'warning';
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  policyId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    criticalErrors: number;
    highSeverityIssues: number;
  };
}

export interface FlowExecutionError {
  code: string;
  message: string;
  nodeId?: string;
  flowId?: string;
  timestamp: Date;
  stack?: string;
  context?: Record<string, any>;
  recoverable: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class FlowValidatorService {
  private readonly _validationErrors = signal<ValidationError[]>([]);
  private readonly _executionErrors = signal<FlowExecutionError[]>([]);

  readonly validationErrors = this._validationErrors.asReadonly();
  readonly executionErrors = this._executionErrors.asReadonly();

  readonly hasValidationErrors = computed(() =>
    this._validationErrors().some(error => error.type === 'error')
  );

  readonly hasCriticalErrors = computed(() =>
    this._validationErrors().some(error => error.severity === 'critical')
  );

  readonly hasExecutionErrors = computed(
    () => this._executionErrors().length > 0
  );

  readonly errorSummary = computed(() => {
    const errors = this._validationErrors();
    return {
      totalErrors: errors.filter(e => e.type === 'error').length,
      totalWarnings: errors.filter(e => e.type === 'warning').length,
      criticalErrors: errors.filter(e => e.severity === 'critical').length,
      highSeverityIssues: errors.filter(
        e => e.severity === 'high' || e.severity === 'critical'
      ).length,
    };
  });

  /**
   * Validate entire flow structure and logic
   */
  validateFlow(flow: Flow): ValidationResult {
    const errors: ValidationError[] = [];

    // Basic flow structure validation
    errors.push(...this.validateFlowStructure(flow));

    // Node validation
    errors.push(...this.validateNodes(flow));

    // Edge validation
    errors.push(...this.validateEdges(flow));

    // Policy validation
    if (flow.policies) {
      errors.push(...this.validatePolicies(flow.policies));
    }

    // Flow connectivity validation
    errors.push(...this.validateFlowConnectivity(flow));

    // Circular dependency check
    errors.push(...this.validateCircularDependencies(flow));

    this._validationErrors.set(errors);

    const result: ValidationResult = {
      isValid: !errors.some(e => e.type === 'error'),
      errors: errors.filter(e => e.type === 'error'),
      warnings: errors.filter(e => e.type === 'warning'),
      summary: {
        totalErrors: errors.filter(e => e.type === 'error').length,
        totalWarnings: errors.filter(e => e.type === 'warning').length,
        criticalErrors: errors.filter(e => e.severity === 'critical').length,
        highSeverityIssues: errors.filter(
          e => e.severity === 'high' || e.severity === 'critical'
        ).length,
      },
    };

    return result;
  }

  /**
   * Validate flow basic structure
   */
  private validateFlowStructure(flow: Flow): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    if (!flow.id) {
      errors.push({
        type: 'error',
        code: 'FLOW_MISSING_ID',
        message: 'Flow must have an ID',
        severity: 'critical',
      });
    }

    if (!flow.version) {
      errors.push({
        type: 'warning',
        code: 'FLOW_MISSING_VERSION',
        message: 'Flow should have a version',
        severity: 'low',
      });
    }

    if (!flow.nodes || Object.keys(flow.nodes).length === 0) {
      errors.push({
        type: 'error',
        code: 'FLOW_NO_NODES',
        message: 'Flow must contain at least one node',
        severity: 'critical',
      });
    }

    if (!flow.start) {
      errors.push({
        type: 'error',
        code: 'FLOW_NO_START_NODE',
        message: 'Flow must specify a start node',
        severity: 'critical',
      });
    } else if (flow.nodes && !flow.nodes[flow.start]) {
      errors.push({
        type: 'error',
        code: 'FLOW_INVALID_START_NODE',
        message: `Start node '${flow.start}' does not exist in flow`,
        severity: 'critical',
      });
    }

    return errors;
  }

  /**
   * Validate all nodes in the flow
   */
  private validateNodes(flow: Flow): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!flow.nodes) return errors;

    Object.values(flow.nodes).forEach(node => {
      errors.push(...this.validateNode(node));
    });

    return errors;
  }

  /**
   * Validate individual node
   */
  private validateNode(node: FlowNode): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required fields
    if (!node.id) {
      errors.push({
        type: 'error',
        code: 'NODE_MISSING_ID',
        message: 'Node must have an ID',
        nodeId: node.id,
        severity: 'critical',
      });
    }

    // Validate node kind
    const validKinds: NodeType[] = ['task', 'guide', 'subflow'];
    if (node.type && !validKinds.includes(node.type)) {
      errors.push({
        type: 'error',
        code: 'NODE_INVALID_KIND',
        message: `Invalid node kind '${node.type}'. Must be one of: ${validKinds.join(', ')}`,
        nodeId: node.id,
        severity: 'high',
      });
    }

    // Validate subflow nodes
    // if (node.type === 'subflow') {
    //   if (!node.config?.entry) {
    //     errors.push({
    //       type: 'error',
    //       code: 'SUBFLOW_MISSING_ENTRY',
    //       message: 'Subflow node must specify an entry point',
    //       nodeId: node.id,
    //       severity: 'high',
    //     });
    //   }

    //   if (!node.config?.returnTo) {
    //     errors.push({
    //       type: 'warning',
    //       code: 'SUBFLOW_MISSING_RETURN',
    //       message: 'Subflow node should specify a return target',
    //       nodeId: node.id,
    //       severity: 'medium',
    //     });
    //   }
    // }

    // Validate dialog nodes
    // if (node.kind === 'dialog') {
    //   if (!node.meta?.isDialog) {
    //     errors.push({
    //       type: 'warning',
    //       code: 'DIALOG_MISSING_META',
    //       message: 'Dialog node should have isDialog meta property set to true',
    //       nodeId: node.id,
    //       severity: 'low',
    //     });
    //   }
    // }

    // Validate page reference
    if (node.config?.page && typeof node.config?.page !== 'string') {
      errors.push({
        type: 'error',
        code: 'NODE_INVALID_PAGE',
        message: 'Node page must be a string',
        nodeId: node.id,
        severity: 'medium',
      });
    }

    return errors;
  }

  /**
   * Validate all edges in the flow
   */
  private validateEdges(flow: Flow): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!flow.edges || !flow.nodes) return errors;

    flow.edges.forEach((edge, index) => {
      errors.push(...this.validateEdge(edge, flow.nodes, index));
    });

    return errors;
  }

  /**
   * Validate individual edge
   */
  private validateEdge(
    edge: FlowEdge,
    nodes: Record<string, FlowNode>,
    index: number
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const edgeId = `edge-${index}`;

    // Check required fields
    if (!edge.source) {
      errors.push({
        type: 'error',
        code: 'EDGE_MISSING_FROM',
        message: 'Edge must specify a source node',
        edgeId,
        severity: 'high',
      });
    }

    if (!edge.target) {
      errors.push({
        type: 'error',
        code: 'EDGE_MISSING_TO',
        message: 'Edge must specify a target node',
        edgeId,
        severity: 'high',
      });
    }

    // Validate node references
    if (edge.source && !nodes[edge.source]) {
      errors.push({
        type: 'error',
        code: 'EDGE_INVALID_FROM_NODE',
        message: `Edge references non-existent source node '${edge.source}'`,
        edgeId,
        severity: 'high',
      });
    }

    if (edge.target && !nodes[edge.target]) {
      errors.push({
        type: 'error',
        code: 'EDGE_INVALID_TO_NODE',
        message: `Edge references non-existent target node '${edge.target}'`,
        edgeId,
        severity: 'high',
      });
    }

    // Self-referencing edge check
    if (edge.source === edge.target) {
      errors.push({
        type: 'warning',
        code: 'EDGE_SELF_REFERENCE',
        message: 'Edge creates a self-loop',
        edgeId,
        severity: 'medium',
      });
    }

    // Validate conditional expression
    if (edge.condition && typeof edge.condition !== 'string') {
      errors.push({
        type: 'error',
        code: 'EDGE_INVALID_CONDITION',
        message: 'Edge condition must be a string expression',
        edgeId,
        severity: 'medium',
      });
    }

    return errors;
  }

  /**
   * Validate flow policies
   */
  private validatePolicies(policies: FlowPolicy[]): ValidationError[] {
    const errors: ValidationError[] = [];

    policies.forEach(policy => {
      if (!policy.id) {
        errors.push({
          type: 'error',
          code: 'POLICY_MISSING_ID',
          message: 'Policy must have an ID',
          policyId: policy.id,
          severity: 'high',
        });
      }

      if (!policy.when) {
        errors.push({
          type: 'error',
          code: 'POLICY_MISSING_CONDITION',
          message: 'Policy must specify a condition',
          policyId: policy.id,
          severity: 'high',
        });
      }

      if (policy.scope && !['global', 'node', 'edge'].includes(policy.scope)) {
        errors.push({
          type: 'error',
          code: 'POLICY_INVALID_SCOPE',
          message: `Invalid policy scope '${policy.scope}'. Must be 'global', 'node', or 'edge'`,
          policyId: policy.id,
          severity: 'medium',
        });
      }
    });

    return errors;
  }

  /**
   * Validate flow connectivity (reachability)
   */
  private validateFlowConnectivity(flow: Flow): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!flow.nodes || !flow.edges || !flow.start) return errors;

    const nodeIds = Object.keys(flow.nodes);
    const reachableNodes = this.findReachableNodes(flow.start, flow.edges);

    // Find unreachable nodes
    const unreachableNodes = nodeIds.filter(
      nodeId => nodeId !== flow.start && !reachableNodes.has(nodeId)
    );

    unreachableNodes.forEach(nodeId => {
      errors.push({
        type: 'warning',
        code: 'NODE_UNREACHABLE',
        message: `Node '${nodeId}' is not reachable from the start node`,
        nodeId,
        severity: 'medium',
      });
    });

    // Find nodes with no outgoing edges (potential dead ends)
    const nodesWithOutgoing = new Set(flow.edges.map(edge => edge.source));
    const deadEndNodes = nodeIds.filter(
      nodeId => !nodesWithOutgoing.has(nodeId)
    );

    deadEndNodes.forEach(nodeId => {
      if (nodeId !== flow.start) {
        // Start node can be a dead end
        errors.push({
          type: 'warning',
          code: 'NODE_DEAD_END',
          message: `Node '${nodeId}' has no outgoing edges`,
          nodeId,
          severity: 'low',
        });
      }
    });

    return errors;
  }

  /**
   * Validate for circular dependencies
   */
  private validateCircularDependencies(flow: Flow): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!flow.nodes || !flow.edges) return errors;

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (nodeId: string): boolean => {
      if (recursionStack.has(nodeId)) {
        return true; // Cycle detected
      }

      if (visited.has(nodeId)) {
        return false; // Already processed
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      // Check all outgoing edges
      const outgoingEdges = flow.edges.filter(edge => edge.source === nodeId);
      for (const edge of outgoingEdges) {
        if (hasCycle(edge.target)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    Object.keys(flow.nodes).forEach(nodeId => {
      if (!visited.has(nodeId) && hasCycle(nodeId)) {
        errors.push({
          type: 'error',
          code: 'FLOW_CIRCULAR_DEPENDENCY',
          message: `Circular dependency detected involving node '${nodeId}'`,
          nodeId,
          severity: 'high',
        });
      }
    });

    return errors;
  }

  /**
   * Find all nodes reachable from a start node
   */
  private findReachableNodes(
    startNodeId: string,
    edges: FlowEdge[]
  ): Set<string> {
    const reachable = new Set<string>();
    const queue = [startNodeId];

    while (queue.length > 0) {
      const currentNode = queue.shift()!;

      if (reachable.has(currentNode)) {
        continue;
      }

      reachable.add(currentNode);

      // Add all target nodes of outgoing edges
      const outgoingEdges = edges.filter(edge => edge.source === currentNode);
      outgoingEdges.forEach(edge => {
        if (!reachable.has(edge.target)) {
          queue.push(edge.target);
        }
      });
    }

    return reachable;
  }

  /**
   * Record execution error
   */
  recordExecutionError(error: Omit<FlowExecutionError, 'timestamp'>): void {
    const executionError: FlowExecutionError = {
      ...error,
      timestamp: new Date(),
    };

    this._executionErrors.update(errors => [...errors, executionError]);
  }

  /**
   * Clear execution errors
   */
  clearExecutionErrors(): void {
    this._executionErrors.set([]);
  }

  /**
   * Clear validation errors
   */
  clearValidationErrors(): void {
    this._validationErrors.set([]);
  }

  /**
   * Get errors by severity
   */
  getErrorsBySeverity(
    severity: 'low' | 'medium' | 'high' | 'critical'
  ): ValidationError[] {
    return this._validationErrors().filter(
      error => error.severity === severity
    );
  }

  /**
   * Get errors by type
   */
  getErrorsByType(type: 'error' | 'warning'): ValidationError[] {
    return this._validationErrors().filter(error => error.type === type);
  }

  /**
   * Check if flow can be executed safely
   */
  canExecuteFlow(): boolean {
    const criticalErrors = this.getErrorsBySeverity('critical');
    const highSeverityErrors = this.getErrorsBySeverity('high');

    return criticalErrors.length === 0 && highSeverityErrors.length === 0;
  }

  /**
   * Get execution readiness report
   */
  getExecutionReadinessReport(): {
    canExecute: boolean;
    blockingIssues: ValidationError[];
    warnings: ValidationError[];
    recommendations: string[];
  } {
    const criticalErrors = this.getErrorsBySeverity('critical');
    const highErrors = this.getErrorsBySeverity('high');
    const blockingIssues = [...criticalErrors, ...highErrors];
    const warnings = [
      ...this.getErrorsBySeverity('medium'),
      ...this.getErrorsBySeverity('low'),
    ];

    const recommendations: string[] = [];

    if (warnings.length > 0) {
      recommendations.push(
        'Review and address validation warnings before execution'
      );
    }

    if (this._executionErrors().length > 0) {
      recommendations.push(
        'Clear previous execution errors before starting new flow'
      );
    }

    return {
      canExecute: blockingIssues.length === 0,
      blockingIssues,
      warnings,
      recommendations,
    };
  }
}
