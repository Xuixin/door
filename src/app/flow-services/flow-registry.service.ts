import { Injectable } from '@angular/core';
import { Flow } from '../types/flow.types';

/**
 * Flow Registry Service for Workflow V2
 * Manages all available flows and subflows in the workflow-v2 system
 */
@Injectable({
  providedIn: 'root',
})
export class FlowRegistryService {
  private flows: Map<string, Flow> = new Map();

  constructor() {}

  /**
   * Register a main flow
   */
  registerFlow(flow: Flow): void {
    this.flows.set(flow.id, flow);
  }

  /**
   * Get a flow by ID (searches flows and embedded subflows)
   */
  getFlow(id: string): Flow | null {
    // First check main flows
    const flow = this.flows.get(id);
    if (flow) {
      return flow;
    }

    // Then check embedded subflows in main flows
    for (const mainFlow of this.flows.values()) {
      if (mainFlow.subflows && mainFlow.subflows[id]) {
        return mainFlow.subflows[id];
      }
    }

    console.warn(`[FlowRegistry] Flow not found: ${id}`);
    return null;
  }

  /**
   * Get a main flow by ID
   */
  getMainFlow(id: string): Flow | null {
    const flow = this.flows.get(id);
    if (!flow) {
      console.warn(`[FlowRegistry] Main flow not found: ${id}`);
    }
    return flow || null;
  }

  /**
   * Get a subflow by ID (searches embedded subflows in main flows)
   */
  getSubflow(id: string): Flow | null {
    // Check embedded subflows in main flows
    for (const flow of this.flows.values()) {
      if (flow.subflows && flow.subflows[id]) {
        return flow.subflows[id];
      }
    }

    console.warn(`[FlowRegistry] Subflow not found: ${id}`);
    return null;
  }

  /**
   * Get all registered flows
   */
  getAllFlows(): Flow[] {
    return Array.from(this.flows.values());
  }

  /**
   * Get all embedded subflows from all main flows
   */
  getAllSubflows(): Flow[] {
    const allSubflows: Flow[] = [];
    for (const flow of this.flows.values()) {
      if (flow.subflows) {
        allSubflows.push(...Object.values(flow.subflows));
      }
    }
    return allSubflows;
  }

  /**
   * Check if a flow exists (checks flows and embedded subflows)
   */
  hasFlow(id: string): boolean {
    // Check main flows
    if (this.flows.has(id)) {
      return true;
    }

    // Check embedded subflows in main flows
    for (const flow of this.flows.values()) {
      if (flow.subflows && flow.subflows[id]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a main flow exists
   */
  hasMainFlow(id: string): boolean {
    return this.flows.has(id);
  }

  /**
   * Check if a subflow exists (checks embedded subflows in main flows)
   */
  hasSubflow(id: string): boolean {
    // Check embedded subflows in main flows
    for (const flow of this.flows.values()) {
      if (flow.subflows && flow.subflows[id]) {
        return true;
      }
    }

    return false;
  }
}
