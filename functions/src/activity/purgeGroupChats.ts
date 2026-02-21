import * as admin from 'firebase-admin';
import { GROUP_STATUS } from '../constants/activityState';

const BATCH_SIZE = 50;

/**
 * Scheduled function: runs daily.
 * Deletes chat messages from dissolved groups older than 7 days.
 */
export async function purgeGroupChatsHandler() {
  const db = admin.firestore();
  const sevenDaysAgo = admin.firestore.Timestamp.fromMillis(
    admin.firestore.Timestamp.now().toMillis() - 7 * 24 * 60 * 60 * 1000
  );

  // Find groups dissolved more than 7 days ago
  const dissolvedGroups = await db
    .collection('groups')
    .where('status', '==', GROUP_STATUS.DISSOLVED)
    .where('dissolvedAt', '<=', sevenDaysAgo)
    .limit(BATCH_SIZE)
    .get();

  if (dissolvedGroups.empty) {
    console.log('[PurgeGroupChats] No old dissolved groups found');
    return;
  }

  let purgedMessages = 0;

  for (const groupDoc of dissolvedGroups.docs) {
    try {
      const messagesSnap = await db
        .collection('groupChats')
        .doc(groupDoc.id)
        .collection('messages')
        .limit(500)
        .get();

      if (!messagesSnap.empty) {
        const batch = db.batch();
        for (const msgDoc of messagesSnap.docs) {
          batch.delete(msgDoc.ref);
        }
        await batch.commit();
        purgedMessages += messagesSnap.size;
      }
    } catch (error) {
      console.error(
        `[PurgeGroupChats] Error purging messages for group ${groupDoc.id}:`,
        error
      );
    }
  }

  console.log(
    `[PurgeGroupChats] Purged ${purgedMessages} messages from ${dissolvedGroups.size} groups`
  );
}
