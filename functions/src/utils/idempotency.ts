import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * U23 Resolution: Atomic Idempotency Utility
 *
 * Prevents duplicate state mutations when clients retry requests.
 * Uses atomic Firestore operations to avoid TOCTOU race conditions.
 *
 * Key Design Decisions (from Senior Backend Review):
 * - Atomic lock via create() - no check-then-set race condition
 * - Minimal result caching - only IDs and flags, not full payloads
 * - Status tracking: processing → completed/failed
 * - 2-hour TTL (sufficient for realistic retry windows)
 * - Transaction-scoped for complex operations
 */

const IDEMPOTENCY_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface MinimalResult {
  primaryId: string;
  secondaryIds?: string[];
  flags?: Record<string, boolean>;
}

export interface IdempotencyRecord {
  requestId: string;
  uid: string;
  operation: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  processingStartedAt?: Timestamp; // U23: Track when processing started (for stale detection)
  completedAt?: Timestamp;
  minimalResult?: MinimalResult;
  error?: string;
}

/**
 * Generate Firestore document ID for idempotency record
 */
function getIdempotencyDocId(uid: string, operation: string, requestId: string): string {
  return `${uid}_${operation}_${requestId}`;
}

/**
 * For NON-TRANSACTIONAL operations: Atomic idempotency lock pattern
 *
 * Pattern:
 * 1. Try to atomically create idempotency record with status='processing'
 * 2. If creation succeeds → acquire lock, execute operation
 * 3. If already exists → check status:
 *    - completed: return cached result
 *    - processing: throw DUPLICATE_IN_PROGRESS error
 *    - failed: allow retry (delete and retry create)
 * 4. After operation succeeds, update status to 'completed'
 *
 * @param uid - User ID
 * @param operation - Operation name (e.g., 'matchCancel')
 * @param requestId - Client-provided idempotency key
 * @param operationFn - Function to execute (must return MinimalResult)
 * @returns MinimalResult with cached flag
 */
export async function withIdempotencyLock<T extends MinimalResult>(
  uid: string,
  operation: string,
  requestId: string | undefined,
  operationFn: () => Promise<T>
): Promise<{ result: T; cached: boolean }> {
  // No idempotency key provided → skip idempotency (backward compatible)
  if (!requestId) {
    console.log(`[Idempotency] No key provided for ${operation} - skipping idempotency`);
    const result = await operationFn();
    return { result, cached: false };
  }

  const db = admin.firestore();
  const docId = getIdempotencyDocId(uid, operation, requestId);
  const idempotencyRef = db.collection('idempotency').doc(docId);
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + IDEMPOTENCY_TTL_MS);

  // Step 1: Attempt atomic lock acquisition via create()
  try {
    await idempotencyRef.create({
      requestId,
      uid,
      operation,
      status: 'processing',
      createdAt: now,
      expiresAt,
      processingStartedAt: now, // U23: Track start time for stale detection
    } as IdempotencyRecord);

    console.log(`[Idempotency] Lock acquired for ${operation} (key: ${requestId.substring(0, 8)}...)`);
  } catch (error: any) {
    // Lock already exists - check its status
    if (error.code === 6 || error.code === 'already-exists') {
      const doc = await idempotencyRef.get();

      if (!doc.exists) {
        // Race condition: doc was deleted between create() and get()
        console.warn(`[Idempotency] Race condition detected - retrying lock acquisition`);
        // Retry once
        return withIdempotencyLock(uid, operation, requestId, operationFn);
      }

      const data = doc.data() as IdempotencyRecord;

      // Check if expired
      if (data.expiresAt.toMillis() < Date.now()) {
        console.log(`[Idempotency] Expired record - deleting and retrying (key: ${requestId.substring(0, 8)}...)`);
        await idempotencyRef.delete();
        return withIdempotencyLock(uid, operation, requestId, operationFn);
      }

      // Handle based on status
      if (data.status === 'completed') {
        console.log(`[Idempotency] Cache hit - returning cached result (key: ${requestId.substring(0, 8)}...)`);
        return { result: data.minimalResult as T, cached: true };
      }

      if (data.status === 'processing') {
        // U23: Check for stale lock (process crashed/timeout)
        const STALE_LOCK_THRESHOLD_MS = 60 * 1000; // 60 seconds
        const processingStartTime = data.processingStartedAt?.toMillis() || data.createdAt.toMillis();
        const processingDuration = Date.now() - processingStartTime;

        if (processingDuration > STALE_LOCK_THRESHOLD_MS) {
          console.warn(
            `[Idempotency] Stale lock detected (processing for ${Math.floor(processingDuration / 1000)}s). ` +
            `Assuming process crashed - marking as failed and allowing retry (key: ${requestId.substring(0, 8)}...)`
          );

          // Mark as failed to allow retry
          await idempotencyRef.update({
            status: 'failed',
            error: `Stale lock - processing exceeded ${STALE_LOCK_THRESHOLD_MS / 1000}s threshold`,
            completedAt: Timestamp.now(),
          });

          // Retry the operation
          return withIdempotencyLock(uid, operation, requestId, operationFn);
        }

        console.log(
          `[Idempotency] Duplicate in-progress detected (processing for ${Math.floor(processingDuration / 1000)}s) ` +
          `(key: ${requestId.substring(0, 8)}...)`
        );
        throw new HttpsError(
          'already-exists',
          'DUPLICATE_IN_PROGRESS',
          { code: 'DUPLICATE_IN_PROGRESS', message: 'This request is already being processed' }
        );
      }

      if (data.status === 'failed') {
        console.log(`[Idempotency] Previous attempt failed - allowing retry (key: ${requestId.substring(0, 8)}...)`);
        await idempotencyRef.delete();
        return withIdempotencyLock(uid, operation, requestId, operationFn);
      }
    }

    // Unknown error during create
    throw error;
  }

  // Step 2: Lock acquired - execute operation
  try {
    const result = await operationFn();

    // Step 3: Store minimal result
    await idempotencyRef.update({
      status: 'completed',
      completedAt: Timestamp.now(),
      minimalResult: result,
    });

    console.log(`[Idempotency] Operation completed (key: ${requestId.substring(0, 8)}...)`);
    return { result, cached: false };
  } catch (error: any) {
    // Operation failed - mark as failed
    console.error(`[Idempotency] Operation failed (key: ${requestId.substring(0, 8)}...):`, error.message);

    await idempotencyRef.update({
      status: 'failed',
      completedAt: Timestamp.now(),
      error: error.message || 'Unknown error',
    });

    throw error;
  }
}

/**
 * For TRANSACTIONAL operations: Idempotency check inside transaction
 *
 * Usage inside runTransaction:
 * 1. const idempotencyCheck = await checkIdempotencyInTransaction(transaction, ...)
 * 2. if (idempotencyCheck.isDuplicate) return { ...cached result... }
 * 3. ... execute business logic ...
 * 4. await markIdempotencyCompleteInTransaction(transaction, ...)
 *
 * @param transaction - Firestore transaction
 * @param uid - User ID
 * @param operation - Operation name
 * @param requestId - Idempotency key
 * @returns { isDuplicate: boolean, cachedResult?: MinimalResult }
 */
export async function checkIdempotencyInTransaction(
  transaction: admin.firestore.Transaction,
  uid: string,
  operation: string,
  requestId: string | undefined
): Promise<{ isDuplicate: boolean; cachedResult?: MinimalResult }> {
  // No idempotency key → skip
  if (!requestId) {
    return { isDuplicate: false };
  }

  const db = admin.firestore();
  const docId = getIdempotencyDocId(uid, operation, requestId);
  const idempotencyRef = db.collection('idempotency').doc(docId);

  // READ ONLY — no writes here. Firestore transactions require all reads
  // before all writes. The lock is effectively held by the transaction itself
  // (optimistic concurrency + automatic retry on contention).
  const doc = await transaction.get(idempotencyRef);

  if (doc.exists) {
    const data = doc.data() as IdempotencyRecord;

    // Check expiration — treat expired records as non-duplicate
    if (data.expiresAt.toMillis() < Date.now()) {
      console.log(`[Idempotency-Tx] Expired record found (key: ${requestId.substring(0, 8)}...)`);
      return { isDuplicate: false };
    }

    // Only completed records are true duplicates
    if (data.status === 'completed') {
      console.log(`[Idempotency-Tx] Cache hit in transaction (key: ${requestId.substring(0, 8)}...)`);
      return { isDuplicate: true, cachedResult: data.minimalResult };
    }

    // Processing or failed: allow retry. Transaction isolation handles dedup —
    // if two concurrent transactions proceed, only one will commit; the other
    // will be retried and see the completed record from the first.
    console.log(`[Idempotency-Tx] Record exists with status '${data.status}' - allowing retry (key: ${requestId.substring(0, 8)}...)`);
    return { isDuplicate: false };
  }

  console.log(`[Idempotency-Tx] No existing record - proceeding (key: ${requestId.substring(0, 8)}...)`);
  return { isDuplicate: false };
}

/**
 * Mark idempotency record as completed inside transaction
 *
 * @param transaction - Firestore transaction
 * @param uid - User ID
 * @param operation - Operation name
 * @param requestId - Idempotency key
 * @param minimalResult - Result to cache
 */
export async function markIdempotencyCompleteInTransaction(
  transaction: admin.firestore.Transaction,
  uid: string,
  operation: string,
  requestId: string | undefined,
  minimalResult: MinimalResult
): Promise<void> {
  if (!requestId) return;

  const db = admin.firestore();
  const docId = getIdempotencyDocId(uid, operation, requestId);
  const idempotencyRef = db.collection('idempotency').doc(docId);

  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + IDEMPOTENCY_TTL_MS);

  // Use set() instead of update() — checkIdempotencyInTransaction no longer
  // creates a 'processing' record (to avoid read-before-write violations),
  // so the doc may not exist yet.
  transaction.set(idempotencyRef, {
    requestId,
    uid,
    operation,
    status: 'completed',
    createdAt: now,
    expiresAt,
    completedAt: now,
    minimalResult,
  });

  console.log(`[Idempotency-Tx] Marked completed in transaction (key: ${requestId.substring(0, 8)}...)`);
}