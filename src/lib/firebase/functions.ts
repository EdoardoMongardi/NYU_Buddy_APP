import { httpsCallable, HttpsCallable } from 'firebase/functions';
import { getFirebaseFunctions } from './client';

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
export const presenceStart = createCallable<
  { activity: string; durationMin: number; lat: number; lng: number },
  { success: boolean }
>('presenceStart');

export const presenceEnd = createCallable<void, { success: boolean }>('presenceEnd');

// Suggestion functions
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

// Meetup functions
export const meetupRecommend = createCallable<
  { matchId: string },
  {
    places: Array<{
      id: string;
      name: string;
      category: string;
      address: string;
      distance: number;
    }>;
  }
>('meetupRecommend');

export const updateMatchStatus = createCallable<
  { matchId: string; status: 'heading_there' | 'arrived' | 'completed' },
  { success: boolean }
>('updateMatchStatus');

// Offer functions
export const offerCreate = createCallable<
  {
    targetUid: string;
    explanation?: string;
    matchScore?: number;
    distanceMeters?: number;
  },
  {
    offerId: string;
    matchCreated: boolean;
    matchId?: string;
    expiresAt?: string;
    cooldownUntil?: string;
  }
>('offerCreate');

export const offerRespond = createCallable<
  { offerId: string; action: 'accept' | 'decline' },
  { matchCreated: boolean; matchId?: string }
>('offerRespond');

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
  activity: string;
  status: string;
  expiresAt: string;
  expiresInSeconds: number;
  matchId?: string;
}

export const offerGetOutgoing = createCallable<
  void,
  {
    hasActiveOffer: boolean;
    offer?: OutgoingOffer;
    cooldownRemaining?: number;
    lastOfferStatus?: string;
  }
>('offerGetOutgoing');

// Match enhancement functions
export const matchConfirmPlace = createCallable<
  { matchId: string; placeId: string },
  { success: boolean; placeName: string; placeAddress: string }
>('matchConfirmPlace');

export const matchCancel = createCallable<
  { matchId: string; reason?: string },
  { success: boolean; wasSevereCancel: boolean }
>('matchCancel');

// PRD v2.4: Location Decision Functions
export interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;
  rank: number;
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