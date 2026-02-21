import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  ACTIVITY_POST_STATUS,
  ACTIVITY_LIMITS,
  ActivityCategory,
  ACTIVITY_CATEGORIES,
} from '../constants/activityState';

interface GetFeedData {
  cursor?: string | null; // createdAt ISO string for pagination
  category?: string | null; // filter by category
  lat?: number | null; // user location for proximity filter
  lng?: number | null;
  radiusKm?: number | null;
}

export async function activityPostGetFeedHandler(
  request: CallableRequest<GetFeedData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const data = request.data || {};
  const db = admin.firestore();
  const pageSize = ACTIVITY_LIMITS.FEED_PAGE_SIZE;

  // Build query: active posts, reverse chronological
  let query: admin.firestore.Query = db
    .collection('activityPosts')
    .where('status', 'in', [ACTIVITY_POST_STATUS.OPEN, ACTIVITY_POST_STATUS.FILLED]);

  // Category filter
  if (data.category && ACTIVITY_CATEGORIES.includes(data.category as ActivityCategory)) {
    // When filtering by category, we need a different index path
    // Use a fresh query with category filter
    query = db
      .collection('activityPosts')
      .where('status', 'in', [ACTIVITY_POST_STATUS.OPEN, ACTIVITY_POST_STATUS.FILLED])
      .where('category', '==', data.category);
  }

  // Order by createdAt descending (newest first)
  query = query.orderBy('createdAt', 'desc');

  // Cursor-based pagination
  if (data.cursor) {
    const cursorDate = new Date(data.cursor);
    if (!isNaN(cursorDate.getTime())) {
      const cursorTimestamp = admin.firestore.Timestamp.fromDate(cursorDate);
      query = query.startAfter(cursorTimestamp);
    }
  }

  query = query.limit(pageSize + 1); // Fetch one extra to detect if there's a next page

  const snapshot = await query.get();

  const hasMore = snapshot.docs.length > pageSize;
  const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  const posts = docs.map((doc) => {
    const d = doc.data();
    return {
      postId: d.postId,
      creatorUid: d.creatorUid,
      creatorDisplayName: d.creatorDisplayName,
      creatorPhotoURL: d.creatorPhotoURL,
      body: d.body,
      category: d.category,
      imageUrl: d.imageUrl,
      maxParticipants: d.maxParticipants,
      acceptedCount: d.acceptedCount,
      locationName: d.locationName,
      locationLat: d.locationLat,
      locationLng: d.locationLng,
      status: d.status,
      expiresAt: d.expiresAt?.toDate?.()?.toISOString() || null,
      createdAt: d.createdAt?.toDate?.()?.toISOString() || null,
    };
  });

  // Compute next cursor from the last document
  const lastDoc = docs[docs.length - 1];
  const nextCursor = hasMore && lastDoc
    ? lastDoc.data().createdAt?.toDate?.()?.toISOString() || null
    : null;

  return {
    posts,
    nextCursor,
  };
}
