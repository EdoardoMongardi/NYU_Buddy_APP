import { httpsCallable, HttpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from './client';
import { retryWithBackoff } from '../utils/retry';

// Helper to create lazy-initialized callables (deferred until first call)
function createCallable<TRequest, TResponse>(name: string): HttpsCallable<TRequest, TResponse> {
  let callable: HttpsCallable<TRequest, TResponse> | null = null;
  return ((data?: TRequest) => {
    if (!callable) {
      callable = httpsCallable<TRequest, TResponse>(getFirebaseFunctions(), name);
    }
    return callable(data);
  }) as HttpsCallable<TRequest, TResponse>;
}

// Presence functions
// U23: Retry-wrapped with idempotency
export async function presenceStart(data: {
  activity: string;
  durationMin: number;
  lat: number;
  lng: number;
  idempotencyKey?: string;
}): Promise<{ success: boolean; sessionId: string; expiresAt: string }> {
  return retryWithBackoff(async (generatedKey) => {
    // Use provided key if available, otherwise use retry-generated key
    const keyToUse = data.idempotencyKey || generatedKey;
    const fn = httpsCallable<
      { activity: string; durationMin: number; lat: number; lng: number; idempotencyKey: string },
      { success: boolean; sessionId: string; expiresAt: string }
    >(getFirebaseFunctions(), 'presenceStart');
    const result = await fn({
      activity: data.activity,
      durationMin: data.durationMin,
      lat: data.lat,
      lng: data.lng,
      idempotencyKey: keyToUse,
    });
    return result.data;
  });
}

export const presenceEnd = createCallable<void, { success: boolean }>('presenceEnd');

// Suggestion functions (legacy)
export const suggestionGetTop1 = createCallable<
  void,
  {
    suggestion: {
      uid: string;
      displayName: string;
      photoURL: string | null;
      interests: string[];
      activity: string;
      distance: number;
    } | null;
  }
>('suggestionGetTop1');

export const suggestionRespond = createCallable<
  { targetUid: string; action: 'pass' | 'accept' },
  { matchCreated: boolean; matchId?: string }
>('suggestionRespond');

// NEW: Cycle-based suggestion functions
export interface CycleSuggestion {
  uid: string;
  displayName: string;
  photoURL: string | null;
  interests: string[];
  activity: string;
  distance: number;
  durationMinutes: number;
  explanation: string;
}

export interface CycleInfo {
  total: number;
  current: number;
  isNewCycle: boolean;
  isCycleEnd?: boolean;
}

export const suggestionGetCycle = createCallable<
  { action?: 'next' | 'refresh'; batchSize?: number },
  {
    suggestion: CycleSuggestion | null;
    suggestions?: CycleSuggestion[];
    cycleInfo: CycleInfo;
    message?: string;
  }
>('suggestionGetCycle');

export const suggestionPass = createCallable<
  { targetUid: string },
  { success: boolean; newIndex: number }
>('suggestionPass');

// Match Status function
export const updateMatchStatus = createCallable<
  { matchId: string; status: 'heading_there' | 'arrived' | 'completed' },
  { success: boolean }
>('updateMatchStatus');

// Match Chat function
export const matchSendMessage = createCallable<
  { matchId: string; content: string },
  { success: boolean; messageId: string }
>('matchSendMessage');

// "Did you meet?" confirmation function
export const matchConfirmMeeting = createCallable<
  { matchId: string; response: 'met' | 'not_met' | 'dismissed' },
  { success: boolean; resolved: boolean; finalStatus?: string; outcome?: string }
>('matchConfirmMeeting');

// Offer functions
// U23: Retry-wrapped with idempotency
export async function offerCreate(data: {
  targetUid: string;
  explanation?: string;
  matchScore?: number;
  distanceMeters?: number;
  idempotencyKey?: string;
}): Promise<{
  offerId: string;
  matchCreated: boolean;
  matchId?: string;
  expiresAt?: string;
  cooldownUntil?: string;
}> {
  return retryWithBackoff(async (generatedKey) => {
    const keyToUse = data.idempotencyKey || generatedKey;
    const fn = httpsCallable<
      {
        targetUid: string;
        explanation?: string;
        matchScore?: number;
        distanceMeters?: number;
        idempotencyKey: string;
      },
      {
        offerId: string;
        matchCreated: boolean;
        matchId?: string;
        expiresAt?: string;
        cooldownUntil?: string;
      }
    >(getFirebaseFunctions(), 'offerCreate');
    const result = await fn({
      targetUid: data.targetUid,
      explanation: data.explanation,
      matchScore: data.matchScore,
      distanceMeters: data.distanceMeters,
      idempotencyKey: keyToUse,
    });
    return result.data;
  });
}

// U23: Retry-wrapped with idempotency
export async function offerRespond(data: {
  offerId: string;
  action: 'accept' | 'decline';
  idempotencyKey?: string;
}): Promise<{ matchCreated: boolean; matchId?: string; offerId: string }> {
  return retryWithBackoff(async (generatedKey) => {
    const keyToUse = data.idempotencyKey || generatedKey;
    const fn = httpsCallable<
      { offerId: string; action: 'accept' | 'decline'; idempotencyKey: string },
      { matchCreated: boolean; matchId?: string; offerId: string }
    >(getFirebaseFunctions(), 'offerRespond');
    const result = await fn({
      offerId: data.offerId,
      action: data.action,
      idempotencyKey: keyToUse,
    });
    return result.data;
  });
}

export const offerCancel = createCallable<
  { offerId: string },
  { success: boolean }
>('offerCancel');

export interface InboxOffer {
  offerId: string;
  fromUid: string;
  fromDisplayName: string;
  fromPhotoURL: string | null;
  fromInterests: string[];
  activity: string;
  distanceMeters: number;
  explanation: string;
  matchScore: number;
  expiresAt: string;
  expiresInSeconds: number;
}

export const offersGetInbox = createCallable<
  void,
  { offers: InboxOffer[]; totalCount: number }
>('offersGetInbox');

export interface OutgoingOffer {
  offerId: string;
  toUid: string;
  toDisplayName: string;
  toPhotoURL: string | null;
  activity: string;
  status: string;
  expiresAt: string;
  expiresInSeconds: number;
  matchId?: string;
}

export const offerGetOutgoing = createCallable<
  void,
  {
    offers: OutgoingOffer[];
    cooldownRemaining: number;
    maxOffers: number;
    canSendMore: boolean;
  }
>('offerGetOutgoing');

// Match functions
// U23: Retry-wrapped with idempotency
export async function matchCancel(data: {
  matchId: string;
  reason?: string;
  idempotencyKey?: string;
}): Promise<{ success: boolean; wasSevereCancel: boolean }> {
  return retryWithBackoff(async (generatedKey) => {
    const keyToUse = data.idempotencyKey || generatedKey;
    const fn = httpsCallable<
      { matchId: string; reason?: string; idempotencyKey: string },
      { success: boolean; wasSevereCancel: boolean }
    >(getFirebaseFunctions(), 'matchCancel');
    const result = await fn({
      matchId: data.matchId,
      reason: data.reason,
      idempotencyKey: keyToUse,
    });
    return result.data;
  });
}

// PRD v2.4: Location Decision Functions
export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;
  rank: number;
  tags?: string[];
  priceLevel?: number;
  priceRange?: string; // U11: e.g., "$20-$50" (preferred over priceLevel)
  photoUrl?: string;
}

export const matchFetchAllPlaces = createCallable<
  { matchId: string },
  {
    success: boolean;
    placeCandidates: PlaceCandidate[];
    expiresAt: string | null;
    alreadyFetched: boolean;
  }
>('matchFetchAllPlaces');

export const matchSetPlaceChoice = createCallable<
  {
    matchId: string;
    placeId: string;
    placeRank: number;
    action?: 'choose' | 'tick' | 'findOthers';
  },
  {
    success: boolean;
    action: string;
    chosenPlaceId?: string;
    bothChoseSame?: boolean;
    shouldResolve?: boolean;
  }
>('matchSetPlaceChoice');

export const matchResolvePlaceIfNeeded = createCallable<
  { matchId: string },
  {
    success: boolean;
    alreadyConfirmed: boolean;
    confirmedPlaceId: string;
    confirmedPlaceName: string;
    confirmedPlaceAddress: string;
    confirmedPlaceLat: number;
    confirmedPlaceLng: number;
    resolutionReason: string;
    usedFallback?: boolean;
  }
>('matchResolvePlaceIfNeeded');

// Admin: Force-expire match for testing
export const adminForceExpireMatch = createCallable<
  { matchId: string; simulateCompletedUids?: string[] },
  {
    success: boolean; matchStatus: string; pendingUids: string[];
    user1Uid: string; user2Uid: string; message: string;
    rawStatusByUser: Record<string, string>; rawMatchStatus: string; simulatedUids: string[];
  }
>('adminForceExpireMatch');

export const checkAvailabilityForUser = createCallable<
  { activityType?: string; lat?: number; lng?: number },
  {
    ok: boolean;
    available: boolean;
    candidateCount: number;
    code?: 'OK' | 'NO_PLACES_AVAILABLE' | 'LOCATION_STALE' | 'LOCATION_MISSING';
    message?: string;
    details?: {
      activityType: string | null;
      radiusTriedKm: number[];
      suggestedActions: string[];
    };
  }
>('checkAvailabilityForUser');

// ============================================================================
// ACTIVITY COMPANION SYSTEM (v2.0)
// ============================================================================

// Activity Posts
export const activityPostCreate = createCallable<
  {
    body: string;
    category: string;
    maxParticipants: number;
    expiresInHours: number;
    locationName?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    imageUrl?: string | null;
  },
  { postId: string; status: string }
>('activityPostCreate');

export const activityPostUpdate = createCallable<
  {
    postId: string;
    body?: string;
    locationName?: string | null;
    locationLat?: number | null;
    locationLng?: number | null;
    maxParticipants?: number;
    expiresAt?: string;
  },
  { success: boolean }
>('activityPostUpdate');

export const activityPostClose = createCallable<
  { postId: string; reason?: string },
  { success: boolean }
>('activityPostClose');

export interface FeedPost {
  postId: string;
  creatorUid: string;
  creatorDisplayName: string;
  creatorPhotoURL: string | null;
  body: string;
  category: string;
  imageUrl: string | null;
  maxParticipants: number;
  acceptedCount: number;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
}

export const activityPostGetFeed = createCallable<
  { cursor?: string | null; category?: string | null; lat?: number | null; lng?: number | null; radiusKm?: number | null },
  { posts: FeedPost[]; nextCursor: string | null }
>('activityPostGetFeed');

export const activityPostGetMine = createCallable<
  { status?: string | null },
  { posts: FeedPost[] }
>('activityPostGetMine');

export interface PostDetail {
  postId: string;
  creatorUid: string;
  creatorDisplayName: string;
  creatorPhotoURL: string | null;
  body: string;
  category: string;
  imageUrl: string | null;
  maxParticipants: number;
  acceptedCount: number;
  locationName: string | null;
  locationLat: number | null;
  locationLng: number | null;
  status: string;
  closeReason: string | null;
  groupId: string | null;
  editCount: number;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface JoinRequestInfo {
  requestId: string;
  postId: string;
  requesterUid: string;
  requesterDisplayName: string;
  requesterPhotoURL: string | null;
  message: string | null;
  status: string;
  createdAt: string | null;
}

export interface GroupInfo {
  groupId: string;
  postId: string;
  creatorUid: string;
  memberUids: string[];
  memberCount: number;
  status: string;
  createdAt: string | null;
}

export const activityPostGetById = createCallable<
  { postId: string },
  {
    post: PostDetail;
    joinRequests: JoinRequestInfo[] | null;
    group: GroupInfo | null;
    myJoinRequest: { requestId: string; status: string; message: string | null; createdAt: string | null } | null;
  }
>('activityPostGetById');

// Join Requests
export const joinRequestSend = createCallable<
  { postId: string; message?: string | null },
  { requestId: string; status: string }
>('joinRequestSend');

export const joinRequestWithdraw = createCallable<
  { postId: string },
  { success: boolean }
>('joinRequestWithdraw');

export const joinRequestRespond = createCallable<
  { postId: string; requesterUid: string; action: 'accept' | 'decline' },
  { success: boolean; action: string; groupId?: string }
>('joinRequestRespond');

export const joinRequestGetMine = createCallable<
  { status?: string | null },
  { requests: JoinRequestInfo[] }
>('joinRequestGetMine');

// Groups
export const groupLeave = createCallable<
  { groupId: string },
  { success: boolean }
>('groupLeave');

export const groupKick = createCallable<
  { groupId: string; targetUid: string },
  { success: boolean }
>('groupKick');

export const groupSendMessage = createCallable<
  { groupId: string; body: string },
  { success: boolean; messageId: string }
>('groupSendMessage');

export interface GroupChatMsg {
  id: string;
  senderUid: string;
  senderDisplayName: string;
  body: string;
  type: 'user' | 'system';
  createdAt: string | null;
}

export const groupGetMessages = createCallable<
  { groupId: string; cursor?: string | null; limit?: number },
  { messages: GroupChatMsg[]; nextCursor: string | null }
>('groupGetMessages');

// Map Status
export const mapStatusSet = createCallable<
  { statusText: string; lat: number; lng: number },
  { success: boolean }
>('mapStatusSet');

export const mapStatusClear = createCallable<
  Record<string, never>,
  { success: boolean }
>('mapStatusClear');

export interface MapStatusNearby {
  uid: string;
  statusText: string;
  lat: number;
  lng: number;
  expiresAt: string | null;
  createdAt: string | null;
}

export const mapStatusGetNearby = createCallable<
  { lat: number; lng: number; radiusKm?: number },
  { statuses: MapStatusNearby[] }
>('mapStatusGetNearby');

// Safety
export const reportSubmit = createCallable<
  {
    reportedUid: string;
    reportType: string;
    context: string;
    contextId: string;
    description?: string | null;
  },
  { reportId: string }
>('reportSubmit');