import { Injectable } from '@angular/core';
import { Flow } from '../types/flow.types';
import { REGISTRY_WALKIN_WORKFLOW } from '../workflow/registry-workflow';

@Injectable({ providedIn: 'root' })
export class WorkflowRegistryService {
  private workflows = new Map<string, Flow>();

  constructor() {
    this.registerWorkflows();
  }

  private registerWorkflows() {
    // Register all workflows
    this.register(REGISTRY_WALKIN_WORKFLOW);
  }

  register(workflow: Flow) {
    this.workflows.set(workflow.id, workflow);
  }

  getWorkflow(id: string): Flow | undefined {
    return this.workflows.get(id);
  }

  getAllWorkflows(): Flow[] {
    return Array.from(this.workflows.values());
  }

  getWorkflowsWithPreload(): Flow[] {
    return this.getAllWorkflows().filter((w) => w.preload === true);
  }

  extractComponentsFromWorkflow(workflow: Flow): string[] {
    const components = new Set<string>();

    // Extract from main nodes
    Object.values(workflow.nodes).forEach((node) => {
      if (node.config?.page) {
        components.add(node.config.page);
      }
    });

    // Extract from subflows
    if (workflow.subflows) {
      Object.values(workflow.subflows).forEach((subflow) => {
        const subComponents = this.extractComponentsFromWorkflow(subflow);
        subComponents.forEach((c) => components.add(c));
      });
    }

    return Array.from(components);
  }
}
