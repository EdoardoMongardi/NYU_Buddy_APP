import * as admin from 'firebase-admin';
import { sendNotificationToUser } from '../utils/notifications';
import {
  ACTIVITY_POST_STATUS,
  JOIN_REQUEST_STATUS,
  GROUP_STATUS,
} from '../constants/activityState';

const BATCH_SIZE = 100;

/**
 * Scheduled function: runs every 5 minutes.
 * Expires overdue activity posts, cascades to pending requests and groups.
 */
export async function activityPostCleanupExpiredHandler() {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  // Query active posts that have passed their expiration
  const expiredPosts = await db
    .collection('activityPosts')
    .where('status', 'in', [ACTIVITY_POST_STATUS.OPEN, ACTIVITY_POST_STATUS.FILLED])
    .where('expiresAt', '<=', now)
    .limit(BATCH_SIZE)
    .get();

  if (expiredPosts.empty) {
    console.log('[CleanupExpiredPosts] No expired posts found');
    return;
  }

  console.log(`[CleanupExpiredPosts] Found ${expiredPosts.size} expired posts`);

  let processedCount = 0;

  for (const postDoc of expiredPosts.docs) {
    try {
      const post = postDoc.data();
      const batch = db.batch();

      // 1. Expire the post
      batch.update(postDoc.ref, {
        status: ACTIVITY_POST_STATUS.EXPIRED,
        closeReason: 'expired',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 2. Expire all pending join requests
      const pendingRequests = await db
        .collection('joinRequests')
        .where('postId', '==', post.postId)
        .where('status', '==', JOIN_REQUEST_STATUS.PENDING)
        .get();

      for (const reqDoc of pendingRequests.docs) {
        batch.update(reqDoc.ref, {
          status: JOIN_REQUEST_STATUS.EXPIRED,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      // 3. Dissolve group if exists
      if (post.groupId) {
        const groupRef = db.collection('groups').doc(post.groupId);
        batch.update(groupRef, {
          status: GROUP_STATUS.DISSOLVED,
          dissolvedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await batch.commit();

      // 4. Notify group members (non-blocking)
      if (post.groupId) {
        const groupDoc = await db.collection('groups').doc(post.groupId).get();
        if (groupDoc.exists) {
          const group = groupDoc.data()!;
          const truncatedBody = post.body.length > 30
            ? post.body.substring(0, 30) + '...'
            : post.body;

          await Promise.allSettled(
            (group.memberUids || []).map((memberUid: string) =>
              sendNotificationToUser(memberUid, {
                title: 'Activity Ended',
                body: `Your activity "${truncatedBody}" has ended`,
                data: {
                  type: 'activity_expired',
                  postId: post.postId,
                },
              })
            )
          );
        }
      }

      processedCount++;
    } catch (error) {
      console.error(
        `[CleanupExpiredPosts] Error processing post ${postDoc.id}:`,
        error
      );
    }
  }

  console.log(
    `[CleanupExpiredPosts] Processed ${processedCount}/${expiredPosts.size} expired posts`
  );
}
