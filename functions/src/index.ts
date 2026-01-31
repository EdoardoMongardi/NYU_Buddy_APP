import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import { presenceStartHandler } from './presence/start';
import { presenceEndHandler } from './presence/end';
import { suggestionGetTop1Handler } from './suggestions/getTop1';
import { suggestionRespondHandler } from './suggestions/respond';
import {
  meetupRecommendHandler,
  updateMatchStatusHandler,
} from './meetup/recommend';
import { offerCreateHandler } from './offers/create';
import { offerRespondHandler } from './offers/respond';
import { offerCancelHandler } from './offers/cancel';
import { offersGetInboxHandler } from './offers/getInbox';
import { offerGetOutgoingHandler } from './offers/getOutgoing';
import { matchConfirmPlaceHandler } from './matches/confirmPlace';
import { matchCancelHandler } from './matches/cancel';
import { matchFetchAllPlacesHandler } from './matches/fetchPlaces';
import { matchSetPlaceChoiceHandler } from './matches/setPlaceChoice';
import { matchResolvePlaceIfNeededHandler } from './matches/resolvePlace';
import { matchResolveExpiredHandler } from './matches/resolveExpired';
import { checkAvailabilityForUserHandler } from './availability/checkAvailability';

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

// Suggestion functions
export const suggestionGetTop1 = onCall(
  { region: 'us-east1' },
  suggestionGetTop1Handler
);

export const suggestionRespond = onCall(
  { region: 'us-east1' },
  suggestionRespondHandler
);

// Meetup functions
export const meetupRecommend = onCall(
  { region: 'us-east1' },
  meetupRecommendHandler
);

export const updateMatchStatus = onCall(
  { region: 'us-east1' },
  updateMatchStatusHandler
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
export const matchConfirmPlace = onCall(
  { region: 'us-east1' },
  matchConfirmPlaceHandler
);

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

export const checkAvailabilityForUser = onCall(
  { region: 'us-east1' },
  checkAvailabilityForUserHandler
);