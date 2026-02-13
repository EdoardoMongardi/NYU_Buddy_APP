import * as admin from 'firebase-admin';
import { EXPIRED_PENDING_CONFIRMATION } from '../constants/state';
import { releaseMatchGuard } from './createMatchAtomic';

/**
 * Scheduled cleanup for expired meeting confirmations.
 *
 * Problem: Matches in 'expired_pending_confirmation' status need user input,
 * but users may never open the app again. These matches would stay in limbo.
 *
 * Solution: After 48 hours, auto-resolve any remaining pending users as 'dismissed'
 * and compute the final match status using the resolution table.
 *
 * Runs every 30 minutes.
 */

const CONFIRMATION_TIMEOUT_HOURS = 48;
const BATCH_SIZE = 50;

/**
 * Resolve match outcome from two effective responses.
 * Same logic as confirmMeeting.ts — kept inline to avoid circular deps.
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
    return { status: 'cancelled', outcome: 'disputed' };
  }
  return { status: 'cancelled', outcome: 'unconfirmed' };
}

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
  return 'dismissed';
}

/**
 * Scheduled handler to auto-resolve expired meeting confirmations.
 */
export async function matchCleanupExpiredConfirmationsHandler(): Promise<void> {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();
  const timeoutThreshold = new admin.firestore.Timestamp(
    now.seconds - (CONFIRMATION_TIMEOUT_HOURS * 60 * 60),
    now.nanoseconds
  );

  console.log(
    `[cleanupExpiredConfirmations] Starting cleanup (timeout: ${CONFIRMATION_TIMEOUT_HOURS}h)`
  );

  // Query matches still awaiting confirmation past the timeout
  const expiredConfirmations = await db
    .collection('matches')
    .where('status', '==', EXPIRED_PENDING_CONFIRMATION)
    .where('confirmationRequestedAt', '<=', timeoutThreshold)
    .limit(BATCH_SIZE)
    .get();

  if (expiredConfirmations.empty) {
    console.log('[cleanupExpiredConfirmations] No expired confirmations found');
    return;
  }

  console.log(
    `[cleanupExpiredConfirmations] Found ${expiredConfirmations.size} expired confirmations`
  );

  let resolvedCount = 0;
  let skippedCount = 0;

  for (const matchDoc of expiredConfirmations.docs) {
    try {
      const matchData = matchDoc.data();
      const matchId = matchDoc.id;

      // Idempotency: double-check status (race condition guard)
      if (matchData.status !== EXPIRED_PENDING_CONFIRMATION) {
        console.log(
          `[cleanupExpiredConfirmations] Match ${matchId} no longer pending (status: ${matchData.status}). Skipping.`
        );
        skippedCount++;
        continue;
      }

      const meetingConfirmation: Record<string, string> = matchData.meetingConfirmation || {};
      const statusByUser: Record<string, string> = matchData.statusByUser || {};
      const pendingUids: string[] = matchData.pendingConfirmationUids || [];
      const allUids = [matchData.user1Uid, matchData.user2Uid].filter(Boolean);

      // Auto-dismiss remaining pending users
      for (const pendingUid of pendingUids) {
        meetingConfirmation[pendingUid] = 'dismissed';
      }

      // Compute final resolution
      const responseA = getEffectiveResponse(allUids[0], meetingConfirmation, statusByUser);
      const responseB = getEffectiveResponse(allUids[1], meetingConfirmation, statusByUser);
      const resolution = resolveOutcome(responseA, responseB);

      console.log(
        `[cleanupExpiredConfirmations] Auto-resolving match ${matchId}: ` +
        `${allUids[0]}=${responseA}, ${allUids[1]}=${responseB} → ` +
        `status=${resolution.status}, outcome=${resolution.outcome}`
      );

      // Update match document
      await matchDoc.ref.update({
        status: resolution.status,
        outcome: resolution.outcome,
        meetingConfirmation,
        pendingConfirmationUids: [],
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Release pair guard (non-critical)
      try {
        await releaseMatchGuard(matchId, matchData.user1Uid, matchData.user2Uid);
        console.log(`[cleanupExpiredConfirmations] Released guard for match ${matchId}`);
      } catch (guardError) {
        console.error(
          `[cleanupExpiredConfirmations] Failed to release guard for match ${matchId}:`,
          guardError
        );
      }

      resolvedCount++;
    } catch (error) {
      console.error(
        `[cleanupExpiredConfirmations] Failed to resolve match ${matchDoc.id}:`,
        error
      );
      skippedCount++;
    }
  }

  console.log(
    `[cleanupExpiredConfirmations] Completed: ${resolvedCount} resolved, ${skippedCount} skipped`
  );
}
