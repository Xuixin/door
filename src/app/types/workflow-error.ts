/**
 * Flow Error Codes
 */
export const FLOW_ERROR_CODES = {
  // Lifecycle errors
  FLOW_ALREADY_ACTIVE: 'FLOW_ALREADY_ACTIVE',
  FLOW_START_FAILED: 'FLOW_START_FAILED',
  FLOW_CLOSE_FAILED: 'FLOW_CLOSE_FAILED',
  FLOW_TIMEOUT: 'FLOW_TIMEOUT',
  RESET_FAILED: 'RESET_FAILED',

  // Navigation errors
  NAVIGATION_NOT_ALLOWED: 'NAVIGATION_NOT_ALLOWED',
  NAVIGATION_FAILED: 'NAVIGATION_FAILED',
  INVALID_NODE_ID: 'INVALID_NODE_ID',
  NODE_NOT_FOUND: 'NODE_NOT_FOUND',

  // Subflow errors
  SUBFLOW_NOT_FOUND: 'SUBFLOW_NOT_FOUND',
  SUBFLOW_START_FAILED: 'SUBFLOW_START_FAILED',
  SUBFLOW_TIMEOUT: 'SUBFLOW_TIMEOUT',
  NOT_IN_SUBFLOW: 'NOT_IN_SUBFLOW',

  // Context and data errors
  CONTEXT_UPDATE_FAILED: 'CONTEXT_UPDATE_FAILED',
  INVALID_CONTEXT_DATA: 'INVALID_CONTEXT_DATA',

  // Component and modal errors
  COMPONENT_NOT_FOUND: 'COMPONENT_NOT_FOUND',
  COMPONENT_LOAD_FAILED: 'COMPONENT_LOAD_FAILED',
  MODAL_OPEN_FAILED: 'MODAL_OPEN_FAILED',
  MODAL_CLOSE_FAILED: 'MODAL_CLOSE_FAILED',

  // Validation errors
  FLOW_VALIDATION_FAILED: 'FLOW_VALIDATION_FAILED',
  EDGE_CONDITION_INVALID: 'EDGE_CONDITION_INVALID',

  // Runtime errors
  COMMAND_EXECUTION_FAILED: 'COMMAND_EXECUTION_FAILED',
  CONDITION_EVALUATION_FAILED: 'CONDITION_EVALUATION_FAILED',
  STATE_CORRUPTION: 'STATE_CORRUPTION',

  // Configuration errors
  INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',
} as const;

export type FlowErrorCode = keyof typeof FLOW_ERROR_CODES;

/**
 * Flow execution context type
 */
export type FlowContext = Record<string, unknown>;

/**
 * Enhanced flow error with detailed context and recovery information
 */
export class FlowError extends Error {
  public override readonly name = 'FlowError';
  public readonly timestamp = new Date();

  constructor(
    message: string,
    public readonly code: FlowErrorCode | string,
    public readonly context?: FlowContext,
    public readonly cause?: Error,
    public readonly recoverable: boolean = true
  ) {
    super(message);

    // Maintain proper stack trace for V8
    if ((Error as any).captureStackTrace) {
      (Error as any).captureStackTrace(this, FlowError);
    }

    // Include cause in stack trace if available
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }

  /**
   * Create a flow error from an unknown error
   */
  static from(
    error: unknown,
    code: FlowErrorCode | string,
    context?: FlowContext,
    recoverable: boolean = true
  ): FlowError {
    if (error instanceof FlowError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    return new FlowError(message, code, context, cause, recoverable);
  }

  /**
   * Create a non-recoverable flow error
   */
  static critical(
    message: string,
    code: FlowErrorCode | string,
    context?: FlowContext,
    cause?: Error
  ): FlowError {
    return new FlowError(message, code, context, cause, false);
  }

  /**
   * Create a recoverable flow error
   */
  static recoverable(
    message: string,
    code: FlowErrorCode | string,
    context?: FlowContext,
    cause?: Error
  ): FlowError {
    return new FlowError(message, code, context, cause, true);
  }

  /**
   * Get a JSON representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Get a user-friendly error message
   */
  getUserMessage(): string {
    const codeMessages: Record<string, string> = {
      [FLOW_ERROR_CODES.NAVIGATION_NOT_ALLOWED]:
        'Cannot navigate to the next step at this time.',
      [FLOW_ERROR_CODES.SUBFLOW_NOT_FOUND]:
        'The requested workflow step could not be found.',
      [FLOW_ERROR_CODES.FLOW_TIMEOUT]:
        'The workflow operation timed out. Please try again.',
      [FLOW_ERROR_CODES.COMPONENT_LOAD_FAILED]:
        'Unable to load the requested page. Please refresh and try again.',
      [FLOW_ERROR_CODES.MODAL_OPEN_FAILED]:
        'Unable to open the workflow step. Please try again.',
    };

    return (
      codeMessages[this.code] ||
      'An unexpected error occurred. Please try again.'
    );
  }
}

/**
 * Result type for operations that can fail gracefully
 */
export type FlowResult<T, E = FlowError> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Helper functions for creating results
 */
export const FlowResult = {
  success: <T>(data: T): FlowResult<T> => ({ success: true, data }),
  failure: <T, E = FlowError>(error: E): FlowResult<T, E> => ({
    success: false,
    error,
  }),
} as const;

/**
 * Type guard for successful results
 */
export function isSuccessResult<T, E>(
  result: FlowResult<T, E>
): result is { success: true; data: T } {
  return result.success;
}

/**
 * Type guard for failed results
 */
export function isFailureResult<T, E>(
  result: FlowResult<T, E>
): result is { success: false; error: E } {
  return !result.success;
}
