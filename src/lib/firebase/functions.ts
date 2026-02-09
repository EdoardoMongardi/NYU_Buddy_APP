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
  { action?: 'next' | 'refresh' },
  {
    suggestion: CycleSuggestion | null;
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