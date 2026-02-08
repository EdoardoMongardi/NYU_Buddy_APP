import * as admin from 'firebase-admin';
import { ACTIVE_MATCH_STATUSES } from '../constants/state';

/**
 * U15: Audit and fix orphaned presence.matchId references
 *
 * Detects and fixes three issues:
 * 1. presence.matchId points to missing/deleted match
 * 2. presence.status='matched' but match is in terminal state
 * 3. match is active but one/both presences missing matchId
 *
 * Usage: Call once via Firebase CLI or admin panel
 */

interface AuditResult {
  totalPresences: number;
  orphanedMatchIds: number;
  mismatchedStatuses: number;
  missingMatchIds: number;
  fixed: number;
  errors: number;
}

export async function auditPresenceMatchIdHandler(): Promise<AuditResult> {
  const db = admin.firestore();

  console.log('[AuditPresenceMatchId] Starting audit...');

  const result: AuditResult = {
    totalPresences: 0,
    orphanedMatchIds: 0,
    mismatchedStatuses: 0,
    missingMatchIds: 0,
    fixed: 0,
    errors: 0,
  };

  // Get all presences with matchId
  const presencesWithMatchId = await db
    .collection('presence')
    .where('matchId', '!=', null)
    .get();

  console.log(`[AuditPresenceMatchId] Found ${presencesWithMatchId.size} presences with matchId`);

  // Check each presence
  for (const presenceDoc of presencesWithMatchId.docs) {
    result.totalPresences++;
    const presenceData = presenceDoc.data();
    const matchId = presenceData.matchId;

    if (!matchId) continue; // Should not happen due to query filter

    // Get the referenced match
    const matchDoc = await db.collection('matches').doc(matchId).get();

    if (!matchDoc.exists) {
      // Issue 1: matchId points to non-existent match
      console.log(`[AuditPresenceMatchId] Orphaned matchId: ${presenceDoc.id} -> ${matchId} (match not found)`);
      result.orphanedMatchIds++;

      try {
        await presenceDoc.ref.update({
          matchId: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.fixed++;
        console.log(`  ✅ Cleared orphaned matchId for ${presenceDoc.id}`);
      } catch (error) {
        console.error(`  ❌ Failed to clear matchId for ${presenceDoc.id}:`, error);
        result.errors++;
      }
      continue;
    }

    const matchData = matchDoc.data()!;

    // Issue 2: presence.status='matched' but match is terminal
    const isTerminalMatch = matchData.status === 'completed' || matchData.status === 'cancelled';
    if (presenceData.status === 'matched' && isTerminalMatch) {
      console.log(
        `[AuditPresenceMatchId] Status mismatch: ${presenceDoc.id} status='matched' but match ${matchId} is ${matchData.status}`
      );
      result.mismatchedStatuses++;

      try {
        await presenceDoc.ref.update({
          matchId: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        result.fixed++;
        console.log(`  ✅ Cleared matchId for presence in terminal match`);
      } catch (error) {
        console.error(`  ❌ Failed to fix:`, error);
        result.errors++;
      }
    }
  }

  // Check for Issue 3: active matches with missing presence.matchId
  console.log('[AuditPresenceMatchId] Checking active matches for missing presence.matchId...');

  const activeMatches = await db
    .collection('matches')
    .where('status', 'in', ACTIVE_MATCH_STATUSES)
    .limit(500) // Limit to avoid timeout
    .get();

  console.log(`[AuditPresenceMatchId] Found ${activeMatches.size} active matches`);

  for (const matchDoc of activeMatches.docs) {
    const matchData = matchDoc.data();
    const matchId = matchDoc.id;

    // Check both users' presences
    const [user1PresenceDoc, user2PresenceDoc] = await Promise.all([
      db.collection('presence').doc(matchData.user1Uid).get(),
      db.collection('presence').doc(matchData.user2Uid).get(),
    ]);

    const user1Presence = user1PresenceDoc.exists ? user1PresenceDoc.data() : null;
    const user2Presence = user2PresenceDoc.exists ? user2PresenceDoc.data() : null;

    // Check if either user's presence is missing matchId
    const user1MissingMatchId = user1Presence && user1Presence.matchId !== matchId;
    const user2MissingMatchId = user2Presence && user2Presence.matchId !== matchId;

    if (user1MissingMatchId || user2MissingMatchId) {
      console.log(
        `[AuditPresenceMatchId] Active match ${matchId} missing presence.matchId: ` +
        `user1=${user1MissingMatchId ? 'MISSING' : 'OK'}, user2=${user2MissingMatchId ? 'MISSING' : 'OK'}`
      );
      result.missingMatchIds++;

      try {
        const batch = db.batch();

        if (user1MissingMatchId && user1PresenceDoc.exists) {
          batch.update(user1PresenceDoc.ref, {
            matchId: matchId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        if (user2MissingMatchId && user2PresenceDoc.exists) {
          batch.update(user2PresenceDoc.ref, {
            matchId: matchId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        await batch.commit();
        result.fixed++;
        console.log(`  ✅ Set matchId for active match presences`);
      } catch (error) {
        console.error(`  ❌ Failed to fix:`, error);
        result.errors++;
      }
    }
  }

  console.log('[AuditPresenceMatchId] Audit complete!');
  console.log(JSON.stringify(result, null, 2));

  return result;
}