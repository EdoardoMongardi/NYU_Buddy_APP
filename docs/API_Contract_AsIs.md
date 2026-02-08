# NYU Buddy - API Contract (AS-IS)

**Document Version:** 1.2
**Generated:** 2026-02-06
**Last Verified:** 2026-02-07
**Source of Truth:** Code only (`functions/src/**`)
**Disclaimer:** This document ignores all content in `docs/**`. All specifications derived exclusively from codebase analysis.

---

## Table of Contents

1. [API Surface Summary](#1-api-surface-summary)
2. [Conventions](#2-conventions)
3. [Endpoint Contracts](#3-endpoint-contracts)
4. [Shared Data Types](#4-shared-data-types)
5. [Cross-Endpoint Workflows](#5-cross-endpoint-workflows)
6. [Known Contract Gaps](#6-known-contract-gaps)

---

## 1. API Surface Summary

| Function | Trigger | Auth | Primary Collections | Domain | Code Reference |
|----------|---------|------|---------------------|--------|----------------|
| `presenceStart` | onCall | Required | presence, sessionHistory | Presence | `presence/start.ts:L16-121` |
| `presenceEnd` | onCall | Required | presence, offers | Presence | `presence/end.ts:L4-35` |
| `suggestionGetTop1` | onCall | Required | presence, users, blocks, suggestions, matches, offers | Suggestions | `suggestions/getTop1.ts:L179-518` |
| `suggestionGetCycle` | onCall | Required | presence, users, blocks, suggestions, matches, offers | Suggestions | `suggestions/getCycle.ts:L318-449` |
| `suggestionPass` | onCall | Required | presence | Suggestions | `suggestions/getCycle.ts:L455-480` |
| `suggestionRespond` | onCall | Required | suggestions, matches | Suggestions | `suggestions/respond.ts:L9-87` |
| `offerCreate` | onCall | Required | presence, offers, blocks, matches, users, places | Offers | `offers/create.ts:L17-310` |
| `offerRespond` | onCall | Required | offers, presence, matches, suggestions | Offers | `offers/respond.ts:L9-249` |
| `offerCancel` | onCall | Required | offers, presence | Offers | `offers/cancel.ts:L8-61` |
| `offersGetInbox` | onCall | Required | presence, offers, users | Offers | `offers/getInbox.ts:L20-101` |
| `offerGetOutgoing` | onCall | Required | presence, offers, users | Offers | `offers/getOutgoing.ts:L20-114` |
| `matchFetchAllPlaces` | onCall | Required | matches, presence, places | Matches | `matches/fetchPlaces.ts:L21-186` |
| `matchSetPlaceChoice` | onCall | Required | matches | Matches | `matches/setPlaceChoice.ts:L12-119` |
| `matchResolvePlaceIfNeeded` | onCall | Required | matches | Matches | `matches/resolvePlace.ts:L26-168` |
| `matchResolveExpired` | onSchedule | N/A | matches | Matches | `matches/resolveExpired.ts:L10-42` |
| `matchConfirmPlace` | onCall | Required | matches, places | Matches | `matches/confirmPlace.ts:L9-88` |
| `matchCancel` | onCall | Required | matches, presence, users, offers | Matches | `matches/cancel.ts:L9-186` |
| `meetupRecommend` | onCall | Required | matches, presence, places | Meetup | `meetup/recommend.ts:L11-154` |
| `updateMatchStatus` | onCall | Required | matches | Meetup | `meetup/recommend.ts:L162-229` |
| `checkAvailabilityForUser` | onCall | Required | presence, places | Availability | `availability/checkAvailability.ts:L33-112` |

**Total: 20 endpoints** (19 callable, 1 scheduled)

---

## 2. Conventions

### 2.1 Region Configuration

All Cloud Functions are deployed to `us-east1`:

```typescript
// Pattern used for all onCall functions
export const functionName = onCall(
  { region: 'us-east1' },
  handlerFunction
);
```

**Reference:** `functions/src/index.ts:L31-136`

### 2.2 Authentication Model

All callable functions use Firebase Auth context:

```typescript
// Pattern used across all handlers
if (!request.auth) {
  throw new HttpsError('unauthenticated', 'User must be authenticated');
}
const uid = request.auth.uid;
```

**Reference:** Every handler file, typically lines 1-10.

### 2.3 Error Model

All errors use Firebase `HttpsError` with standard codes:

| Code | Usage |
|------|-------|
| `unauthenticated` | Missing `request.auth` |
| `invalid-argument` | Missing/invalid request data |
| `not-found` | Document does not exist |
| `permission-denied` | User not authorized for action |
| `failed-precondition` | State invalid for operation |
| `resource-exhausted` | Rate limit exceeded |
| `already-exists` | Duplicate resource |
| `internal` | Unhandled errors (wrapped) |

### 2.4 Timestamp Representation

- **Server writes:** `admin.firestore.FieldValue.serverTimestamp()`
- **Calculations:** `admin.firestore.Timestamp.now()` or `admin.firestore.Timestamp.fromMillis()`
- **Response format:** ISO 8601 strings via `.toDate().toISOString()`

### 2.5 Rate Limiting Patterns

See: StateMachine_AsIs.md#3-constants--configuration for all lifecycle constants and rate limits.

### 2.6 Transaction Patterns

| Pattern | Used In |
|---------|---------|
| `db.runTransaction()` | Atomic multi-doc updates (offers, matches, presence) |
| `db.batch()` | Non-transactional bulk writes (cleanup) |

**Transaction reads before writes enforced:** `matches/cancel.ts:L82-101`

### 2.7 Idempotency Patterns

| Endpoint | Pattern |
|----------|---------|
| `matchFetchAllPlaces` | Returns existing `placeCandidates` if already fetched (`L64-71`) |
| `matchResolvePlaceIfNeeded` | Returns existing `confirmedPlaceId` if set (`L58-69`) |
| `matchSetPlaceChoice` | No-op if same choice already made (`L85-91`) |

---

## 3. Endpoint Contracts

### 3.1 presenceStart

**Type:** onCall
**Route:** callable
**Auth:** Required via `request.auth`
**Purpose:** Create/replace user's availability session.

**Request Schema:**
```typescript
{
  activity: string;       // Required, non-empty
  durationMin: number;    // Required, 15-240
  lat: number;            // Required, 40.4-41.0 (NYC bounds)
  lng: number;            // Required, -74.3 to -73.7 (NYC bounds)
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  sessionId: string;      // UUID v4
  expiresAt: string;      // ISO 8601
}
```

**Side Effects / Writes:**
- `presence/{uid}` — Creates/overwrites with: uid, activity, durationMinutes, lat, lng, geohash, status='available', sessionId, seenCandidateIds=[], activeOutgoingOfferId=null, offerCooldownUntil=null, exposureScore=0, lastExposedAt=null, expiresAt, createdAt, updatedAt
- `sessionHistory/{uid}/sessions/{sessionId}` — Creates rate-limit record

**Reads / Queries:**
- `sessionHistory/{uid}/sessions` where `createdAt > (now - 1 hour)` — Rate limit check

**Guards / Preconditions:**
- Auth required
- Coordinates within NYC bounds (40.4-41.0, -74.3 to -73.7)
- Max 100 sessions per hour

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L19-21` |
| `invalid-argument` | Missing/invalid activity | `L28-30` |
| `invalid-argument` | Duration outside 15-240 | `L32-37` |
| `invalid-argument` | Invalid coordinates | `L39-41` |
| `invalid-argument` | Outside NYC bounds | `L44-49` |
| `resource-exhausted` | >100 sessions/hour | `L60-65` |

**Code References:**
- `functions/src/presence/start.ts:L16-121`

---

### 3.2 presenceEnd

**Type:** onCall
**Route:** callable
**Auth:** Required via `request.auth`
**Purpose:** Delete user's availability session and cleanup pending offers.

**Request Schema:**
```typescript
{} // No parameters
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Side Effects / Writes:**
- `presence/{uid}` — Deleted
- `offers` where `fromUid == uid` or `toUid == uid` and `status == 'pending'` — Set to `status: 'cancelled'`, `cancelReason: 'matched_elsewhere'`

**Reads / Queries:**
- `presence/{uid}` — Check exists

**Guards / Preconditions:**
- Auth required (no presence is OK — returns success)

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L5-7` |

**Code References:**
- `functions/src/presence/end.ts:L4-35`
- `functions/src/offers/cleanup.ts:L8-56`

---

### 3.3 suggestionGetTop1

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Get top-ranked suggestion candidate (legacy flow).

**Request Schema:**
```typescript
{} // No parameters
```

**Response Schema:**
```typescript
{
  suggestion: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    interests: string[];
    activity: string;
    distance: number;        // meters
    durationMinutes: number;
    explanation: string;
    score: number;           // 0-100
  } | null;
  searchRadiusKm: number;
  message?: string;
  debug?: {
    filterReasons: Record<string, number>;
    totalCandidatesBeforeFilter: number;
  };
}
```

**Side Effects / Writes:**
- `presence/{uid}.seenCandidateIds` — ArrayUnion with returned candidate UID
- `presence/{uid}` — Deleted if expired

**Reads / Queries:**
- `presence/{uid}` — User's presence
- `users/{uid}` — User's interests
- `blocks/{uid}/blocked` — Blocked users
- `suggestions` where `fromUid == uid` and `action == 'pass'` — Recent passes (3-day cooldown)
- `matches` where user is participant with active status
- `offers` where `toUid == uid` and `status == 'pending'` — Exclude offer senders
- `presence` — Geohash range query for candidates

**Guards / Preconditions:**
- User must have active presence
- Presence must not be expired

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L180-182` |
| `failed-precondition` | No presence | `L190-195` |
| `failed-precondition` | Presence expired | `L201-204` |

**Performance Notes:**
- Geohash range scan across multiple bounds
- N+1 queries for symmetric block checks and user profile fetches

**Code References:**
- `functions/src/suggestions/getTop1.ts:L179-518`

---

### 3.4 suggestionGetCycle

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Get next suggestion from cycle-based browsing (stateless fresh fetch).

**Request Schema:**
```typescript
{
  action?: 'next' | 'refresh';  // Optional, 'refresh' clears seen list
}
```

**Response Schema:**
```typescript
{
  suggestion: {
    uid: string;
    displayName: string;
    photoURL: string | null;
    interests: string[];
    activity: string;
    distance: number;
    durationMinutes: number;
    explanation: string;
  } | null;
  cycleInfo: {
    total: number;
    current: number;
    isNewCycle: boolean;
  };
  message?: string;
}
```

**Side Effects / Writes:**
- `presence/{uid}.seenUids` — Cleared on 'refresh' action or cycle reset
- `presence/{uid}` — Deleted if expired

**Reads / Queries:**
- Same as `suggestionGetTop1` plus:
- `offers` where `fromUid == uid` and `status == 'pending'` — Exclude active offer targets

**Guards / Preconditions:**
- User must have active, non-expired presence

**State Impact:**
- Tracks `seenUids` and `lastViewedUid` in presence for rotation logic

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L321-323` |
| `failed-precondition` | No presence | `L334-336` |
| `failed-precondition` | Presence expired | `L342-345` |
| `internal` | Unhandled error | `L446-448` |

**Code References:**
- `functions/src/suggestions/getCycle.ts:L318-449`

---

### 3.5 suggestionPass

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Mark a suggestion as seen (advance cycle).

**Request Schema:**
```typescript
{
  targetUid: string;  // Required
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Side Effects / Writes:**
- `presence/{uid}.seenUids` — ArrayUnion with targetUid
- `presence/{uid}.lastViewedUid` — Set to targetUid

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L458-460` |
| `invalid-argument` | Missing targetUid | `L465-467` |

**Code References:**
- `functions/src/suggestions/getCycle.ts:L455-480`

---

### 3.6 suggestionRespond

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Record pass/accept for mutual-accept matching (legacy flow).

**Request Schema:**
```typescript
{
  targetUid: string;           // Required
  action: 'pass' | 'accept';   // Required
}
```

**Response Schema:**
```typescript
{
  matchCreated: boolean;
  matchId?: string;  // Only if matchCreated=true
}
```

**Side Effects / Writes:**
- `suggestions/{uid}_{targetUid}` — Created with action
- On mutual accept:
  - `matches/{auto}` — Created with minimal schema
  - `suggestions/{uid}_{targetUid}` — Deleted
  - `suggestions/{targetUid}_{uid}` — Deleted

**Guards / Preconditions:**
- Cannot respond to yourself

**Security Notes:**
- Match created via this path has fewer fields than offer-based match (missing `offerId`, `activity`, `confirmedPlace*` nulls)

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L12-14` |
| `invalid-argument` | Missing/invalid targetUid | `L19-21` |
| `invalid-argument` | Invalid action | `L23-28` |
| `invalid-argument` | Target is self | `L30-32` |

**Code References:**
- `functions/src/suggestions/respond.ts:L9-87`

---

### 3.7 offerCreate

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Send a meetup offer to another user.

**Request Schema:**
```typescript
{
  targetUid: string;           // Required
  explanation?: string;        // Optional
  matchScore?: number;         // Optional
  distanceMeters?: number;     // Optional
  activityType?: string;       // Optional, for place availability check
}
```

**Response Schema (no mutual offer):**
```typescript
{
  offerId: string;
  matchCreated: false;
  expiresAt: string;        // ISO 8601
  cooldownUntil: string;    // ISO 8601
}
```

**Response Schema (mutual offer detected):**
```typescript
{
  offerId: string;
  matchCreated: true;
  matchId: string;
}
```

**Side Effects / Writes:**
- `offers/{auto}` — Created with full schema
- `presence/{fromUid}.activeOutgoingOfferIds` — ArrayUnion
- `presence/{fromUid}.offerCooldownUntil` — Set
- `presence/{targetUid}.exposureScore` — Increment
- On mutual offer:
  - `matches/{auto}` — Created
  - `offers/{reverseOfferId}` — Updated to accepted
  - Both presence docs — status='matched', offers cleared

**Reads / Queries:**
- `blocks/{fromUid}/blocked/{targetUid}` — Symmetric block check
- `blocks/{targetUid}/blocked/{fromUid}` — Symmetric block check
- `presence/{fromUid}` — Sender presence
- `presence/{targetUid}` — Target presence
- `places` — Pre-offer place availability check (min 1)
- `offers` where existing offer to target
- `offers` where active offers from sender
- `matches` where either user is participant with active status
- `offers` where reverse offer exists

**Guards / Preconditions:**
- Both users must have non-expired presence
- Neither user in active match
- No existing pending offer to target
- Max 3 active offers
- Cooldown elapsed
- At least 1 place candidate available

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L18-20` |
| `invalid-argument` | Invalid targetUid | `L27-30` |
| `failed-precondition` | Sender blocked target | `L40-42` |
| `failed-precondition` | Target blocked sender | `L52-54` |
| `failed-precondition` | No sender presence | `L58-60` |
| `failed-precondition` | Sender expired | `L65-68` |
| `failed-precondition` | No places available | `L83-85` |
| `already-exists` | Existing offer to target | `L98-100` |
| `resource-exhausted` | Max 3 offers | `L109-111` |
| `failed-precondition` | Cooldown active | `L114-118` |
| `failed-precondition` | No target presence | `L122-124` |
| `failed-precondition` | Target expired | `L129-131` |
| `failed-precondition` | Sender in match | `L149-151` |
| `failed-precondition` | Target in match | `L165-167` |

**Code References:**
- `functions/src/offers/create.ts:L17-310`

---

### 3.8 offerRespond

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Accept or decline a received offer.

**Request Schema:**
```typescript
{
  offerId: string;              // Required
  action: 'accept' | 'decline'; // Required
}
```

**Response Schema (decline):**
```typescript
{
  matchCreated: false;
}
```

**Response Schema (accept success):**
```typescript
{
  matchCreated: true;
  matchId: string;
  activeMatchId: string;
}
```

**Response Schema (accept but sender matched elsewhere):**
```typescript
{
  matchCreated: false;
  code: 'NO_LONGER_AVAILABLE';
  message: string;
}
```

**Side Effects / Writes:**
- On decline:
  - `offers/{offerId}` — status='declined'
  - `presence/{fromUid}.activeOutgoingOfferIds` — ArrayRemove
  - `presence/{fromUid}.recentlyExpiredOfferUids` — ArrayUnion with decliner
  - `suggestions/{uid}_{fromUid}` — Created with action='reject'
  - `suggestions/{fromUid}_{uid}` — Created with action='reject'
- On accept:
  - `matches/{auto}` — Created with full schema
  - `offers/{offerId}` — status='accepted', matchId set
  - Both presence docs — status='matched', offers cleared
  - Cleanup all other pending offers for both users

**Guards / Preconditions:**
- User must be offer recipient
- Offer must be pending
- Offer must not be expired
- On accept: Both users must have non-expired presence
- On accept: Neither user in active match
- On accept: Activities must still match

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L10-12` |
| `invalid-argument` | Missing offerId | `L20-22` |
| `invalid-argument` | Invalid action | `L24-26` |
| `not-found` | Offer not found | `L32-34` |
| `permission-denied` | Not recipient | `L39-41` |
| `failed-precondition` | Not pending | `L44-46` |
| `failed-precondition` | Expired (auto-updates) | `L49-56` |
| `failed-precondition` | Sender no presence | `L108-114` |
| `failed-precondition` | Sender expired | `L117-123` |
| `failed-precondition` | Receiver no presence | `L126-128` |
| `failed-precondition` | Receiver expired | `L131-133` |
| `failed-precondition` | Receiver in match | `L175-177` |
| `failed-precondition` | Activities mismatch | `L180-186` |

**Code References:**
- `functions/src/offers/respond.ts:L9-249`

---

### 3.9 offerCancel

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Cancel an outgoing offer.

**Request Schema:**
```typescript
{
  offerId: string;  // Required
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Side Effects / Writes:**
- `offers/{offerId}` — status='cancelled'
- `presence/{uid}.activeOutgoingOfferIds` — ArrayRemove

**Guards / Preconditions:**
- User must be offer sender
- Offer must be pending

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L9-11` |
| `invalid-argument` | Missing offerId | `L18-20` |
| `not-found` | Offer not found | `L26-28` |
| `permission-denied` | Not sender | `L33-35` |
| `failed-precondition` | Not pending | `L38-40` |

**Code References:**
- `functions/src/offers/cancel.ts:L8-61`

---

### 3.10 offersGetInbox

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Get pending offers received by user.

**Request Schema:**
```typescript
{} // No parameters
```

**Response Schema:**
```typescript
{
  offers: Array<{
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
  }>;
  totalCount: number;
}
```

**Reads / Queries:**
- `presence/{uid}` — Check active presence
- `offers` where `toUid == uid`, `status == 'pending'`, `expiresAt > now` — Limit 6 (for 3 max inbox)
- `users/{fromUid}` — For each offer sender

**Performance Notes:**
- Returns max 3 offers (MAX_INBOX_SIZE)
- Fetches 6 to account for expiration race

**Code References:**
- `functions/src/offers/getInbox.ts:L20-101`

---

### 3.11 offerGetOutgoing

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Get active outgoing offers.

**Request Schema:**
```typescript
{} // No parameters
```

**Response Schema:**
```typescript
{
  offers: Array<{
    offerId: string;
    toUid: string;
    toDisplayName: string;
    toPhotoURL: string | null;
    activity: string;
    status: string;
    expiresAt: string;
    expiresInSeconds: number;
    matchId?: string;
  }>;
  cooldownRemaining: number;
  maxOffers: 3;
  canSendMore: boolean;
}
```

**Side Effects / Writes:**
- `presence/{uid}.activeOutgoingOfferIds` — Synced with actual offers

**Code References:**
- `functions/src/offers/getOutgoing.ts:L20-114`

---

### 3.12 matchFetchAllPlaces

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Fetch place candidates for location decision phase.

**Request Schema:**
```typescript
{
  matchId: string;  // Required
}
```

**Response Schema (success):**
```typescript
{
  success: true;
  placeCandidates: PlaceCandidate[];
  expiresAt: string | null;
  alreadyFetched: boolean;
}
```

**Response Schema (cancelled):**
```typescript
{
  success: false;
  placeCandidates: [];
  expiresAt: null;
  cancelled: true;
  cancellationReason: string;
}
```

**Response Schema (error - caught exception):**
```typescript
{
  success: false;
  message: string;          // "Server Error: ..."
  placeCandidates: [];
  expiresAt: null;
  alreadyFetched: false;
}
```

**Note:** This endpoint returns error responses instead of throwing HttpsError for internal errors (`L171-180`).

**Side Effects / Writes:**
- `matches/{matchId}` — Set placeCandidates, locationDecision.expiresAt, status='location_deciding'
- On 0 candidates: status='cancelled', cancelledBy='system', cancellationReason='no_places_available'

**Reads / Queries:**
- `matches/{matchId}` — Match doc
- `presence/{user1Uid}` — User 1 location
- `presence/{user2Uid}` — User 2 location
- `places` — Geohash range query with activity filter

**Guards / Preconditions:**
- User must be match participant
- Match not already cancelled

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L25-27` |
| `invalid-argument` | Missing matchId | `L32-34` |
| `not-found` | Match not found | `L40-42` |
| `permission-denied` | Not participant | `L47-49` |

**Code References:**
- `functions/src/matches/fetchPlaces.ts:L21-186`

---

### 3.13 matchSetPlaceChoice

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Set user's place selection or record telemetry.

**Request Schema:**
```typescript
{
  matchId: string;        // Required
  placeId: string;        // Required for choose/tick
  placeRank: number;      // Required for choose/tick
  action?: 'choose' | 'tick' | 'findOthers';  // Default: 'choose'
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  action: 'chosen' | 'changed' | 'noChange' | 'findOthers';
  chosenPlaceId?: string;
  bothChoseSame?: boolean;
  shouldResolve?: boolean;
}
```

**Side Effects / Writes:**
- `matches/{matchId}.placeChoiceByUser.{uid}` — Set choice
- `matches/{matchId}.telemetry.*` — Increment counters

**Guards / Preconditions:**
- Match must be in `location_deciding` status
- placeId must exist in placeCandidates

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L15-17` |
| `invalid-argument` | Missing matchId | `L22-24` |
| `not-found` | Match not found | `L32-34` |
| `permission-denied` | Not participant | `L39-41` |
| `failed-precondition` | Not location_deciding | `L44-46` |
| `invalid-argument` | Missing placeId/rank | `L69-71` |
| `invalid-argument` | Invalid place | `L76-78` |

**Code References:**
- `functions/src/matches/setPlaceChoice.ts:L12-119`

---

### 3.14 matchResolvePlaceIfNeeded

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Resolve place selection using deterministic rules.

**Request Schema:**
```typescript
{
  matchId: string;  // Required
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  alreadyConfirmed?: boolean;
  confirmedPlaceId: string;
  confirmedPlaceName: string;
  confirmedPlaceAddress: string;
  confirmedPlaceLat: number;
  confirmedPlaceLng: number;
  resolutionReason: 'both_same' | 'tick_sync' | 'one_chose' | 'none_chose' | 'rank_tiebreak';
  // NOTE: 'tick_sync' is defined in the ResolutionReason type (resolvePlace.ts:24) but is NEVER produced by any code path
  cancelled?: boolean;
  cancellationReason?: string;
}
```

**Resolution Rules:** See: StateMachine_AsIs.md#44-place-decision-domain for the deterministic resolution algorithm.

**Side Effects / Writes:**
- `matches/{matchId}` — Set confirmedPlace*, status='place_confirmed', locationDecision.resolvedAt/resolutionReason
- On 0 candidates: status='cancelled'

**Code References:**
- `functions/src/matches/resolvePlace.ts:L26-168`
- Resolution algorithm: `L179-231`

---

### 3.15 matchResolveExpired

**Type:** onSchedule
**Schedule:** Every 1 minute
**Auth:** N/A (server-side)
**Purpose:** Auto-resolve expired location decisions.

**Query:**
```typescript
matches where status == 'location_deciding'
  and locationDecision.expiresAt <= now
  limit 50
```

**Side Effects:**
- Calls `resolveMatchPlaceInternal` for each expired match

**Code References:**
- `functions/src/matches/resolveExpired.ts:L10-42`
- Internal resolver: `functions/src/matches/resolvePlace.ts:L237-298`

---

### 3.16 matchConfirmPlace

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Manually confirm a place (legacy flow, first-confirm-wins).

**Request Schema:**
```typescript
{
  matchId: string;   // Required
  placeId: string;   // Required
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  placeName: string;
  placeAddress: string;
}
```

**Side Effects / Writes:**
- `matches/{matchId}` — Set confirmedPlace*, placeConfirmedBy, status='place_confirmed'

**Guards / Preconditions:**
- No place already confirmed
- Match status in ['pending', 'place_confirmed']
- Place must exist and be active

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L10-12` |
| `invalid-argument` | Missing matchId/placeId | `L19-21` |
| `not-found` | Match not found | `L27-29` |
| `permission-denied` | Not participant | `L34-36` |
| `failed-precondition` | Already confirmed | `L39-41` |
| `failed-precondition` | Invalid status | `L44-46` |
| `not-found` | Place not found | `L51-53` |
| `failed-precondition` | Place inactive | `L57-59` |
| `failed-precondition` | Race: already confirmed | `L67-69` |

**Code References:**
- `functions/src/matches/confirmPlace.ts:L9-88`

---

### 3.17 matchCancel

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Cancel an active match.

**Request Schema:**
```typescript
{
  matchId: string;   // Required
  reason?: string;   // Optional
}
```

**Response Schema:**
```typescript
{
  success: boolean;
  wasSevereCancel: boolean;  // true if other user was heading_there/arrived
}
```

**Side Effects / Writes:**
- `matches/{matchId}` — status='cancelled', cancelledBy, cancellationReason
- `users/{uid}.reliabilityStats` — Increment cancelledByUser, recalculate score
- `offers` where `matchId == matchId` and `status == 'accepted'` — status='cancelled'
- `presence/{user1Uid}` and `presence/{user2Uid}` — status='available' if not expired

**Penalty Logic:** See: StateMachine_AsIs.md#43-match-domain for penalty multiplier rules.

**Guards / Preconditions:**
- Cannot cancel completed match
- Cannot cancel already-cancelled match

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L12-14` |
| `invalid-argument` | Missing matchId | `L23-25` |
| `not-found` | Match not found | `L31-34` |
| `internal` | Match data corrupted | `L37-40` |
| `permission-denied` | Not participant | `L43-46` |
| `failed-precondition` | Already completed | `L49-51` |
| `failed-precondition` | Already cancelled | `L53-55` |
| `internal` | Unhandled error | `L183-185` |

**Code References:**
- `functions/src/matches/cancel.ts:L9-186`

---

### 3.18 meetupRecommend

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Get nearby place recommendations for a match.

**Request Schema:**
```typescript
{
  matchId: string;  // Required
}
```

**Response Schema:**
```typescript
{
  places: Array<{
    id: string;
    name: string;
    category: string;
    address: string;
    distance: number;
    lat?: number;
    lng?: number;
  }>;
}
```

**Reads / Queries:**
- `matches/{matchId}` — Match data
- `presence/{user1Uid}` and `presence/{user2Uid}` — Locations
- `places` — Geohash range query (2km radius)

**Code References:**
- `functions/src/meetup/recommend.ts:L11-154`

---

### 3.19 updateMatchStatus

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Update user's meetup status progression.

**Request Schema:**
```typescript
{
  matchId: string;
  status: 'heading_there' | 'arrived' | 'completed';
}
```

**Response Schema:**
```typescript
{
  success: boolean;
}
```

**Side Effects / Writes:**
- `matches/{matchId}.statusByUser.{uid}` — Set to new status
- `matches/{matchId}.status` — Derived from both users' statuses

**Status Derivation Logic:** See: StateMachine_AsIs.md#43-match-domain for formal status aggregation rules.

**Failure Modes:**
| Error Code | Condition | Location |
|------------|-----------|----------|
| `unauthenticated` | No auth | `L165-167` |
| `invalid-argument` | Missing matchId | `L172-174` |
| `invalid-argument` | Invalid status | `L177-179` |
| `not-found` | Match not found | `L187-189` |
| `permission-denied` | Not participant | `L194-199` |

**Code References:**
- `functions/src/meetup/recommend.ts:L162-229`

---

### 3.20 checkAvailabilityForUser

**Type:** onCall
**Route:** callable
**Auth:** Required
**Purpose:** Pre-match check for place availability.

**Request Schema:**
```typescript
{
  activityType?: string;
  lat?: number;
  lng?: number;
}
```

**Response Schema:**
```typescript
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
```

**Reads / Queries:**
- `presence/{uid}` — Stored location (if lat/lng not provided)
- `places` — Geohash range query

**Code References:**
- `functions/src/availability/checkAvailability.ts:L33-112`

---

## 4. Shared Data Types

### 4.1 PlaceCandidate

```typescript
interface PlaceCandidate {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;     // meters
  rank: number;         // 1-indexed
  tags?: string[];
  priceLevel?: number;  // Default: 2
  photoUrl?: string | null;
}
```

**Code Reference:** `functions/src/utils/places.ts:L17-28`

### 4.2 Constants

See: StateMachine_AsIs.md#3-constants--configuration

---

## 5. Cross-Endpoint Workflows

### 5.1 Standard Match Flow

```
1. presenceStart
   └── Creates: presence/{uid}, sessionHistory/{uid}/sessions/{sessionId}

2. suggestionGetCycle (or suggestionGetTop1)
   └── Reads: presence, users, blocks, suggestions, matches, offers
   └── Updates: presence.seenUids

3. offerCreate
   └── Creates: offers/{offerId}
   └── Updates: presence.activeOutgoingOfferIds, presence.exposureScore (target)
   └── [If mutual] Creates: matches/{matchId}

4. offerRespond (accept)
   └── Creates: matches/{matchId}
   └── Updates: offers.status, presence.status='matched'
   └── Cleanup: other pending offers cancelled

5. matchFetchAllPlaces
   └── Updates: matches.placeCandidates, status='location_deciding'
   └── [If 0 places] Updates: status='cancelled'

6. matchSetPlaceChoice (×2 users)
   └── Updates: matches.placeChoiceByUser.{uid}

7. matchResolvePlaceIfNeeded (or matchResolveExpired)
   └── Updates: matches.confirmedPlace*, status='place_confirmed'

8. updateMatchStatus (×2 users, multiple times)
   └── Updates: matches.statusByUser.{uid}, matches.status

9. presenceEnd (or matchCancel)
   └── Deletes: presence/{uid}
   └── Cleanup: pending offers cancelled
```

### 5.2 Match Cancellation Flow

```
matchCancel
├── Updates: matches.status='cancelled'
├── Updates: users.reliabilityStats, reliabilityScore
├── Updates: offers (associated).status='cancelled'
└── Updates: presence (both users).status='available' (if not expired)
```

---

## 6. Known Contract Gaps

### 6.1 ~~Two Match Creation Schemas~~ ✅ RESOLVED (U14)

**Status:** ✅ **RESOLVED** (2026-02-08)

**Pre-U14 Issue:** Offer-based matches included `activity` field, but suggestion-based matches did not, causing potential failures in code expecting this field.

**U14 Resolution:**
- ✅ All match creation paths now use consistent schema with `activity` field
- ✅ `offers/create.ts:184-190` validates activity with safe fallback to 'Coffee' if invalid
- ✅ `offers/create.ts:209` uses `reverseOfferData.activity` (validated value) for match creation
- ✅ Fallback logic ensures no matches created with undefined/invalid activity

**Remaining Note:** Suggestion-based matches still don't include `offerId` (by design - they're not created from offers).

### 6.2 ~~Inconsistent `presence.matchId` Writes~~ ✅ RESOLVED (U14/U15)

**Status:** ✅ **RESOLVED** (2026-02-08)

**Pre-U14 Issue:** `offerRespond` path did not set `presence.matchId`, while `offerCreate` mutual interest path did, causing inconsistent detection of active matches.

**U14/U15 Resolution:**
- ✅ ALL match creation paths now set `presence.matchId` for both users
- ✅ `offers/create.ts:228,241` - sets matchId (mutual interest path)
- ✅ `offers/respond.ts:229,236` - sets matchId (accept offer path)
- ✅ Match completion/cancellation clears matchId (`matches/cancel.ts:177`, `meetup/recommend.ts:230-251`)
- ✅ Audit script `auditPresenceMatchId.ts` detects and fixes orphaned matchId references
- ✅ Discovery blocking now consistently works via `presence.status === 'matched'` check

> **Additional known gaps:** See StateMachine_AsIs.md#9-known-inconsistencies--ambiguities for inconsistent active match status lists, phantom statuses, offer expiry persistence, and match stuck in pending. See DataModel_AsIs.md#15-known-issues--data-integrity-concerns for phantom fields, missing fields at creation, and index requirements.

---

**END OF DOCUMENT**