/**
 * Async Utilities
 * 
 * Pure utility functions for async operations
 * No dependencies, can be used anywhere
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  exponentialBackoff?: boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export class AsyncUtils {
  /**
   * Delay execution for specified milliseconds
   * @param ms - Milliseconds to delay
   * @returns Promise<void>
   */
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Wait for a condition to become true
   * @param condition - Function that returns boolean
   * @param timeout - Timeout in milliseconds (default: 5000)
   * @param checkInterval - Interval to check condition in ms (default: 50)
   * @returns Promise<void>
   * @throws Error if timeout is reached
   */
  static async waitFor(
    condition: () => boolean,
    timeout: number = 5000,
    checkInterval: number = 50
  ): Promise<void> {
    const startTime = Date.now();
    
    while (!condition()) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for condition after ${timeout}ms`);
      }
      await this.delay(checkInterval);
    }
  }

  /**
   * Retry a function with exponential backoff
   * @param fn - Async function to retry
   * @param options - Retry options
   * @returns Promise<T> - Result of the function
   * @throws Error if all retry attempts fail
   */
  static async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      exponentialBackoff = true,
      onRetry,
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (attempt === maxAttempts) {
          throw error;
        }

        // Calculate delay
        let delay = initialDelay;
        if (exponentialBackoff) {
          delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
        }

        // Call onRetry callback if provided
        if (onRetry) {
          onRetry(attempt, error);
        }

        // Wait before retrying
        await this.delay(delay);
      }
    }

    throw lastError;
  }

  /**
   * Execute function with timeout
   * @param fn - Async function to execute
   * @param timeoutMs - Timeout in milliseconds
   * @param timeoutMessage - Optional timeout error message
   * @returns Promise<T>
   * @throws Error if timeout is reached
   */
  static async timeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string = `Operation timed out after ${timeoutMs}ms`
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      ),
    ]);
  }

  /**
   * Execute functions in parallel with concurrency limit
   * @param tasks - Array of async functions
   * @param concurrency - Maximum number of concurrent executions
   * @returns Promise<T[]> - Array of results
   */
  static async parallelLimit<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const [index, task] of tasks.entries()) {
      const promise = task().then(result => {
        results[index] = result;
      });

      executing.push(promise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
        executing.splice(
          executing.findIndex(p => p === promise),
          1
        );
      }
    }

    await Promise.all(executing);
    return results;
  }

  /**
   * Sleep for random duration between min and max
   * @param minMs - Minimum milliseconds
   * @param maxMs - Maximum milliseconds
   * @returns Promise<void>
   */
  static async randomDelay(minMs: number, maxMs: number): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    return this.delay(delay);
  }
}
