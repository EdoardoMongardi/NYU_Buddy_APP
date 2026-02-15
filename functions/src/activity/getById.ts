import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { requireEmailVerification } from '../utils/verifyEmail';
import { JOIN_REQUEST_STATUS } from '../constants/activityState';

interface GetByIdData {
  postId: string;
}

export async function activityPostGetByIdHandler(
  request: CallableRequest<GetByIdData>
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
  const postDoc = await db.collection('activityPosts').doc(data.postId).get();
  if (!postDoc.exists) {
    throw new HttpsError('not-found', 'Post not found');
  }

  const postData = postDoc.data()!;
  const post = {
    postId: postData.postId,
    creatorUid: postData.creatorUid,
    creatorDisplayName: postData.creatorDisplayName,
    creatorPhotoURL: postData.creatorPhotoURL,
    body: postData.body,
    category: postData.category,
    imageUrl: postData.imageUrl,
    maxParticipants: postData.maxParticipants,
    acceptedCount: postData.acceptedCount,
    locationName: postData.locationName,
    locationLat: postData.locationLat,
    locationLng: postData.locationLng,
    status: postData.status,
    closeReason: postData.closeReason,
    groupId: postData.groupId,
    editCount: postData.editCount,
    expiresAt: postData.expiresAt?.toDate?.()?.toISOString() || null,
    createdAt: postData.createdAt?.toDate?.()?.toISOString() || null,
    updatedAt: postData.updatedAt?.toDate?.()?.toISOString() || null,
  };

  // 2. If caller is the creator, include join requests
  let joinRequests = null;
  if (postData.creatorUid === uid) {
    const requestsSnap = await db
      .collection('joinRequests')
      .where('postId', '==', data.postId)
      .where('status', '==', JOIN_REQUEST_STATUS.PENDING)
      .orderBy('createdAt', 'asc')
      .get();

    joinRequests = requestsSnap.docs.map((doc) => {
      const r = doc.data();
      return {
        requestId: doc.id,
        postId: r.postId,
        requesterUid: r.requesterUid,
        requesterDisplayName: r.requesterDisplayName,
        requesterPhotoURL: r.requesterPhotoURL,
        message: r.message,
        status: r.status,
        createdAt: r.createdAt?.toDate?.()?.toISOString() || null,
      };
    });
  }

  // 3. If caller is a group member, include group info
  let group = null;
  if (postData.groupId) {
    const groupDoc = await db.collection('groups').doc(postData.groupId).get();
    if (groupDoc.exists) {
      const g = groupDoc.data()!;
      if (g.memberUids?.includes(uid)) {
        group = {
          groupId: g.groupId,
          postId: g.postId,
          creatorUid: g.creatorUid,
          memberUids: g.memberUids,
          memberCount: g.memberCount,
          status: g.status,
          createdAt: g.createdAt?.toDate?.()?.toISOString() || null,
        };
      }
    }
  }

  // 4. Check if caller has an existing join request
  let myJoinRequest = null;
  if (postData.creatorUid !== uid) {
    const myRequestId = `${data.postId}_${uid}`;
    const myRequestDoc = await db.collection('joinRequests').doc(myRequestId).get();
    if (myRequestDoc.exists) {
      const r = myRequestDoc.data()!;
      myJoinRequest = {
        requestId: myRequestDoc.id,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt?.toDate?.()?.toISOString() || null,
      };
    }
  }

  return {
    post,
    joinRequests,
    group,
    myJoinRequest,
  };
}
