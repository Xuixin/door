import { computed, inject, Injectable, signal, Type } from '@angular/core';
import { ModalController, ModalOptions } from '@ionic/angular';
import { Subject } from 'rxjs';

/**
 * Modal layer types for the 3-layer system
 */
export type ModalType = 'main' | 'nested' | 'subflow' | 'global';

/**
 * Modal state for tracking modal in the layer system
 */
export interface ModalState {
  id: string;
  nodeId: string;
  flowId: string;
  type: ModalType;
  level: number;
  parentModalId?: string;
  component: Type<any>;
  data?: any;
  createdAt: Date;
  modalElement?: HTMLIonModalElement;
}

/**
 * Modal event types for tracking modal lifecycle
 */
export interface ModalEvent {
  type: 'opened' | 'closed' | 'dismissed' | 'error';
  modalId: string;
  nodeId: string;
  flowId: string;
  level: number;
  data?: any;
  error?: Error;
  timestamp: Date;
}

/**
 * Modal result when a modal is closed with data
 */
export interface ModalResult<T = any> {
  data?: T;
  role?: string;
  dismissed: boolean;
}

/**
 * Configuration for modal presentation
 */
export interface FlowModalConfig extends Omit<ModalOptions, 'component'> {
  component: Type<any>;
  nodeId: string;
  flowId: string;
  type?: ModalType;
  parentModalId?: string;
  data?: any;
  allowBackdropDismiss?: boolean;
  stickyRootOnMobile?: boolean;
}

/**
 * Service for managing nested modals in workflow contexts
 */
@Injectable({
  providedIn: 'root',
})
export class ModalsControllerService {
  private readonly modalController = inject(ModalController);
  private readonly modals = signal<Map<string, ModalState>>(new Map());
  private readonly _events = new Subject<ModalEvent>();

  // Public observables
  readonly events$ = this._events.asObservable();

  // ========== COMPUTED STATES ==========

  // Count total modals
  readonly modalCount = computed(() => this.modals().size);

  // Check if any modal is open
  readonly hasOpenModals = computed(() => this.modals().size > 0);

  // Get current level depth
  readonly currentLevel = computed(() => {
    const current = this.getCurrentMainModal();
    return current ? current.level : 0;
  });

  // ========== ACTIVE MODAL GETTERS ==========

  /**
   * Get active main workflow modals
   */
  readonly activeMainModals = computed(() => {
    return this.getModalsByType('main');
  });

  /**
   * Get active nested workflow modals
   */
  readonly activeNestedModals = computed(() => {
    return this.getModalsByType('nested');
  });

  /**
   * Get active subflow modals
   */
  readonly activeSubflowModals = computed(() => {
    return this.getModalsByType('subflow');
  });

  /**
   * Get active global modals
   */
  readonly activeGlobalModals = computed(() => {
    return this.getModalsByType('global');
  });

  /**
   * Check which modal types are currently active
   */
  readonly activeModalTypes = computed((): ModalType[] => {
    const modalsMap = this.modals();
    const types = new Set<ModalType>();

    modalsMap.forEach((modal) => {
      types.add(modal.type);
    });

    return Array.from(types);
  });

  constructor() {
    this.setupEventLogging();
  }

  // ========== MAIN METHODS ==========

  /**
   * Opens a modal based on type
   */
  async openModal<T = any>(config: FlowModalConfig): Promise<ModalResult<T>> {
    const modalType = config.type || 'main';
    const modalId = this.generateModalId(config.nodeId, modalType);

    try {
      const modalState = this.createModalState(modalId, config, modalType);
      const modalOptions = this.createModalOptions(config, modalState);

      // Create and present modal
      const modal = await this.modalController.create(modalOptions);
      modalState.modalElement = modal;

      // Update state
      this.addModal(modalId, modalState);
      this.emitEvent(this.createEvent('opened', modalState, config.data));

      // Present and wait for dismissal
      await modal.present();
      const result = await modal.onDidDismiss<T>();

      // Clean up
      this.removeModal(modalId);
      this.emitEvent(
        this.createEvent(
          result.role === 'backdrop' ? 'dismissed' : 'closed',
          modalState,
          result.data
        )
      );

      return {
        data: result.data,
        role: result.role,
        dismissed: result.role === 'backdrop' || result.role === 'cancel',
      };
    } catch (error) {
      this.handleError(modalId, config, error as Error);
      throw error;
    }
  }

  // ========== TYPE-SPECIFIC CLOSE METHODS ==========

  /**
   * Close the topmost main modal
   */
  async closeMainModal<T = any>(data?: T, role?: string): Promise<boolean> {
    const modal = this.getCurrentMainModal();
    return modal ? this.closeModal(modal.id, data, role) : false;
  }

  /**
   * Close all main modals
   */
  async closeAllMainModals(): Promise<void> {
    const mainModals = this.getModalsByType('main');
    await this.closeModalsByType(mainModals);
  }

  /**
   * Close the topmost nested modal
   */
  async closeNestedModal<T = any>(data?: T, role?: string): Promise<boolean> {
    const modal = this.getCurrentNestedModal();
    return modal ? this.closeModal(modal.id, data, role) : false;
  }

  /**
   * Close all nested modals
   */
  async closeAllNestedModals(): Promise<void> {
    const nestedModals = this.getModalsByType('nested');
    await this.closeModalsByType(nestedModals);
  }

  /**
   * Close the topmost subflow modal
   */
  async closeSubflowModal<T = any>(data?: T, role?: string): Promise<boolean> {
    const modal = this.getCurrentSubflowModal();
    return modal ? this.closeModal(modal.id, data, role) : false;
  }

  /**
   * Close all subflow modals
   */
  async closeAllSubflowModals(): Promise<void> {
    const subflowModals = this.getModalsByType('subflow');
    await this.closeModalsByType(subflowModals);
  }

  /**
   * Close a specific modal by ID
   */
  async closeModal<T = any>(
    modalId: string,
    data?: T,
    role?: string
  ): Promise<boolean> {
    const modalState = this.modals().get(modalId);
    if (!modalState?.modalElement) {
      return false;
    }

    try {
      // Add a small delay (100ms) to ensure smooth animation and prevent visual glitches
      // This timing aligns better with Ionic's default animation duration
      setTimeout(async () => {
        await modalState.modalElement?.dismiss(data, role);
      }, 100);
      return true;
    } catch (error) {
      console.error(`Failed to close modal ${modalId}:`, error);
      return false;
    }
  }

  /**
   * Close all modals regardless of type
   */
  async closeAllModals(): Promise<void> {
    const allModals = Array.from(this.modals().values());
    await this.closeModalsByType(allModals);
    this.modals.set(new Map());
  }

  // ========== TYPE-SPECIFIC GETTERS ==========

  /**
   * Get current (topmost) main modal
   */
  getCurrentMainModal(): ModalState | null {
    const mainModals = this.getModalsByType('main');
    return mainModals[mainModals.length - 1] || null;
  }

  /**
   * Get current (topmost) nested modal
   */
  getCurrentNestedModal(): ModalState | null {
    const nestedModals = this.getModalsByType('nested');
    return nestedModals[nestedModals.length - 1] || null;
  }

  /**
   * Get current (topmost) subflow modal
   */
  getCurrentSubflowModal(): ModalState | null {
    const subflowModals = this.getModalsByType('subflow');
    return subflowModals[subflowModals.length - 1] || null;
  }

  /**
   * Get all modals of a specific type
   */
  getModalsByType(type: ModalType): ModalState[] {
    const modalsMap = this.modals();
    return Array.from(modalsMap.values())
      .filter((modal) => modal.type === type)
      .sort((a, b) => a.level - b.level);
  }

  /**
   * Get all modals for a specific flow
   */
  getModalsByFlow(flowId: string): ModalState[] {
    const modalsMap = this.modals();
    return Array.from(modalsMap.values())
      .filter((modal) => modal.flowId === flowId)
      .sort((a, b) => a.level - b.level);
  }

  // ========== TYPE CHECKING METHODS ==========

  /**
   * Check if a specific modal type is active
   */
  isModalTypeActive(type: ModalType): boolean {
    return this.getModalsByType(type).length > 0;
  }

  /**
   * Check if main modals are active
   */
  hasMainModals(): boolean {
    return this.isModalTypeActive('main');
  }

  /**
   * Check if nested modals are active
   */
  hasNestedModals(): boolean {
    return this.isModalTypeActive('nested');
  }

  /**
   * Check if subflow modals are active
   */
  hasSubflowModals(): boolean {
    return this.isModalTypeActive('subflow');
  }

  /**
   * Check if a specific modal exists
   */
  hasModal(modalId: string): boolean {
    return this.modals().has(modalId);
  }

  /**
   * Check if a flow has any open modals
   */
  hasModalsForFlow(flowId: string): boolean {
    return this.getModalsByFlow(flowId).length > 0;
  }

  // ========== PRIVATE HELPER METHODS ==========

  private createModalState(
    modalId: string,
    config: FlowModalConfig,
    type: ModalType
  ): ModalState {
    return {
      id: modalId,
      nodeId: config.nodeId,
      flowId: config.flowId,
      type,
      level: this.modals().size,
      parentModalId: config.parentModalId,
      component: config.component,
      data: config.data,
      createdAt: new Date(),
    };
  }

  private createModalOptions(
    config: FlowModalConfig,
    modalState: ModalState
  ): ModalOptions {
    const cssClasses = this.getModalCssClasses(modalState.type);

    return {
      component: config.component,
      componentProps: {
        nodeId: config.nodeId,
        flowId: config.flowId,
        modalId: modalState.id,
        level: modalState.level,
        type: modalState.type,
        data: config.data,
      },
      backdropDismiss: config.allowBackdropDismiss ?? false,
      showBackdrop: true,
      animated: true,
      mode: 'md',
      cssClass: cssClasses,
      presentingElement:
        modalState.level > 0 ? this.getCurrentPresentingElement() : undefined,
      ...this.extractIonicOptions(config),
    };
  }

  private getModalCssClasses(type: ModalType): string[] {
    const baseClasses = ['modal'];

    switch (type) {
      case 'main':
        return [...baseClasses, 'main-modal', 'fullscreen-modal'];
      case 'nested':
        return [...baseClasses, 'nested-modal', 'fullscreen-modal'];
      case 'subflow':
        return [
          ...baseClasses,
          'nested-modal',
          'fullscreen-modal',
          'modal-blur-backdrop',
        ];
      case 'global':
        return [...baseClasses, 'global-modal'];
      default:
        return baseClasses;
    }
  }

  private extractIonicOptions(config: FlowModalConfig): Partial<ModalOptions> {
    const {
      component,
      nodeId,
      flowId,
      type,
      parentModalId,
      data,
      allowBackdropDismiss,
      stickyRootOnMobile,
      ...ionicOptions
    } = config;

    return ionicOptions;
  }

  private getCurrentPresentingElement(): HTMLIonModalElement | undefined {
    const current = this.getCurrentMainModal();
    return current?.modalElement;
  }

  private async closeModalsByType(modals: ModalState[]): Promise<void> {
    const closePromises = modals
      .reverse()
      .map((modal) => this.closeModal(modal.id));

    await Promise.all(closePromises);
  }

  private addModal(modalId: string, modalState: ModalState): void {
    this.modals.update((modals) => {
      const newModals = new Map(modals);
      newModals.set(modalId, modalState);
      return newModals;
    });
  }

  private removeModal(modalId: string): void {
    this.modals.update((modals) => {
      const newModals = new Map(modals);
      newModals.delete(modalId);
      return newModals;
    });
  }

  private generateModalId(nodeId: string, type: ModalType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 5);
    return `${type}-modal-${nodeId}-${timestamp}-${random}`;
  }

  private createEvent(
    type: 'opened' | 'closed' | 'dismissed' | 'error',
    modalState: ModalState,
    data?: any
  ): ModalEvent {
    return {
      type,
      modalId: modalState.id,
      nodeId: modalState.nodeId,
      flowId: modalState.flowId,
      level: modalState.level,
      data,
      timestamp: new Date(),
    };
  }

  private handleError(
    modalId: string,
    config: FlowModalConfig,
    error: Error
  ): void {
    this.emitEvent({
      type: 'error',
      modalId,
      nodeId: config.nodeId,
      flowId: config.flowId,
      level: this.modals().size,
      error,
      timestamp: new Date(),
    });
  }

  private emitEvent(event: ModalEvent): void {
    this._events.next(event);
  }

  private setupEventLogging(): void {
    this.events$.subscribe((event) => {
      console.log('modal_event', event.nodeId, {
        eventType: event.type,
        modalId: event.modalId,
        flowId: event.flowId,
        level: event.level,
      });
    });
  }

  /**
   * Reset service state (useful for testing)
   */
  reset(): void {
    this.modals.set(new Map());
  }
}
