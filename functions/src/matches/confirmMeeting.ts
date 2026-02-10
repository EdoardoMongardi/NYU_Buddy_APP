import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { EXPIRED_PENDING_CONFIRMATION } from '../constants/state';
import { releaseMatchGuard } from './createMatchAtomic';

interface ConfirmMeetingData {
  matchId: string;
  response: 'met' | 'not_met' | 'dismissed';
}

interface ConfirmMeetingResult {
  success: boolean;
  resolved: boolean;
  finalStatus?: string;
  outcome?: string;
}

/**
 * Resolve the final match status based on both users' effective responses.
 *
 * Effective response = explicit meetingConfirmation[uid] OR implicit from
 * statusByUser[uid] === 'completed' (treated as 'met').
 *
 * Resolution table:
 *   met + met       → completed / both_confirmed
 *   met + not_met   → cancelled / disputed
 *   met + dismissed  → cancelled / unconfirmed
 *   not_met + not_met → cancelled / both_not_met
 *   not_met + dismissed → cancelled / unconfirmed
 *   dismissed + dismissed → cancelled / unconfirmed
 */
function resolveOutcome(
  responseA: string,
  responseB: string
): { status: string; outcome: string } {
  const bothMet = responseA === 'met' && responseB === 'met';
  const bothNotMet = responseA === 'not_met' && responseB === 'not_met';
  const oneMet = (responseA === 'met') !== (responseB === 'met');
  const oneNotMet = (responseA === 'not_met') !== (responseB === 'not_met');

  if (bothMet) {
    return { status: 'completed', outcome: 'both_confirmed' };
  }
  if (bothNotMet) {
    return { status: 'cancelled', outcome: 'both_not_met' };
  }
  if (oneMet && oneNotMet) {
    // One said met, the other said not_met
    return { status: 'cancelled', outcome: 'disputed' };
  }
  // All remaining combinations involve at least one 'dismissed'
  return { status: 'cancelled', outcome: 'unconfirmed' };
}

/**
 * Get the effective response for a user:
 * 1. If meetingConfirmation[uid] is set, use that
 * 2. If statusByUser[uid] === 'completed', treat as implicit 'met'
 * 3. Should not happen for unresolved users (they must be in pendingConfirmationUids)
 */
function getEffectiveResponse(
  uid: string,
  meetingConfirmation: Record<string, string>,
  statusByUser: Record<string, string>
): string {
  if (meetingConfirmation[uid]) {
    return meetingConfirmation[uid];
  }
  if (statusByUser[uid] === 'completed') {
    return 'met';
  }
  // Fallback — should not happen if resolution is triggered correctly
  return 'dismissed';
}

/**
 * Handle user response to "Did you meet?" confirmation.
 *
 * Idempotent: safe to call multiple times.
 * - If match is already resolved → returns success (no-op)
 * - If user already responded → returns success (no-op)
 * - When last user responds → resolves to final status
 */
export async function matchConfirmMeetingHandler(
  request: CallableRequest<ConfirmMeetingData>
): Promise<ConfirmMeetingResult> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const { matchId, response } = request.data;
  const db = admin.firestore();

  // Validate input
  if (!matchId || typeof matchId !== 'string') {
    throw new HttpsError('invalid-argument', 'Match ID is required');
  }
  if (!['met', 'not_met', 'dismissed'].includes(response)) {
    throw new HttpsError('invalid-argument', 'Response must be met, not_met, or dismissed');
  }

  const matchRef = db.collection('matches').doc(matchId);

  const result = await db.runTransaction(async (transaction) => {
    const matchSnap = await transaction.get(matchRef);

    if (!matchSnap.exists) {
      throw new HttpsError('not-found', 'Match not found');
    }

    const match = matchSnap.data()!;

    // Idempotency: match already resolved
    if (match.status !== EXPIRED_PENDING_CONFIRMATION) {
      console.log(
        `[confirmMeeting] Match ${matchId} already resolved (status: ${match.status}). No-op.`
      );
      return {
        success: true,
        resolved: true,
        finalStatus: match.status,
        outcome: match.outcome,
      };
    }

    // Validate user is a participant
    if (match.user1Uid !== uid && match.user2Uid !== uid) {
      throw new HttpsError('permission-denied', 'You are not part of this match');
    }

    // Idempotency: user already responded
    const meetingConfirmation: Record<string, string> = match.meetingConfirmation || {};
    if (meetingConfirmation[uid]) {
      console.log(
        `[confirmMeeting] User ${uid} already responded to match ${matchId} ` +
        `with "${meetingConfirmation[uid]}". No-op.`
      );
      return {
        success: true,
        resolved: false,
      };
    }

    // Write the user's response
    const updatedConfirmation = { ...meetingConfirmation, [uid]: response };
    const pendingUids: string[] = match.pendingConfirmationUids || [];
    const remaining = pendingUids.filter((id: string) => id !== uid);

    const updateData: Record<string, unknown> = {
      [`meetingConfirmation.${uid}`]: response,
      pendingConfirmationUids: admin.firestore.FieldValue.arrayRemove(uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Check if all users have responded → resolve
    if (remaining.length === 0) {
      const statusByUser: Record<string, string> = match.statusByUser || {};
      const allUids = [match.user1Uid, match.user2Uid].filter(Boolean);

      const responseA = getEffectiveResponse(allUids[0], updatedConfirmation, statusByUser);
      const responseB = getEffectiveResponse(allUids[1], updatedConfirmation, statusByUser);

      const resolution = resolveOutcome(responseA, responseB);

      console.log(
        `[confirmMeeting] Resolving match ${matchId}: ` +
        `${allUids[0]}=${responseA}, ${allUids[1]}=${responseB} → ` +
        `status=${resolution.status}, outcome=${resolution.outcome}`
      );

      updateData.status = resolution.status;
      updateData.outcome = resolution.outcome;
      updateData.resolvedAt = admin.firestore.FieldValue.serverTimestamp();

      // If resolved to completed, update reliability stats for both users
      if (resolution.status === 'completed') {
        for (const userUid of allUids) {
          const userRef = db.collection('users').doc(userUid);
          const userSnap = await transaction.get(userRef);

          if (userSnap.exists) {
            const userData = userSnap.data()!;
            const stats = userData.reliabilityStats || {
              totalMatches: 0,
              metConfirmed: 0,
              cancelledByUser: 0,
              noShow: 0,
              expired: 0,
            };

            stats.metConfirmed = (stats.metConfirmed || 0) + 1;
            stats.totalMatches = (stats.totalMatches || 0) + 1;

            const total = stats.totalMatches || 1;
            const rawScore = (
              (stats.metConfirmed || 0) * 1.0 -
              (stats.cancelledByUser || 0) * 0.3 -
              (stats.noShow || 0) * 0.5
            ) / total;
            const reliabilityScore = Math.max(0, Math.min(1, 0.5 + rawScore * 0.5));

            transaction.update(userRef, {
              reliabilityStats: stats,
              reliabilityScore,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      }

      transaction.update(matchRef, updateData);

      return {
        success: true,
        resolved: true,
        finalStatus: resolution.status,
        outcome: resolution.outcome,
      };
    }

    // Not yet resolved — just record the response
    transaction.update(matchRef, updateData);

    console.log(
      `[confirmMeeting] User ${uid} responded "${response}" to match ${matchId}. ` +
      `${remaining.length} user(s) still pending.`
    );

    return {
      success: true,
      resolved: false,
    };
  });

  // Post-transaction: release guard if match was resolved
  if (result.resolved && result.finalStatus) {
    try {
      const matchSnap = await db.collection('matches').doc(matchId).get();
      if (matchSnap.exists) {
        const matchData = matchSnap.data()!;
        await releaseMatchGuard(matchId, matchData.user1Uid, matchData.user2Uid);
        console.log(`[confirmMeeting] Released guard for resolved match ${matchId}`);
      }
    } catch (guardError) {
      console.error(`[confirmMeeting] Failed to release guard for match ${matchId}:`, guardError);
    }
  }

  return result;
}
