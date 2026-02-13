/**
 * U23: Client-Side Retry Utility
 *
 * Implements exponential backoff for Cloud Function calls.
 * Generates ONE idempotency key per user action and reuses it across retries.
 *
 * Design Decisions:
 * - Deadline-based: 15s total (not attempt-based, more predictable SLA)
 * - Exponential backoff: 1s → 2s → 4s → 8s → ... until deadline reached
 * - Accounts for actual request execution time in deadline calculation
 * - Longer timeout for DUPLICATE_IN_PROGRESS to avoid false negatives (cold starts)
 * - Refined error classification based on senior backend review
 * - Idempotency key generated once and reused
 */

interface EnhancedError extends Error {
  code: string;
  originalError: unknown;
}

interface RetryOptions {
  maxAttempts?: number; // Deprecated: use maxTotalMs instead
  maxTotalMs?: number; // Total deadline in milliseconds (default: 15000ms = 15s)
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Classify Firebase error codes into retryable vs non-retryable
 *
 * SPECIAL CASE:
 * - already-exists + DUPLICATE_IN_PROGRESS: RETRY (wait for in-progress request)
 *
 * NEVER RETRY:
 * - permission-denied: User doesn't have access
 * - unauthenticated: Not logged in
 * - invalid-argument: Bad request data
 * - not-found: Resource doesn't exist
 * - already-exists: Constraint violation (except DUPLICATE_IN_PROGRESS)
 *
 * ALWAYS RETRY:
 * - unavailable: Service temporarily down
 * - deadline-exceeded: Timeout
 * - internal: Server error
 * - unknown: Network errors often map here
 *
 * Based on: https://firebase.google.com/docs/reference/js/functions#functionserrorcode
 */
function isRetryableError(error: unknown): boolean {
  const errorCode = (error as { code?: string }).code;
  const errorMessage = (error as { message?: string }).message || '';

  // Special case: DUPLICATE_IN_PROGRESS should retry (wait for first request to complete)
  if (errorCode === 'already-exists' && errorMessage.includes('DUPLICATE_IN_PROGRESS')) {
    return true;
  }

  // Never retry - client/auth errors
  const neverRetryCodes = [
    'permission-denied',
    'unauthenticated',
    'invalid-argument',
    'not-found',
    'already-exists', // Constraint violations (but NOT duplicate in-progress)
    'failed-precondition', // Business logic rejection (most cases)
    'out-of-range',
  ];

  if (errorCode && neverRetryCodes.includes(errorCode)) {
    return false;
  }

  // Always retry - transient server errors
  const alwaysRetryCodes = [
    'unavailable',
    'deadline-exceeded',
    'internal',
    'unknown', // Network errors
    'resource-exhausted', // Rate limits (with backoff)
    'aborted', // Transaction conflicts
  ];

  if (errorCode && alwaysRetryCodes.includes(errorCode)) {
    return true;
  }

  // Conservative default: don't retry unknown codes
  return false;
}

/**
 * Generate a UUID for idempotency (SSR-safe)
 *
 * Uses crypto.randomUUID() if available (modern browsers + Node 19+)
 * Falls back to a simple UUID v4 implementation for older environments
 */
export function generateIdempotencyKey(): string {
  // Check if running in browser/Node environment with crypto.randomUUID
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback: Simple UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retry a Cloud Function call with exponential backoff (deadline-based)
 *
 * @param fn - Function to execute (receives idempotencyKey)
 * @param options - Retry configuration
 * @returns Result of the function
 *
 * @example
 * const result = await retryWithBackoff(
 *   (idempotencyKey) => offerCreate({ targetUid: '123', idempotencyKey }),
 *   { maxTotalMs: 15000 }
 * );
 */
export async function retryWithBackoff<T>(
  fn: (idempotencyKey: string) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxTotalMs = 15000, // Default 15s total deadline (includes request execution time)
    initialDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
  } = options;

  // Use deadline-based approach (more predictable SLA)
  const deadline = Date.now() + maxTotalMs;

  // Generate idempotency key ONCE for all retries
  const idempotencyKey = generateIdempotencyKey();
  let lastError: unknown;
  let isDuplicateInProgress = false;
  let attempt = 0;
  let currentDelayMs = initialDelayMs;

  while (Date.now() < deadline) {
    attempt++;

    try {
      // Execute function with same idempotency key
      return await fn(idempotencyKey);
    } catch (error: unknown) {
      lastError = error;
      const errorCode = (error as { code?: string }).code;
      const errorMessage = (error as { message?: string }).message;

      // Track if we're retrying due to duplicate in-progress
      if (errorCode === 'already-exists' && errorMessage?.includes('DUPLICATE_IN_PROGRESS')) {
        isDuplicateInProgress = true;
      }

      // Don't retry on certain error codes
      if (!isRetryableError(error)) {
        console.log(
          `[Retry] Non-retryable error (${errorCode}): ${errorMessage}`
        );
        throw error;
      }

      // Check if we have time left for another retry
      const timeRemaining = deadline - Date.now();
      if (timeRemaining <= 0) {
        // Deadline exceeded - throw error with better message
        const elapsedSeconds = Math.floor(maxTotalMs / 1000);

        if (isDuplicateInProgress) {
          console.error(
            `[Retry] Operation still processing after ${elapsedSeconds}s deadline. ` +
            `Attempts: ${attempt}. Key: ${idempotencyKey.substring(0, 8)}...`
          );
          // Create a more user-friendly error for UI to display
          const enhancedError = new Error(
            'Your request is still being processed. Please check your inbox or matches page in a moment. Avoid tapping repeatedly.'
          ) as EnhancedError;
          enhancedError.code = 'processing-timeout';
          enhancedError.originalError = error;
          throw enhancedError;
        }

        console.error(
          `[Retry] Deadline (${elapsedSeconds}s) exceeded after ${attempt} attempts. ` +
          `Key: ${idempotencyKey.substring(0, 8)}...`
        );
        throw error;
      }

      // Calculate backoff delay (exponential with cap)
      const delay = Math.min(currentDelayMs, maxDelayMs, timeRemaining);

      console.log(
        `[Retry] Attempt ${attempt} failed (${errorCode}), retrying in ${delay}ms... ` +
        `(${Math.floor(timeRemaining / 1000)}s remaining, key: ${idempotencyKey.substring(0, 8)}...)`
      );

      // Wait before retry (but don't exceed deadline)
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff for next iteration
      currentDelayMs = Math.min(
        currentDelayMs * backoffMultiplier,
        maxDelayMs
      );
    }
  }

  // Deadline exceeded (should have been caught above, but safety check)
  if (isDuplicateInProgress) {
    const enhancedError = new Error(
      'Your request is still being processed. Please check your inbox or matches page in a moment. Avoid tapping repeatedly.'
    ) as EnhancedError;
    enhancedError.code = 'processing-timeout';
    enhancedError.originalError = lastError;
    throw enhancedError;
  }

  throw lastError;
}