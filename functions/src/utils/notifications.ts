import * as admin from 'firebase-admin';

/**
 * U16: FCM Push Notification Helper
 * Sends push notifications to users via Firebase Cloud Messaging
 */

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Send a push notification to a specific user
 * @param uid - Target user ID
 * @param notification - Notification payload (title, body, data)
 * @returns Success status
 */
export async function sendNotificationToUser(
  uid: string,
  notification: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = admin.firestore();

    // Get user's FCM token
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      console.warn(`[Notification] User ${uid} not found`);
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data()!;
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
      console.log(`[Notification] User ${uid} has no FCM token - skipping notification`);
      return { success: false, error: 'No FCM token' };
    }

    // Send data-only FCM message for full control over notification display on web
    // (No top-level 'notification' field — prevents FCM auto-display conflicts with service worker)
    const message: admin.messaging.Message = {
      token: fcmToken,
      data: {
        title: notification.title,
        body: notification.body,
        ...(notification.data || {}),
      },
      // Web push configuration (critical for desktop & mobile PWA delivery)
      webpush: {
        headers: {
          Urgency: 'high',
          TTL: '600', // 10 minutes
        },
      },
      // Android-specific configuration (for native apps if any)
      android: {
        priority: 'high',
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`[Notification] Successfully sent to user ${uid}:`, response);

    return { success: true };
  } catch (error) {
    console.error(`[Notification] Error sending notification to user ${uid}:`, error);

    // If token is invalid/expired, clear it from user document
    if (
      error instanceof Error &&
      (error.message.includes('not-found') ||
        error.message.includes('invalid-registration-token') ||
        error.message.includes('registration-token-not-registered'))
    ) {
      try {
        const db = admin.firestore();
        await db.collection('users').doc(uid).update({
          fcmToken: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[Notification] Cleared invalid FCM token for user ${uid}`);
      } catch (clearError) {
        console.error(`[Notification] Failed to clear invalid token:`, clearError);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send "You received an offer" notification
 * U16: Triggered when a user receives an offer
 */
export async function sendOfferReceivedNotification(
  toUid: string,
  fromDisplayName: string,
  offerId: string
): Promise<{ success: boolean }> {
  const result = await sendNotificationToUser(toUid, {
    title: 'New Offer Received! 🎉',
    body: `You received an offer from ${fromDisplayName}`,
    data: {
      type: 'offer_received',
      offerId,
    },
  });

  return { success: result.success };
}

/**
 * Send "You matched" notification
 * U16: Triggered when a match is created
 */
export async function sendMatchCreatedNotification(
  uid: string,
  otherUserDisplayName: string,
  matchId: string
): Promise<{ success: boolean }> {
  const result = await sendNotificationToUser(uid, {
    title: 'Match Created! 🎊',
    body: `You have successfully matched with ${otherUserDisplayName}`,
    data: {
      type: 'match_created',
      matchId,
    },
  });

  return { success: result.success };
}

// ============================================================================
// ACTIVITY COMPANION NOTIFICATIONS (v2.0 — Round A: direct send, no throttling)
// ============================================================================

/**
 * Send "Join request received" notification to post creator
 */
export async function sendJoinRequestReceivedNotification(
  creatorUid: string,
  requesterName: string,
  postBody: string,
  postId: string
): Promise<{ success: boolean }> {
  const truncated = postBody.length > 40 ? postBody.substring(0, 40) + '...' : postBody;
  const result = await sendNotificationToUser(creatorUid, {
    title: 'New Join Request',
    body: `${requesterName} wants to join: "${truncated}"`,
    data: {
      type: 'join_request_received',
      postId,
    },
  });
  return { success: result.success };
}

/**
 * Send "Join request accepted" notification to requester
 */
export async function sendJoinRequestAcceptedNotification(
  requesterUid: string,
  creatorName: string,
  postBody: string,
  postId: string,
  groupId: string
): Promise<{ success: boolean }> {
  const truncated = postBody.length > 30 ? postBody.substring(0, 30) + '...' : postBody;
  const result = await sendNotificationToUser(requesterUid, {
    title: "You're in!",
    body: `${creatorName} accepted your request for "${truncated}"`,
    data: {
      type: 'join_request_accepted',
      postId,
      groupId,
    },
  });
  return { success: result.success };
}

/**
 * Send group chat message notification (direct send per message, no batching in Round A)
 */
export async function sendGroupChatMessageNotification(
  recipientUid: string,
  senderName: string,
  messageBody: string,
  groupId: string,
  postId: string
): Promise<{ success: boolean }> {
  const truncated = messageBody.length > 50 ? messageBody.substring(0, 50) + '...' : messageBody;
  const result = await sendNotificationToUser(recipientUid, {
    title: senderName,
    body: truncated,
    data: {
      type: 'group_chat_message',
      groupId,
      postId,
    },
  });
  return { success: result.success };
}

/**
 * Send "Activity expired" notification to group members
 */
export async function sendActivityExpiredNotification(
  uid: string,
  postBody: string,
  postId: string
): Promise<{ success: boolean }> {
  const truncated = postBody.length > 30 ? postBody.substring(0, 30) + '...' : postBody;
  const result = await sendNotificationToUser(uid, {
    title: 'Activity Ended',
    body: `Your activity "${truncated}" has ended`,
    data: {
      type: 'activity_expired',
      postId,
    },
  });
  return { success: result.success };
}

/**
 * Send "Slot reopened" notification when a participant leaves a filled group
 */
export async function sendSlotReopenedNotification(
  creatorUid: string,
  leaverName: string,
  postId: string,
  groupId: string
): Promise<{ success: boolean }> {
  const result = await sendNotificationToUser(creatorUid, {
    title: 'Participant Left',
    body: `${leaverName} left your activity. A slot is now open.`,
    data: {
      type: 'slot_reopened',
      postId,
      groupId,
    },
  });
  return { success: result.success };
}