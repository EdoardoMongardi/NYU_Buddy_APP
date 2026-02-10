import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { ACTIVE_MATCH_STATUSES, EXPIRED_PENDING_CONFIRMATION } from '../constants/state';

// Same whitelist as firestore.rules:isAdmin() and admin/layout.tsx
const ADMIN_EMAILS = [
  'edoardo.mongardi18@gmail.com',
  '468327494@qq.com',
];

interface ForceExpireData {
  matchId: string;
  simulateCompletedUids?: string[];
}

interface ForceExpireResult {
  success: boolean;
  matchStatus: string;
  pendingUids: string[];
  user1Uid: string;
  user2Uid: string;
  message: string;
  // Debug fields
  rawStatusByUser: Record<string, string>;
  rawMatchStatus: string;
  simulatedUids: string[];
}

/**
 * Admin-only callable to force-expire an active match for testing.
 *
 * Replicates the cleanup transition logic from presenceCleanupExpired Pass 2,
 * but for a specific match on demand (skipping the 2-hour wait).
 *
 * Supports simulateCompletedUids to pre-set statusByUser for Case B testing
 * without going through the full updateMatchStatus flow (which has side effects).
 */
export async function adminForceExpireMatchHandler(
  request: CallableRequest<ForceExpireData>
): Promise<ForceExpireResult> {
  // Auth check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be authenticated');
  }

  // Admin check
  const callerEmail = request.auth.token.email;
  if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const { matchId, simulateCompletedUids } = request.data;
  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'matchId is required');
  }

  const db = admin.firestore();
  const matchRef = db.collection('matches').doc(matchId);
  const matchSnap = await matchRef.get();

  if (!matchSnap.exists) {
    throw new HttpsError('not-found', `Match ${matchId} not found`);
  }

  const matchData = matchSnap.data()!;
  const matchStatus = matchData.status;

  // Already in confirmation state — return current info
  if (matchStatus === EXPIRED_PENDING_CONFIRMATION) {
    return {
      success: true,
      matchStatus: EXPIRED_PENDING_CONFIRMATION,
      pendingUids: matchData.pendingConfirmationUids || [],
      user1Uid: matchData.user1Uid,
      user2Uid: matchData.user2Uid,
      message: 'Match already in expired_pending_confirmation state',
      rawStatusByUser: matchData.statusByUser || {},
      rawMatchStatus: matchStatus,
      simulatedUids: [],
    };
  }

  // Must be in an active state
  if (!ACTIVE_MATCH_STATUSES.includes(matchStatus as typeof ACTIVE_MATCH_STATUSES[number])) {
    throw new HttpsError(
      'failed-precondition',
      `Match is in "${matchStatus}" state (not active). Cannot force-expire.`
    );
  }

  const now = admin.firestore.Timestamp.now();
  const user1Uid = matchData.user1Uid;
  const user2Uid = matchData.user2Uid;
  const allUids = [user1Uid, user2Uid].filter(Boolean);

  // Build statusByUser with optional simulated completions
  const statusByUser: Record<string, string> = { ...(matchData.statusByUser || {}) };
  if (simulateCompletedUids && Array.isArray(simulateCompletedUids)) {
    for (const uid of simulateCompletedUids) {
      if (allUids.includes(uid)) {
        statusByUser[uid] = 'completed';
      }
    }
  }

  // Compute who needs to confirm (exclude users who "completed")
  const pendingConfirmationUids = allUids.filter(
    (u: string) => statusByUser[u] !== 'completed'
  );

  // Transition the match
  const updateData: Record<string, unknown> = {
    status: EXPIRED_PENDING_CONFIRMATION,
    pendingConfirmationUids,
    meetingConfirmation: {},
    confirmationRequestedAt: now,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // If we simulated completions, also persist the updated statusByUser
  if (simulateCompletedUids && simulateCompletedUids.length > 0) {
    updateData.statusByUser = statusByUser;
  }

  await matchRef.update(updateData);

  console.log(
    `[adminForceExpireMatch] Transitioned match ${matchId} to ${EXPIRED_PENDING_CONFIRMATION}. ` +
    `Pending: [${pendingConfirmationUids.join(', ')}]`
  );

  // Delete presence docs for both users
  for (const uid of allUids) {
    try {
      const presenceRef = db.collection('presence').doc(uid);
      const presenceSnap = await presenceRef.get();
      if (presenceSnap.exists) {
        await presenceRef.delete();
        console.log(`[adminForceExpireMatch] Deleted presence for ${uid}`);
      }
    } catch (err) {
      console.error(`[adminForceExpireMatch] Failed to delete presence for ${uid}:`, err);
    }
  }

  // Clean up accepted offers
  try {
    const offersQuery = db.collection('offers')
      .where('matchId', '==', matchId)
      .where('status', '==', 'accepted');
    const offersSnapshot = await offersQuery.get();

    if (!offersSnapshot.empty) {
      const batch = db.batch();
      offersSnapshot.docs.forEach((offerDoc) => {
        batch.update(offerDoc.ref, {
          status: 'expired',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
      console.log(
        `[adminForceExpireMatch] Expired ${offersSnapshot.size} accepted offer(s) for match ${matchId}`
      );
    }
  } catch (err) {
    console.error(`[adminForceExpireMatch] Failed to clean up offers:`, err);
  }

  return {
    success: true,
    matchStatus: EXPIRED_PENDING_CONFIRMATION,
    pendingUids: pendingConfirmationUids,
    user1Uid,
    user2Uid,
    message: `Match force-expired. ${pendingConfirmationUids.length} user(s) pending confirmation.`,
    rawStatusByUser: matchData.statusByUser || {},
    rawMatchStatus: matchData.status,
    simulatedUids: simulateCompletedUids || [],
  };
}
