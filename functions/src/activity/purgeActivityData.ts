import * as admin from 'firebase-admin';
import {
  ACTIVITY_POST_STATUS,
  GROUP_STATUS,
} from '../constants/activityState';

const BATCH_SIZE = 50;

/**
 * Scheduled function: runs daily.
 * Deletes terminal posts, requests, and groups older than 30 days.
 */
export async function purgeActivityDataHandler() {
  const db = admin.firestore();
  const thirtyDaysAgo = admin.firestore.Timestamp.fromMillis(
    admin.firestore.Timestamp.now().toMillis() - 30 * 24 * 60 * 60 * 1000
  );

  let totalDeleted = 0;

  // 1. Purge old expired/closed posts
  const oldPosts = await db
    .collection('activityPosts')
    .where('status', 'in', [ACTIVITY_POST_STATUS.EXPIRED, ACTIVITY_POST_STATUS.CLOSED])
    .where('updatedAt', '<=', thirtyDaysAgo)
    .limit(BATCH_SIZE)
    .get();

  if (!oldPosts.empty) {
    const batch = db.batch();
    for (const doc of oldPosts.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += oldPosts.size;
  }

  // 2. Purge old dissolved groups
  const oldGroups = await db
    .collection('groups')
    .where('status', '==', GROUP_STATUS.DISSOLVED)
    .where('dissolvedAt', '<=', thirtyDaysAgo)
    .limit(BATCH_SIZE)
    .get();

  if (!oldGroups.empty) {
    const batch = db.batch();
    for (const doc of oldGroups.docs) {
      batch.delete(doc.ref);
    }
    await batch.commit();
    totalDeleted += oldGroups.size;
  }

  console.log(`[PurgeActivityData] Deleted ${totalDeleted} old documents`);
}
