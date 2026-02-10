/**
 * U22: Atomic Match Creation with Pair-Level Guard
 *
 * Prevents race conditions by using a guard document in `activeMatchesByPair` collection.
 * This ensures at most ONE active match exists per user pair at any time.
 *
 * Design:
 * - Guard doc uses pairKey = `${minUid}_${maxUid}` (sorted for consistency)
 * - Match docs keep random IDs for history preservation
 * - All match creation goes through this single atomic transaction
 * - Used by both: offer accept path AND mutual-invite path
 */

import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { ACTIVE_MATCH_STATUSES } from '../constants/state';

const MATCH_GUARD_TTL_HOURS = 2; // Safety TTL for guard cleanup
const MATCH_PRESENCE_TTL_HOURS = 2; // U19: Extend presence expiresAt on match creation

interface CreateMatchAtomicParams {
  user1Uid: string;
  user2Uid: string;
  activity: string;
  durationMinutes: number;
  user1Coords?: { lat: number; lng: number };
  user2Coords?: { lat: number; lng: number };
  // Optional: if this creation is triggered by offer acceptance
  triggeringOfferId?: string;
}

interface CreateMatchAtomicResult {
  matchId: string;
  isNewMatch: boolean; // false if returned existing match (idempotent)
}

/**
 * Compute canonical pair key from two UIDs (sorted)
 * Exported for testing
 */
export function getPairKey(uid1: string, uid2: string): string {
  const [uidA, uidB] = uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
  return `${uidA}_${uidB}`;
}

/**
 * Atomically create a match with pair-level guard
 *
 * Transaction flow:
 * 1. Read guard doc for this pair
 * 2. If guard exists AND referenced match is active → return existing matchId (idempotent)
 * 3. Else → Create new match + guard, update presence + offers
 *
 * @param params - Match creation parameters
 * @param existingTransaction - Optional: if provided, runs within this transaction (for idempotency)
 * @returns matchId (new or existing) and isNewMatch flag
 */
export async function createMatchAtomic(
  params: CreateMatchAtomicParams,
  existingTransaction?: admin.firestore.Transaction
): Promise<CreateMatchAtomicResult> {
  const db = admin.firestore();
  const {
    user1Uid,
    user2Uid,
    activity,
    durationMinutes,
    user1Coords,
    user2Coords,
    triggeringOfferId,
  } = params;

  const pairKey = getPairKey(user1Uid, user2Uid);
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + MATCH_GUARD_TTL_HOURS * 60 * 60 * 1000);

  console.log(`[createMatchAtomic] Starting atomic match creation for pair: ${pairKey}`);

  // Core transaction logic (works with or without existing transaction)
  const executeTransaction = async (transaction: admin.firestore.Transaction) => {
    // Step 1: Read guard doc for this PAIR
    const guardRef = db.collection('activeMatchesByPair').doc(pairKey);
    const guardSnap = await transaction.get(guardRef);

    // Step 2: Check if active match already exists for this PAIR (pair-level guard)
    if (guardSnap.exists) {
      const guardData = guardSnap.data()!;
      const existingMatchId = guardData.matchId;

      console.log(`[createMatchAtomic] Pair guard exists, checking match ${existingMatchId}`);

      // Verify the referenced match still exists and is active
      const matchRef = db.collection('matches').doc(existingMatchId);
      const matchSnap = await transaction.get(matchRef);

      if (matchSnap.exists) {
        const matchData = matchSnap.data()!;
        const matchStatus = matchData.status;

        if (ACTIVE_MATCH_STATUSES.includes(matchStatus)) {
          console.log(
            `[createMatchAtomic] Active match ${existingMatchId} already exists for this pair (status: ${matchStatus}). ` +
            `Returning existing match (idempotent).`
          );
          return {
            matchId: existingMatchId,
            isNewMatch: false,
          };
        } else {
          console.log(
            `[createMatchAtomic] Match ${existingMatchId} exists but inactive (status: ${matchStatus}). ` +
            `Proceeding to create new match.`
          );
        }
      } else {
        console.log(
          `[createMatchAtomic] Guard references non-existent match ${existingMatchId}. ` +
          `Proceeding to create new match.`
        );
      }
    }

    // Step 2.5: USER-LEVEL MUTUAL EXCLUSION (Critical Fix!)
    // Check if EITHER user is already in an active match with ANYONE else
    // This must be inside the transaction to prevent race conditions
    const presence1Ref = db.collection('presence').doc(user1Uid);
    const presence2Ref = db.collection('presence').doc(user2Uid);

    // Sequential reads to avoid transaction retry issues
    const presence1Snap = await transaction.get(presence1Ref);
    const presence2Snap = await transaction.get(presence2Ref);

    // Check user1
    if (presence1Snap.exists) {
      const presence1Data = presence1Snap.data()!;
      if (presence1Data.status === 'matched' && presence1Data.matchId) {
        // Verify this match is active (not the same match we're trying to create for this pair)
        const existingMatchRef = db.collection('matches').doc(presence1Data.matchId);
        const existingMatchSnap = await transaction.get(existingMatchRef);

        if (existingMatchSnap.exists) {
          const existingMatchData = existingMatchSnap.data()!;
          const isPairMatch =
            (existingMatchData.user1Uid === user1Uid && existingMatchData.user2Uid === user2Uid) ||
            (existingMatchData.user1Uid === user2Uid && existingMatchData.user2Uid === user1Uid);

          if (!isPairMatch && ACTIVE_MATCH_STATUSES.includes(existingMatchData.status)) {
            console.log(
              `[createMatchAtomic] User ${user1Uid} is already in active match ${presence1Data.matchId} ` +
              `with another user. Returning existing match (idempotent).`
            );
            // Return existing match instead of throwing (better UX, more idempotent)
            return {
              matchId: presence1Data.matchId,
              isNewMatch: false,
            };
          } else if (!isPairMatch) {
            // Match exists but is terminal - this is dirty data
            console.warn(
              `[createMatchAtomic] User ${user1Uid} presence says matched (${presence1Data.matchId}) ` +
              `but match is terminal (status: ${existingMatchData.status}). Proceeding to create new match.`
            );
          }
        } else {
          // Match doc doesn't exist - this is dirty data
          console.warn(
            `[createMatchAtomic] User ${user1Uid} presence says matched (${presence1Data.matchId}) ` +
            `but match doc does not exist. Proceeding to create new match.`
          );
        }
      }
    }

    // Check user2
    if (presence2Snap.exists) {
      const presence2Data = presence2Snap.data()!;
      if (presence2Data.status === 'matched' && presence2Data.matchId) {
        // Verify this match is active (not the same match we're trying to create for this pair)
        const existingMatchRef = db.collection('matches').doc(presence2Data.matchId);
        const existingMatchSnap = await transaction.get(existingMatchRef);

        if (existingMatchSnap.exists) {
          const existingMatchData = existingMatchSnap.data()!;
          const isPairMatch =
            (existingMatchData.user1Uid === user1Uid && existingMatchData.user2Uid === user2Uid) ||
            (existingMatchData.user1Uid === user2Uid && existingMatchData.user2Uid === user1Uid);

          if (!isPairMatch && ACTIVE_MATCH_STATUSES.includes(existingMatchData.status)) {
            console.log(
              `[createMatchAtomic] User ${user2Uid} is already in active match ${presence2Data.matchId} ` +
              `with another user. Returning existing match (idempotent).`
            );
            // Return existing match instead of throwing (better UX, more idempotent)
            return {
              matchId: presence2Data.matchId,
              isNewMatch: false,
            };
          } else if (!isPairMatch) {
            // Match exists but is terminal - this is dirty data
            console.warn(
              `[createMatchAtomic] User ${user2Uid} presence says matched (${presence2Data.matchId}) ` +
              `but match is terminal (status: ${existingMatchData.status}). Proceeding to create new match.`
            );
          }
        } else {
          // Match doc doesn't exist - this is dirty data
          console.warn(
            `[createMatchAtomic] User ${user2Uid} presence says matched (${presence2Data.matchId}) ` +
            `but match doc does not exist. Proceeding to create new match.`
          );
        }
      }
    }

    // Step 3: No active match exists → Create new match + guard
    console.log(`[createMatchAtomic] Creating NEW match for pair ${pairKey}`);

    // Create new match document with random ID
    const matchRef = db.collection('matches').doc();
    const matchId = matchRef.id;

    const matchData = {
      user1Uid,
      user2Uid,
      activity,
      durationMinutes,
      status: 'pending',
      statusByUser: {
        [user1Uid]: 'pending',
        [user2Uid]: 'pending',
      },
      matchedAt: now,
      createdAt: now,
      lastStatusChange: now,
      user1Coords: user1Coords || null,
      user2Coords: user2Coords || null,
      user1Status: 'pending',
      user2Status: 'pending',
      placeId: null,
      user1PlaceChoice: null,
      user2PlaceChoice: null,
      user1ChoiceExpiry: null,
      user2ChoiceExpiry: null,
      finalPlaceId: null,
      // Track which offer triggered this match (if applicable)
      triggeringOfferId: triggeringOfferId || null,
    };

    transaction.set(matchRef, matchData);

    // Create guard document
    const guardData = {
      pairKey,
      matchId,
      status: 'active',
      activity,
      createdAt: now,
      expiresAt, // Safety TTL for cleanup
    };

    transaction.set(guardRef, guardData);

    // Update both users' presence to 'matched'
    // (presence1Ref and presence2Ref already defined in Step 2.5 above)
    // U19: Save originalExpiresAt and extend expiresAt so presence outlives the match
    const matchPresenceExpiresAt = Timestamp.fromMillis(
      now.toMillis() + MATCH_PRESENCE_TTL_HOURS * 60 * 60 * 1000
    );

    const presence1ExpiresAt = presence1Snap.exists ? presence1Snap.data()!.expiresAt : null;
    transaction.update(presence1Ref, {
      status: 'matched',
      matchId,
      originalExpiresAt: presence1ExpiresAt || null,
      expiresAt: matchPresenceExpiresAt,
      updatedAt: now,
    });

    const presence2ExpiresAt = presence2Snap.exists ? presence2Snap.data()!.expiresAt : null;
    transaction.update(presence2Ref, {
      status: 'matched',
      matchId,
      originalExpiresAt: presence2ExpiresAt || null,
      expiresAt: matchPresenceExpiresAt,
      updatedAt: now,
    });

    console.log(
      `[createMatchAtomic] ✅ Created match ${matchId} with guard ${pairKey}. ` +
      `Updated presence for both users.`
    );

    return {
      matchId,
      isNewMatch: true,
    };
  };

  // If an existing transaction is provided, use it; otherwise create new transaction
  if (existingTransaction) {
    return executeTransaction(existingTransaction);
  } else {
    return db.runTransaction(executeTransaction);
  }
}

/**
 * Release the pair guard when a match transitions to terminal state
 *
 * Call this from:
 * - matches/cancel.ts
 * - matches/cleanupStalePending.ts
 * - any match completion flow
 *
 * @param matchId - The match ID to release
 * @param user1Uid - First user UID
 * @param user2Uid - Second user UID
 */
export async function releaseMatchGuard(
  matchId: string,
  user1Uid: string,
  user2Uid: string
): Promise<void> {
  const db = admin.firestore();
  const pairKey = getPairKey(user1Uid, user2Uid);

  console.log(`[releaseMatchGuard] Releasing guard for pair ${pairKey}, match ${matchId}`);

  await db.runTransaction(async (transaction) => {
    const guardRef = db.collection('activeMatchesByPair').doc(pairKey);
    const guardSnap = await transaction.get(guardRef);

    if (!guardSnap.exists) {
      console.log(`[releaseMatchGuard] Guard ${pairKey} does not exist (already released)`);
      return;
    }

    const guardData = guardSnap.data()!;

    // Only delete if this guard references the match we're releasing
    if (guardData.matchId === matchId) {
      transaction.delete(guardRef);
      console.log(`[releaseMatchGuard] ✅ Released guard ${pairKey} for match ${matchId}`);
    } else {
      console.log(
        `[releaseMatchGuard] Guard ${pairKey} references different match ${guardData.matchId} ` +
        `(expected ${matchId}). Not releasing.`
      );
    }
  });
}