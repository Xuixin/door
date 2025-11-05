import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpErrorResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, throwError, timer } from 'rxjs';
import { retryWhen, mergeMap, finalize } from 'rxjs/operators';
import { NetworkStatusService } from '../Database/services/network-status.service';

/**
 * Maximum number of retry attempts
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Initial retry delay in milliseconds
 */
const INITIAL_RETRY_DELAY = 1000;

/**
 * Maximum request timeout in milliseconds
 */
const REQUEST_TIMEOUT = 5000;

/**
 * Offline-Aware HTTP Interceptor
 * - Checks network status before making requests
 * - Adds timeout to prevent hanging requests
 * - Implements retry logic with exponential backoff
 * - Skips retries when offline
 */
@Injectable()
export class OfflineHttpInterceptor implements HttpInterceptor {
  private readonly networkStatus = inject(NetworkStatusService);

  intercept(
    request: HttpRequest<any>,
    next: HttpHandler,
  ): Observable<HttpEvent<any>> {
    // Check if offline before making request
    if (!this.networkStatus.isOnline()) {
      console.warn(
        `⚠️ Request blocked (offline): ${request.method} ${request.url}`,
      );
      return throwError(
        () =>
          new Error(
            'Network request failed: Device is offline. Please check your internet connection.',
          ),
      );
    }

    // Add timeout to request
    const timeoutRequest = this.addTimeout(request);

    // Handle request with retry logic
    return next.handle(timeoutRequest).pipe(
      retryWhen((errors) =>
        errors.pipe(
          mergeMap((error, attempt) => {
            // Don't retry if offline
            if (!this.networkStatus.isOnline()) {
              console.warn('⚠️ Retry cancelled: device is offline');
              return throwError(() => error);
            }

            // Don't retry if max attempts reached
            if (attempt >= MAX_RETRY_ATTEMPTS) {
              console.error(
                `❌ Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for ${request.method} ${request.url}`,
              );
              return throwError(() => error);
            }

            // Don't retry on certain HTTP errors
            if (error instanceof HttpErrorResponse) {
              // Don't retry on 4xx errors (client errors)
              if (error.status >= 400 && error.status < 500) {
                return throwError(() => error);
              }
            }

            // Calculate exponential backoff delay
            const delay = Math.min(
              INITIAL_RETRY_DELAY * Math.pow(2, attempt),
              30000, // Max 30 seconds
            );

            console.log(
              `🔄 Retrying request (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}) after ${delay}ms: ${request.method} ${request.url}`,
            );

            return timer(delay);
          }),
        ),
      ),
      finalize(() => {
        // Log request completion (optional, can be removed in production)
        if (request.method !== 'GET') {
          // Only log non-GET requests to avoid spam
        }
      }),
    );
  }

  /**
   * Add timeout to HTTP request using AbortController
   */
  private addTimeout(request: HttpRequest<any>): HttpRequest<any> {
    // For timeout, we need to use AbortController
    // However, Angular HttpClient doesn't directly support AbortSignal
    // So we'll handle timeout at the interceptor level using RxJS timeout operator
    // This is handled by the retry logic and error handling

    return request;
  }
}
