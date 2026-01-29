import * as admin from 'firebase-admin';
import { onCall } from 'firebase-functions/v2/https';

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