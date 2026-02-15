import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { geohashForLocation } from 'geofire-common';
import { requireEmailVerification } from '../utils/verifyEmail';
import {
  ACTIVITY_POST_STATUS,
  ACTIVITY_CATEGORIES,
  ACTIVITY_LIMITS,
  ActivityCategory,
} from '../constants/activityState';

interface CreatePostData {
  body: string;
  category: string;
  maxParticipants: number;
  expiresInHours: number;
  locationName?: string | null;
  locationLat?: number | null;
  locationLng?: number | null;
  imageUrl?: string | null;
}

export async function activityPostCreateHandler(
  request: CallableRequest<CreatePostData>
) {
  // 1. Auth check
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  await requireEmailVerification(request);

  const uid = request.auth.uid;
  const data = request.data;
  const db = admin.firestore();

  // 2. Input validation
  const body = data.body?.trim();
  if (!body || body.length === 0) {
    throw new HttpsError('invalid-argument', 'Post body is required');
  }
  if (body.length > ACTIVITY_LIMITS.POST_BODY_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Post body must be at most ${ACTIVITY_LIMITS.POST_BODY_MAX_LENGTH} characters`
    );
  }

  if (!data.category || !ACTIVITY_CATEGORIES.includes(data.category as ActivityCategory)) {
    throw new HttpsError('invalid-argument', 'Invalid category');
  }

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

  if (!ACTIVITY_LIMITS.ALLOWED_DURATIONS_HOURS.includes(data.expiresInHours)) {
    throw new HttpsError('invalid-argument', 'Invalid duration');
  }

  // Validate location: if one coordinate provided, both must be provided
  const hasLat = data.locationLat != null;
  const hasLng = data.locationLng != null;
  if (hasLat !== hasLng) {
    throw new HttpsError(
      'invalid-argument',
      'Both latitude and longitude must be provided together'
    );
  }

  // NYC geofence check
  if (hasLat && hasLng) {
    if (
      data.locationLat! < ACTIVITY_LIMITS.NYC_LAT_MIN ||
      data.locationLat! > ACTIVITY_LIMITS.NYC_LAT_MAX ||
      data.locationLng! < ACTIVITY_LIMITS.NYC_LNG_MIN ||
      data.locationLng! > ACTIVITY_LIMITS.NYC_LNG_MAX
    ) {
      throw new HttpsError('invalid-argument', 'Location must be in the NYC area');
    }
  }

  if (data.locationName && data.locationName.length > ACTIVITY_LIMITS.LOCATION_NAME_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Location name must be at most ${ACTIVITY_LIMITS.LOCATION_NAME_MAX_LENGTH} characters`
    );
  }

  // 3. Rate limit: max 3 active posts
  const activePostsQuery = await db
    .collection('activityPosts')
    .where('creatorUid', '==', uid)
    .where('status', 'in', [ACTIVITY_POST_STATUS.OPEN, ACTIVITY_POST_STATUS.FILLED])
    .get();

  if (activePostsQuery.size >= ACTIVITY_LIMITS.MAX_ACTIVE_POSTS) {
    throw new HttpsError(
      'resource-exhausted',
      `Maximum ${ACTIVITY_LIMITS.MAX_ACTIVE_POSTS} active posts allowed`
    );
  }

  // 4. Get creator profile for denormalized fields
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) {
    throw new HttpsError('not-found', 'User profile not found');
  }
  const userData = userDoc.data()!;

  // 5. Compute derived fields
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(
    now.toMillis() + data.expiresInHours * 60 * 60 * 1000
  );

  let locationGeohash: string | null = null;
  if (hasLat && hasLng) {
    locationGeohash = geohashForLocation([data.locationLat!, data.locationLng!]);
  }

  // 6. Create the post
  const postRef = db.collection('activityPosts').doc();
  const postData = {
    postId: postRef.id,
    creatorUid: uid,
    creatorDisplayName: userData.displayName || '',
    creatorPhotoURL: userData.photoURL || null,
    body: body,
    category: data.category,
    imageUrl: data.imageUrl || null,
    maxParticipants: data.maxParticipants,
    acceptedCount: 0,
    locationName: data.locationName?.trim() || null,
    locationLat: data.locationLat || null,
    locationLng: data.locationLng || null,
    locationGeohash: locationGeohash,
    status: ACTIVITY_POST_STATUS.OPEN,
    closeReason: null,
    groupId: null,
    editCount: 0,
    expiresAt: expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await postRef.set(postData);

  // 7. Update user activity stats
  await db.collection('users').doc(uid).update({
    'activityStats.postsCreated': admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[ActivityPost] Created post ${postRef.id} by user ${uid}`);

  return {
    postId: postRef.id,
    status: ACTIVITY_POST_STATUS.OPEN,
  };
}
