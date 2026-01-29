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