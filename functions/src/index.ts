import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { presenceStartHandler } from './presence/start';
import { presenceEndHandler } from './presence/end';
import { presenceCleanupExpiredHandler } from './presence/cleanupExpired';
import { suggestionGetTop1Handler } from './suggestions/getTop1';
import { suggestionRespondHandler } from './suggestions/respond';
import { suggestionGetCycleHandler, suggestionPassHandler } from './suggestions/getCycle';
import { offerCreateHandler } from './offers/create';
import { offerRespondHandler } from './offers/respond';
import { offerCancelHandler } from './offers/cancel';
import { offersGetInboxHandler } from './offers/getInbox';
import { offerGetOutgoingHandler } from './offers/getOutgoing';
import { matchCancelHandler } from './matches/cancel';
import { updateMatchStatusHandler } from './matches/updateStatus';
import { matchSendMessageHandler } from './matches/sendMessage';
import { matchFetchAllPlacesHandler } from './matches/fetchPlaces';
import { matchSetPlaceChoiceHandler } from './matches/setPlaceChoice';
import { matchResolvePlaceIfNeededHandler } from './matches/resolvePlace';
import { matchResolveExpiredHandler } from './matches/resolveExpired';
import { matchCleanupStalePendingHandler } from './matches/cleanupStalePending';
import { matchConfirmMeetingHandler } from './matches/confirmMeeting';
import { matchCleanupExpiredConfirmationsHandler } from './matches/cleanupExpiredConfirmations';
import { offerExpireStaleHandler } from './offers/expireStale';
import { checkAvailabilityForUserHandler } from './availability/checkAvailability';
import { normalizeOfferUpdatedAtHandler } from './migrations/normalizeOfferUpdatedAt';
import { auditPresenceMatchIdHandler } from './migrations/auditPresenceMatchId';
import { adminForceExpireMatchHandler } from './admin/forceExpireMatch';
import { idempotencyCleanup } from './idempotency/cleanup';

// Activity Companion System (v2.0)
import { activityPostCreateHandler } from './activity/createPost';
import { activityPostUpdateHandler } from './activity/updatePost';
import { activityPostCloseHandler } from './activity/closePost';
import { activityPostGetFeedHandler } from './activity/getFeed';
import { activityPostGetMineHandler } from './activity/getMine';
import { activityPostGetByIdHandler } from './activity/getById';
import { joinRequestSendHandler } from './activity/sendJoinRequest';
import { joinRequestWithdrawHandler } from './activity/withdrawJoinRequest';
import { joinRequestRespondHandler } from './activity/respondJoinRequest';
import { joinRequestGetMineHandler } from './activity/getMyJoinRequests';
import { groupLeaveHandler } from './activity/groupLeave';
import { groupKickHandler } from './activity/groupKick';
import { groupSendMessageHandler } from './activity/groupSendMessage';
import { groupGetMessagesHandler } from './activity/groupGetMessages';
import { activityPostCleanupExpiredHandler } from './activity/cleanupExpiredPosts';
import { purgeGroupChatsHandler } from './activity/purgeGroupChats';
import { purgeActivityDataHandler } from './activity/purgeActivityData';
import { mapStatusSetHandler } from './map/setStatus';
import { mapStatusClearHandler } from './map/clearStatus';
import { mapStatusGetNearbyHandler } from './map/getNearby';
import { mapStatusCleanupExpiredHandler } from './map/cleanupExpired';
import { reportSubmitHandler } from './safety/submitReport';

// Initialize Firebase Admin
admin.initializeApp();

// Presence functions
export const presenceStart = onCall(
  { region: 'us-east1' },
  presenceStartHandler
);

export const presenceEnd = onCall(
  { region: 'us-east1' },
  presenceEndHandler
);

// Suggestion functions (legacy)
export const suggestionGetTop1 = onCall(
  { region: 'us-east1' },
  suggestionGetTop1Handler
);

export const suggestionRespond = onCall(
  { region: 'us-east1' },
  suggestionRespondHandler
);

// NEW: Cycle-based suggestion functions
export const suggestionGetCycle = onCall(
  { region: 'us-east1' },
  suggestionGetCycleHandler
);

export const suggestionPass = onCall(
  { region: 'us-east1' },
  suggestionPassHandler
);

// Match Status function
export const updateMatchStatus = onCall(
  { region: 'us-east1' },
  updateMatchStatusHandler
);

// Match Chat function
export const matchSendMessage = onCall(
  { region: 'us-east1' },
  matchSendMessageHandler
);

// Offer functions
export const offerCreate = onCall(
  { region: 'us-east1' },
  offerCreateHandler
);

export const offerRespond = onCall(
  { region: 'us-east1' },
  offerRespondHandler
);

export const offerCancel = onCall(
  { region: 'us-east1' },
  offerCancelHandler
);

export const offersGetInbox = onCall(
  { region: 'us-east1' },
  offersGetInboxHandler
);

export const offerGetOutgoing = onCall(
  { region: 'us-east1' },
  offerGetOutgoingHandler
);

// Match functions
export const matchCancel = onCall(
  { region: 'us-east1' },
  matchCancelHandler
);

// PRD v2.4: Location Decision Functions
export const matchFetchAllPlaces = onCall(
  { region: 'us-east1' },
  matchFetchAllPlacesHandler
);

export const matchSetPlaceChoice = onCall(
  { region: 'us-east1' },
  matchSetPlaceChoiceHandler
);

export const matchResolvePlaceIfNeeded = onCall(
  { region: 'us-east1' },
  matchResolvePlaceIfNeededHandler
);

// Scheduled: Resolve expired location decisions every minute
export const matchResolveExpired = onSchedule(
  { schedule: 'every 1 minutes', region: 'us-east1' },
  matchResolveExpiredHandler
);

// Phase 2.1-A: Auto-cancel stale pending matches every 5 minutes
export const matchCleanupStalePending = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-east1' },
  matchCleanupStalePendingHandler
);

// Phase 2.1-B: Mark expired pending offers as expired every 5 minutes
export const offerExpireStale = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-east1' },
  offerExpireStaleHandler
);

// Task 4: Cleanup expired presence documents every 5 minutes
export const presenceCleanupExpired = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-east1' },
  presenceCleanupExpiredHandler
);

// "Did you meet?" confirmation function
export const matchConfirmMeeting = onCall(
  { region: 'us-east1' },
  matchConfirmMeetingHandler
);

// Auto-resolve expired meeting confirmations every 30 minutes
export const matchCleanupExpiredConfirmations = onSchedule(
  { schedule: 'every 30 minutes', region: 'us-east1' },
  matchCleanupExpiredConfirmationsHandler
);

// Admin: Force-expire match for testing
export const adminForceExpireMatch = onCall(
  { region: 'us-east1' },
  adminForceExpireMatchHandler
);

// U23: Cleanup expired idempotency records every 2 hours
export { idempotencyCleanup };

export const checkAvailabilityForUser = onCall(
  { region: 'us-east1' },
  checkAvailabilityForUserHandler
);

// Migration functions (admin-only, run once)
export const normalizeOfferUpdatedAt = onCall(
  { region: 'us-east1' },
  normalizeOfferUpdatedAtHandler
);

export const auditPresenceMatchId = onCall(
  { region: 'us-east1' },
  auditPresenceMatchIdHandler
);

// ============================================================================
// ACTIVITY COMPANION SYSTEM (v2.0) — Round A
// ============================================================================

// Activity Posts (6 callable)
export const activityPostCreate = onCall(
  { region: 'us-east1' },
  activityPostCreateHandler
);

export const activityPostUpdate = onCall(
  { region: 'us-east1' },
  activityPostUpdateHandler
);

export const activityPostClose = onCall(
  { region: 'us-east1' },
  activityPostCloseHandler
);

export const activityPostGetFeed = onCall(
  { region: 'us-east1' },
  activityPostGetFeedHandler
);

export const activityPostGetMine = onCall(
  { region: 'us-east1' },
  activityPostGetMineHandler
);

export const activityPostGetById = onCall(
  { region: 'us-east1' },
  activityPostGetByIdHandler
);

// Join Requests (4 callable)
export const joinRequestSend = onCall(
  { region: 'us-east1' },
  joinRequestSendHandler
);

export const joinRequestWithdraw = onCall(
  { region: 'us-east1' },
  joinRequestWithdrawHandler
);

export const joinRequestRespond = onCall(
  { region: 'us-east1' },
  joinRequestRespondHandler
);

export const joinRequestGetMine = onCall(
  { region: 'us-east1' },
  joinRequestGetMineHandler
);

// Groups (4 callable)
export const groupLeave = onCall(
  { region: 'us-east1' },
  groupLeaveHandler
);

export const groupKick = onCall(
  { region: 'us-east1' },
  groupKickHandler
);

export const groupSendMessage = onCall(
  { region: 'us-east1' },
  groupSendMessageHandler
);

export const groupGetMessages = onCall(
  { region: 'us-east1' },
  groupGetMessagesHandler
);

// Map Status (3 callable)
export const mapStatusSet = onCall(
  { region: 'us-east1' },
  mapStatusSetHandler
);

export const mapStatusClear = onCall(
  { region: 'us-east1' },
  mapStatusClearHandler
);

export const mapStatusGetNearby = onCall(
  { region: 'us-east1' },
  mapStatusGetNearbyHandler
);

// Safety (1 callable)
export const reportSubmit = onCall(
  { region: 'us-east1' },
  reportSubmitHandler
);

// Scheduled: Expire overdue activity posts every 5 minutes
export const activityPostCleanupExpired = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-east1' },
  activityPostCleanupExpiredHandler
);

// Scheduled: Purge old group chat messages daily at 3 AM
export const groupChatPurge = onSchedule(
  { schedule: 'every day 03:00', region: 'us-east1' },
  purgeGroupChatsHandler
);

// Scheduled: Purge old activity data daily at 4 AM
export const activityDataPurge = onSchedule(
  { schedule: 'every day 04:00', region: 'us-east1' },
  purgeActivityDataHandler
);

// Scheduled: Cleanup expired map statuses every 5 minutes
export const mapStatusCleanupExpired = onSchedule(
  { schedule: 'every 5 minutes', region: 'us-east1' },
  mapStatusCleanupExpiredHandler
);