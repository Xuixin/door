import { Injectable } from '@angular/core';
import { NodeComponentRegistryService } from './node-component-registry.service';
import { WorkflowRegistryService } from './workflow-registry.service';

@Injectable({
  providedIn: 'root',
})
export class WorkflowPreloadService {
  constructor(
    private nodeComponentRegistry: NodeComponentRegistryService,
    private workflowRegistry: WorkflowRegistryService,
  ) {}

  /**
   * Preload all workflow components
   */
  async preloadWorkflowComponents(): Promise<void> {
    const startTime = performance.now();

    try {
      console.log('📦 [WorkflowPreload] Starting component preload...');

      // Get all workflows with preload flag
      const workflowsToPreload =
        this.workflowRegistry.getWorkflowsWithPreload();

      // Extract all components from workflows
      const allComponents = new Set<string>();
      workflowsToPreload.forEach((workflow) => {
        const components =
          this.workflowRegistry.extractComponentsFromWorkflow(workflow);
        components.forEach((c) => allComponents.add(c));
      });

      const componentKeys = Array.from(allComponents);
      console.log(
        `📦 Total components to preload: ${componentKeys.length}`,
        componentKeys,
      );

      // Preload all components
      const preloadPromises = componentKeys.map(async (key) => {
        const componentStartTime = performance.now();
        try {
          await this.nodeComponentRegistry.get(key);
        } catch (err) {
          console.warn(`❌ Failed to preload ${key}:`, err);
        }
      });

      await Promise.allSettled(preloadPromises);
    } catch (error) {
      console.error('💥 Error during preload:', error);
    }
  }
}
