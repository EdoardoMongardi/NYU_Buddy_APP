import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { geohashForLocation } from 'geofire-common';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  ACTIVITY_POST_STATUS,
  ACTIVITY_LIMITS,
} from '../constants/activityState';

interface UpdatePostData {
  postId: string;
  body?: string;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  maxParticipants?: number;
  expiresAt?: string; // ISO timestamp — can only extend
}

export async function activityPostUpdateHandler(
  request: CallableRequest<UpdatePostData>
) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  if (!data.postId) {
    throw new HttpsError('invalid-argument', 'Post ID is required');
  }

  // 1. Fetch the post
  const postRef = db.collection('activityPosts').doc(data.postId);
  const postDoc = await postRef.get();

  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }

  const post = postDoc.data()!;

  // 2. Owner check
  if (post.creatorUid !== uid) {
    throw new HttpsError('permission-denied', 'Only the post creator can edit');
  }

  // 3. Status check: only open posts can be edited
  if (post.status !== ACTIVITY_POST_STATUS.OPEN) {
    throw new HttpsError(
      'failed-precondition',
      'Only open posts can be edited'
    );
  }

  // 4. Edit count check
  if (post.editCount >= ACTIVITY_LIMITS.MAX_EDITS_PER_POST) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${ACTIVITY_LIMITS.MAX_EDITS_PER_POST} edits per post`
    );
  }

  // 5. Build update object
  const updates: Record<string, unknown> = {
    editCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (data.body !== undefined) {
    const body = data.body.trim();
    if (!body || body.length === 0) {
      throw new HttpsError('invalid-argument', 'Post body cannot be empty');
    }
    if (body.length > ACTIVITY_LIMITS.POST_BODY_MAX_LENGTH) {
      throw new HttpsError(
        'invalid-argument',
        `Post body must be at most ${ACTIVITY_LIMITS.POST_BODY_MAX_LENGTH} characters`
      );
    }
    updates.body = body;
  }

  if (data.locationName !== undefined) {
    if (data.locationName && data.locationName.length > ACTIVITY_LIMITS.LOCATION_NAME_MAX_LENGTH) {
      throw new HttpsError(
        'invalid-argument',
        `Location name must be at most ${ACTIVITY_LIMITS.LOCATION_NAME_MAX_LENGTH} characters`
      );
    }
    updates.locationName = data.locationName?.trim() || null;
  }

  // Handle location coordinates
  if (data.locationLat !== undefined || data.locationLng !== undefined) {
    const newLat = data.locationLat ?? null;
    const newLng = data.locationLng ?? null;

    if ((newLat != null) !== (newLng != null)) {
      throw new HttpsError(
        'invalid-argument',
        'Both latitude and longitude must be provided together'
      );
    }

    if (newLat != null && newLng != null) {
      if (
        newLat < ACTIVITY_LIMITS.NYC_LAT_MIN ||
        newLat > ACTIVITY_LIMITS.NYC_LAT_MAX ||
        newLng < ACTIVITY_LIMITS.NYC_LNG_MIN ||
        newLng > ACTIVITY_LIMITS.NYC_LNG_MAX
      ) {
        throw new HttpsError('invalid-argument', 'Location must be in the NYC area');
      }
      updates.locationLat = newLat;
      updates.locationLng = newLng;
      updates.locationGeohash = geohashForLocation([newLat, newLng]);
    } else {
      updates.locationLat = null;
      updates.locationLng = null;
      updates.locationGeohash = null;
    }
  }

  // maxParticipants: can only increase, not decrease below current accepted count
  if (data.maxParticipants !== undefined) {
    if (
      !Number.isInteger(data.maxParticipants) ||
      data.maxParticipants < ACTIVITY_LIMITS.MIN_PARTICIPANTS ||
      data.maxParticipants > ACTIVITY_LIMITS.MAX_PARTICIPANTS
    ) {
      throw new HttpsError(
        'invalid-argument',
        `maxParticipants must be between ${ACTIVITY_LIMITS.MIN_PARTICIPANTS} and ${ACTIVITY_LIMITS.MAX_PARTICIPANTS}`
      );
    }
    if (data.maxParticipants < (post.acceptedCount || 0)) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot reduce maxParticipants below current accepted count'
      );
    }
    updates.maxParticipants = data.maxParticipants;
  }

  // expiresAt: can only extend, not shorten
  if (data.expiresAt !== undefined) {
    const newExpires = new Date(data.expiresAt);
    if (isNaN(newExpires.getTime())) {
      throw new HttpsError('invalid-argument', 'Invalid expiresAt timestamp');
    }
    const newExpiresTimestamp = admin.firestore.Timestamp.fromDate(newExpires);
    if (newExpiresTimestamp.toMillis() <= post.expiresAt.toMillis()) {
      throw new HttpsError(
        'failed-precondition',
        'Can only extend expiration time, not shorten it'
      );
    }
    updates.expiresAt = newExpiresTimestamp;
  }

  // 6. Apply updates
  await postRef.update(updates);

  console.log(`[ActivityPost] Updated post ${data.postId} by user ${uid}`);

  return { success: true };
}
