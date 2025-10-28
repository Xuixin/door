import { Injectable } from "@angular/core";
import {
  ComponentLoader,
  ComponentMetadata,
  ComponentRegistration,
  DuplicateComponentError,
} from "../types/node-component-registry.types";
import { FLOW_ERROR_CODES, FlowError } from "../types/workflow-error";

/**
 * Node Component Registry Service
 *
 * A minimal component registry system that provides:
 * - Component registration and lookup
 * - Basic component resolution
 * - Simple fallback mechanism
 */
@Injectable({
  providedIn: "root",
})
export class NodeComponentRegistryService {
  // ========================================
  // INTERNAL STATE
  // ========================================

  // Core registry storage
  private readonly _registrations = new Map<string, ComponentRegistration>();
  private readonly defaultFallbackId = "default-fallback";

  constructor() {
    this._registerWorkflowComponents();
  }

  /**
   * Register a component with the registry
   */
  public register<T = any>(
    id: string,
    loader: ComponentLoader<T>,
    metadata?: ComponentMetadata
  ): void {
    if (this._registrations.has(id)) {
      throw new DuplicateComponentError(id);
    }

    const registration: ComponentRegistration<T> = {
      id,
      loader,
      metadata: {
        name: id,
        ...metadata,
      },
      registeredAt: new Date(),
      accessCount: 0,
    };

    this._registrations.set(id, registration);
  }

  /**
   * Get a component by ID
   */
  public async get<T = any>(id: string): Promise<T> {
    const registration = this._registrations.get(id);

    if (!registration) {
      console.warn("Component not found, trying fallback", {
        requestedId: id,
        fallbackId: this.defaultFallbackId,
      });

      // Try fallback component
      const fallbackRegistration = this._registrations.get(
        this.defaultFallbackId
      );
      if (fallbackRegistration) {
        return await this._loadComponent<T>(fallbackRegistration);
      }

      throw new FlowError(
        `Component '${id}' not found and no fallback available`,
        FLOW_ERROR_CODES.COMPONENT_NOT_FOUND,
        { componentId: id, fallbackId: this.defaultFallbackId }
      );
    }

    return await this._loadComponent<T>(registration);
  }

  /**
   * Check if a component is registered
   */
  public has(id: string): boolean {
    return this._registrations.has(id);
  }

  // Private methods

  private async _loadComponent<T>(
    registration: ComponentRegistration<T>
  ): Promise<T> {
    try {
      const component = await registration.loader();
      if (!component) {
        throw new FlowError(
          "Component loader returned null or undefined",
          FLOW_ERROR_CODES.COMPONENT_LOAD_FAILED,
          { componentId: registration.id }
        );
      }

      // Update access count for analytics
      registration.accessCount++;

      return component;
    } catch (error) {
      console.error("Failed to load component", {
        componentId: registration.id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw FlowError.from(error, FLOW_ERROR_CODES.COMPONENT_LOAD_FAILED, {
        componentId: registration.id,
      });
    }
  }

  private _registerWorkflowComponents(): void {
    // Registry Workflow Components
    this.register("RegistryWalkinSummaryComponent", () =>
      import(
        "../workflow/components/registry-workflow/summary/registry-walkin-summary.component"
      ).then((m) => m.RegistryWalkinSummaryComponent)
    );

    this.register("IdCardCaptureComponent", () =>
      import(
        "../workflow/components/registry-workflow/id-card-capture/id-card-capture.component"
      ).then((m) => m.IdCardCaptureComponent)
    );

    this.register("UserDataFormComponent", () =>
      import(
        "../workflow/components/registry-workflow/user-data/user-data-form.component"
      ).then((m) => m.UserDataFormComponent)
    );

    this.register("DoorPermissionComponent", () =>
      import(
        "../workflow/components/registry-workflow/door-permission/door-permission.component"
      ).then((m) => m.DoorPermissionComponent)
    );

    console.log("All workflow components registered successfully:", {
      totalComponents: this._registrations.size,
      components: Array.from(this._registrations.keys()),
    });
  }
}
