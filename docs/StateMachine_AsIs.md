# State Machine (AS-IS)

> **Code is the single source of truth.** All claims are cited with file paths and line numbers. Items marked **[UNCONFIRMED]** could not be verified from code.

## 1. Scope
This document describes the state machines for the core interaction loop of the NYU Buddy application:
- **Presence**: User availability and discoverability.
- **Offer**: Peer-to-peer invitations.
- **Match**: The lifecycle of a matched session between two users.
- **Place Decision**: The sub-process within a match for agreeing on a meeting location.

**Out of Scope:**
- User Authentication / Onboarding logic (covered in PRD).
- Profile editing.
- Feedback creation (fire-and-forget client-side write).
- Reporting / Blocking flows (except where they explicitly trigger state transitions).

## 2. Global State Domains
The system consists of the following independent but interacting domains:

1.  **Presence Lifecycle**: Controls a user's visibility to others.
2.  **Offer Lifecycle**: Manages the negotiation between two users before a match is formed.
3.  **Match Lifecycle**: Manages the state of the confirmed session.
4.  **Place Decision Lifecycle**: A nested state machine within the Match domain for resolving location.

## 3. Constants & Configuration

| Constant | Value | File | Line | Description |
| :--- | :--- | :--- | :--- | :--- |
| `OFFER_TTL_MINUTES` | 10 | `functions/src/offers/create.ts` | 5 | Offer expiration time |
| `COOLDOWN_SECONDS` | 5 | `functions/src/offers/create.ts` | 6 | Minimum time between sending offers |
| `MAX_ACTIVE_OFFERS` | 3 | `functions/src/offers/create.ts` | 7 | Maximum concurrent outgoing offers |
| `GRACE_PERIOD_MINUTES` | 5 | `functions/src/presence/start.ts` | 6 | Added to user-specified duration for presence expiry |
| `LOCATION_DECISION_SECONDS` | 120 | `functions/src/utils/places.ts` | 14 | Time allowed for place voting (2 minutes) |
| `REJECTION_COOLDOWN_MS` | 6h | `functions/src/suggestions/getCycle.ts` | 17 | Symmetric cooldown after decline |
| `MAX_SESSIONS_PER_HOUR` | 100 | `functions/src/presence/start.ts` | 8 | Rate limit for presence sessions |
| `RADIUS_KM` (suggestions) | 5 | `functions/src/suggestions/getCycle.ts` | 19 | Discovery radius |
| `HARD_CAP` (places) | 9 | `functions/src/utils/places.ts` | 11 | Max place candidates returned |
| `SOFT_MIN` (places) | 6 | `functions/src/utils/places.ts` | 12 | Min candidates before radius expansion |
| `SEARCH_RADII_KM` | [2, 3, 5] | `functions/src/utils/places.ts` | 13 | Fallback radius expansion |
| `LOCATION_STALE_THRESHOLD_MS` | 300000 (5 min) | `functions/src/utils/places.ts` | 15 | Location freshness threshold |
| `DEFAULT_LOCATION` | [40.7295, -73.9965] (NYU WSQ) | `functions/src/utils/places.ts` | 213 | Fallback center point |
| `PENDING_TIMEOUT_MINUTES` | 15 | `functions/src/matches/cleanupStalePending.ts` | 14 | Phase 2: Timeout for stale pending matches |

## 4. State Definitions (AS-IS)

### 4.1 Presence Domain
**Representation:** Firestore document `presence/{uid}`.
**Field:** `status` (explicit string).

| State Name | Code Representation | Invariants / Notes | Code Reference |
| :--- | :--- | :--- | :--- |
| **Offline** | *No Document* | User document does not exist in `presence` collection. | `functions/src/presence/end.ts:32` (deletes doc) |
| **Available** | `status: 'available'` | `expiresAt` > `now`. `expiresAt` = user duration + 5 min grace period. | `functions/src/presence/start.ts:74-76, 90` |
| **Matched** | `status: 'matched'` | `matchId` field is set. User is hidden from discovery. | `functions/src/offers/create.ts:220, 228`; `functions/src/offers/respond.ts:227, 233` |

**Additional Fields** (verified in `functions/src/presence/start.ts:83-101` and `functions/src/offers/create.ts:289-301`):
- `activeOutgoingOfferIds`: Array of active offer IDs (line 291)
- `activeOutgoingOfferId`: Legacy field, set to null (line 94)
- `seenUids`: UIDs already shown to user (`functions/src/suggestions/getCycle.ts:353`)
- `recentlyExpiredOfferUids`: UIDs whose offers expired (`functions/src/offers/respond.ts:72`)
- `lastViewedUid`: Last suggestion shown (`functions/src/suggestions/getCycle.ts:475`)
- `offerCooldownUntil`: Timestamp preventing rapid offer spam (line 292)
- `exposureScore`: Counter of received offers, initialized to 0 (line 96), incremented on `offerCreate` (line 298)

See: DataModel_AsIs.md#3-collection-presence for full field schema.

### 4.2 Offer Domain
**Representation:** Firestore document `offers/{offerId}`.
**Field:** `status` (explicit string).

| State Name | Code Representation | Invariants / Notes | Code Reference |
| :--- | :--- | :--- | :--- |
| **Pending** | `status: 'pending'` | `expiresAt` > `now`. TTL: 10 minutes. | `functions/src/offers/create.ts:277` |
| **Accepted** | `status: 'accepted'` | `matchId` is set. | `functions/src/offers/create.ts:211`; `functions/src/offers/respond.ts:219` |
| **Declined** | `status: 'declined'` | Triggers 6h symmetric cooldown. | `functions/src/offers/respond.ts:63` |
| **Expired** | `status: 'expired'` | `expiresAt` < `now` OR one party unavailable. | `functions/src/offers/respond.ts:52, 110, 119, 152` |
| **Cancelled** | `status: 'cancelled'` | Cancelled by sender or system cleanup. | `functions/src/offers/cleanup.ts:27`; `functions/src/offers/cancel.ts` |

**Decline Cooldown Mechanism** (`functions/src/offers/respond.ts:76-93`):
The 6h cooldown is NOT stored in the offer document. Instead:
1. Two entries are created in the `suggestions` collection with `action: 'reject'` (lines 81-93)
2. One entry for each direction (A→B and B→A)
3. Cooldown is computed at query time by filtering with 6h window (`functions/src/suggestions/getCycle.ts:152-169`)

### 4.3 Match Domain
**Representation:** Firestore document `matches/{matchId}`.
**Field:** `status` (explicit string).

| State Name | Code Representation | Invariants / Notes | Code Reference |
| :--- | :--- | :--- | :--- |
| **Pending** | `status: 'pending'` | Initial state upon creation. | `functions/src/offers/respond.ts:199`; `functions/src/offers/create.ts:191` |
| **Location Deciding** | `status: 'location_deciding'` | `placeCandidates` populated. `locationDecision.expiresAt` set. | `functions/src/matches/fetchPlaces.ts:157` |
| **Place Confirmed** | `status: 'place_confirmed'` | `confirmedPlaceId` is set. | `functions/src/matches/resolvePlace.ts:151` |
| **Heading There** | `status: 'heading_there'` | Aggregated from `statusByUser`. | `functions/src/meetup/recommend.ts:220` |
| **Arrived** | `status: 'arrived'` | Aggregated from `statusByUser` (both arrived). | `functions/src/meetup/recommend.ts:214` |
| **Completed** | `status: 'completed'` | Aggregated from `statusByUser` (both completed). | `functions/src/meetup/recommend.ts:213` |
| **Cancelled** | `status: 'cancelled'` | `cancelledBy` and `cancellationReason` set. | `functions/src/matches/cancel.ts:104-109` |

**Status Aggregation Logic** (`functions/src/meetup/recommend.ts:204-221`):
```
if (user1Status === 'completed' && user2Status === 'completed') → 'completed'
else if (user1Status === 'arrived' && user2Status === 'arrived') → 'arrived'
else if ((u1 === 'heading_there' || u1 === 'arrived') && (u2 === 'heading_there' || u2 === 'arrived')) → 'heading_there'
```

**Reliability Stats on Cancel** (`functions/src/matches/cancel.ts:112-139`):
- Penalty multiplier: 0.3 default, 0 for system/safety/15s grace, 0.5 for severe (other user heading/arrived)
- Updates `reliabilityStats` and `reliabilityScore` on user document

### 4.4 Place Decision Domain
**Representation:** Fields within `matches/{matchId}`.
**State:** Inferred from `status` and fields.

| State Name | Code Representation | Notes | Code Reference |
| :--- | :--- | :--- | :--- |
| **Fetching** | `status: 'pending'` | Conceptual/UI state only; no DB field. Exists between match creation and `matchFetchAllPlaces` call. | N/A |
| **Active** | `status: 'location_deciding'` | Timer: 120 seconds from `matchedAt`. | `functions/src/matches/fetchPlaces.ts:115-116, 157` |
| **Resolved** | `status: 'place_confirmed'` | `confirmedPlaceId` set. | `functions/src/matches/resolvePlace.ts:144-151` |
| **Failed** | `status: 'cancelled'` | `cancellationReason: 'no_places_available'`. | `functions/src/matches/fetchPlaces.ts:119-135` |

**Place Candidate Ranking** (`functions/src/utils/places.ts:81-84, 153-154`):
- Candidates are sorted by distance ascending (line 154)
- Rank is assigned 1-indexed after sorting (line 84): closest = Rank 1
- Ranking **affects state resolution outcome** (see algorithm below)

**Place Resolution Algorithm** (`functions/src/matches/resolvePlace.ts:179-231`):
1. Both chose same place → that place wins (line 203-205) — reason: `'both_same'`
2. Only one user chose → their choice wins (lines 192-200) — reason: `'one_chose'`
3. Neither chose → **Rank #1** (closest place) is auto-selected (lines 187-188) — reason: `'none_chose'`
4. Both chose different → **lower rank wins** (closer place); on rank tie, lexicographically smaller `placeId` (lines 222-230) — reason: `'rank_tiebreak'`

**Dead Code:** `ResolutionReason` type (`resolvePlace.ts:24`) includes `'tick_sync'` but **no code path ever produces this value**. It is defined in the union type but never assigned during resolution.

## 5. State Transition Tables

### 5.1 Presence Transitions
| From State | Trigger / Event | Guards | Side Effects | To State | Code Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Offline** | `presenceStart` | User auth, Valid location | Create `sessionHistory`, set `expiresAt` = duration + 5min grace | **Available** | `functions/src/presence/start.ts:83-101` |
| **Available** | `matchCreate` (via Offer) | Mutual invite or Accept | Clears outgoing pending offers | **Matched** | `functions/src/offers/create.ts:216-231`; `functions/src/offers/respond.ts:224-235` |
| **Available** | `presenceEnd` | Auth | `cleanupPendingOffers` invoked, doc deleted | **Offline** | `functions/src/presence/end.ts:25-32` |
| **Available** | `suggestionGetCycle` | `expiresAt` < `now` | Deletes presence doc (Lazy Self-Cleanup) | **Offline** | `functions/src/suggestions/getCycle.ts:342-344` |
| **Matched** | `matchCancel` | Match active, **Not Expired** | - | **Available** | `functions/src/matches/cancel.ts:165-169` |
| **Matched** | `matchCancel` | Match active, **Expired** | No DB write; doc becomes zombie | **Offline** (no explicit transition) | `functions/src/matches/cancel.ts:161-162` |
| **Matched** | `presenceEnd` | Auth | `cleanupPendingOffers` invoked | **Offline** | `functions/src/presence/end.ts:25-32` |

### 5.2 Offer Transitions
| From State | Trigger / Event | Guards | Side Effects | To State | Code Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **(New)** | `offerCreate` | Valid targets, not blocked, max 3 active, 5s cooldown | Check blocking, Check max offers, Increment target's `exposureScore` | **Pending** | `functions/src/offers/create.ts:28-118, 270-302` |
| **(New)** | `offerCreate` (Mutual) | Reverse offer pending | Updates reverse offer, creates match | **Accepted** | `functions/src/offers/create.ts:169-246` |
| **Pending** | `offerRespond` (Accept) | Both users available | Creates Match | **Accepted** | `functions/src/offers/respond.ts:188-242` |
| **Pending** | `offerRespond` (Decline) | Offer pending | Creates 6h cooldown via `suggestions` collection | **Declined** | `functions/src/offers/respond.ts:59-98` |
| **Pending** | `offerRespond` (Late) | Expired or matched elsewhere | - | **Expired** | `functions/src/offers/respond.ts:49-55, 150-160` |
| **Pending** | `cleanupPendingOffers` | Match created elsewhere | Reason: `matched_elsewhere` | **Cancelled** | `functions/src/offers/cleanup.ts:17-50` |
| **Pending** | `offerCancel` | Auth (sender only) | - | **Cancelled** | `functions/src/offers/cancel.ts` |

### 5.3 Match Transitions
| From State | Trigger / Event | Guards | Side Effects | To State | Code Reference |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **(New)** | `matchCreate` (via Offer) | - | Clears other offers | **Pending** | `functions/src/offers/respond.ts:194-215` |
| **Pending** | `matchFetchAllPlaces` | candidates > 0 | Sets `locationDecision` (120s timer) | **Location Deciding** | `functions/src/matches/fetchPlaces.ts:147-160` |
| **Pending** | `matchFetchAllPlaces` | candidates == 0 | - | **Cancelled** | `functions/src/matches/fetchPlaces.ts:118-145` |
| **Pending** | `matchConfirmPlace` (Legacy) | Match in `pending` or `place_confirmed` | Sets place directly | **Place Confirmed** | `functions/src/matches/confirmPlace.ts:44` |
| **Location Deciding** | `matchResolvePlaceIfNeeded` | Timer valid | Resolves choice | **Place Confirmed** | `functions/src/matches/resolvePlace.ts:143-156` |
| **Location Deciding** | `matchResolveExpired` | Timer expired | Auto-resolves via scheduled job | **Place Confirmed** | `functions/src/matches/resolveExpired.ts` → `resolvePlace.ts:237-298` |
| **Place Confirmed** | `updateMatchStatus` | Both 'heading_there' or higher | - | **Heading There** | `functions/src/meetup/recommend.ts:216-220` |
| **Heading There** | `updateMatchStatus` | Both 'arrived' | - | **Arrived** | `functions/src/meetup/recommend.ts:214-215` |
| **Arrived** | `updateMatchStatus` | Both 'completed' | - | **Completed** | `functions/src/meetup/recommend.ts:212-213` |
| **(Any Active)** | `matchCancel` | Not `completed` or `cancelled` | Restores presence, calculates reliability penalty | **Cancelled** | `functions/src/matches/cancel.ts:49-55, 104-140` |
| **(Any Active)** | Block Participant | - | Calls `matchCancel` | **Cancelled** | **[UNCONFIRMED]** - blocking code not located |

**Any Active** = `pending`, `location_deciding`, `place_confirmed`, `heading_there`, `arrived` (all non-terminal states).

## 6. Cross-Domain Interactions

1.  **Offer → Match → Presence** (`functions/src/offers/respond.ts:188-242`):
    - When `offerRespond` (Accept) succeeds:
        - New `Match` created (`status: 'pending'`) - line 196-215
        - `Offer` updated to `accepted` - lines 217-222
        - Both Users' `Presence` updated to `status: 'matched'` - lines 224-235
        - `cleanupPendingOffers` is triggered for both users (reason: `matched_elsewhere`) - lines 239-242

2.  **Match → Presence** (`functions/src/matches/cancel.ts:150-171`):
    - When `matchCancel` executes:
        - If `Presence` is still valid (not expired), it is reset to `status: 'available'` (lines 165-169)
        - If expired, no update occurs (lines 161-162) - doc becomes zombie
        - Reliability penalty is calculated (lines 112-139)

3.  **Presence → Offer** (`functions/src/presence/end.ts:21-30`):
    - When `presenceEnd` executes:
        - `cleanupPendingOffers` is called (line 26), cancelling all outgoing and incoming pending offers
        - Presence document is deleted (line 32)

## 7. Illegal or Prevented States

| Prevention | Description | Code Reference |
| :--- | :--- | :--- |
| **Double Matching** | Transaction checks `matches` for active statuses before creating new match | `functions/src/offers/respond.ts:136-177` |
| **Self-Matching** | Validation: `targetUid !== fromUid` | `functions/src/offers/create.ts:28` |
| **Blocked Matching** | Symmetric check of `blocks` collection | `functions/src/offers/create.ts:32-54` |

**Note:** Pre-Phase 1, there were inconsistencies in the active match status lists used for double-match prevention. Phase 1 resolved this by introducing the canonical `ACTIVE_MATCH_STATUSES` constant (see Section 12 below).

## 8. Suggestion Systems

Two parallel suggestion implementations exist:

| System | File | Approach | Notes |
| :--- | :--- | :--- | :--- |
| `suggestionGetCycle` | `functions/src/suggestions/getCycle.ts` | Stateless fresh-fetch with cycle rotation | Current primary implementation |
| `suggestionGetTop1` | `functions/src/suggestions/getTop1.ts` | Weighted scoring with 3-day cooldown | Alternative/legacy implementation |

Both filter out (`getCycle.ts:229-234`):
- Self (`doc.id === uid`)
- Expired presences
- Blocked users (symmetric check at lines 237-244)
- Users within 6h reject cooldown (lines 152-169)
- Users in active matches (lines 172-185)
- Users with pending outgoing offers (lines 188-196)

**Note:** Pre-Phase 1, `getCycle.ts` referenced a phantom status `'in_meetup'`. Phase 1 resolved this by using the canonical `ACTIVE_MATCH_STATUSES` constant.

## 9. System Limitations & Resolved Issues

### 9.1 Resolved in Phase 2

1.  **Stale Pending Matches (✅ RESOLVED IN PHASE 2.1-A)**

    **Pre-Phase 2 Issue:** Matches could remain in `pending` status indefinitely if clients never called `matchFetchAllPlaces`, trapping users in `presence.status='matched'`.

    **Resolution:** Scheduled function `matchCleanupStalePending` (runs every 5 minutes) auto-cancels matches stuck in `pending` for >15 minutes, restoring user presence to `available`. Uses shared `cancelMatchInternal` logic with reason `'timeout_pending'` and zero reliability penalty.

    **Code:** `functions/src/matches/cleanupStalePending.ts`

2.  **Expired Pending Offers (✅ RESOLVED IN PHASE 2.1-B)**

    **Pre-Phase 2 Issue:** Offers remained `pending` in DB after `expiresAt` passed, blocking sender's outgoing offer slots.

    **Resolution:** Scheduled function `offerExpireStale` (runs every 5 minutes) marks expired pending offers as `expired` and frees sender's `activeOutgoingOfferIds` slots.

    **Code:** `functions/src/offers/expireStale.ts`

### 9.2 Current System Limitations

1.  **Legacy Place Confirmation** (`functions/src/matches/confirmPlace.ts:44`):
    `matchConfirmPlace` exists and allows transition from `pending` or `place_confirmed` directly. The UI might still use this path, bypassing the dual-choice voting logic.

2.  **Presence Cleanup on Match Cancel** (`functions/src/matches/cancel.ts:161-170`):
    `matchCancel` attempts to restore presence to `available`. However, if `expiresAt < now`, the code silently skips the update (line 161-162). The user effectively becomes **Offline** without explicit deletion (zombie doc).

3.  **Zombie Presences**: No scheduled job deletes expired presence docs. They persist until:
    - The *owner* calls `suggestionGetCycle` (triggers lazy cleanup at line 343)
    - The *owner* calls `presenceEnd`
    - Other users filter them out in-memory, but docs remain in Firestore

### 9.3 Historical Issues (Resolved in Phase 1)

**Note:** The issues below were fixed in Phase 1 (Semantic Convergence) by introducing the canonical `ACTIVE_MATCH_STATUSES` constant and replacing all hardcoded status arrays with imports from `functions/src/constants/state.ts`.

1.  **Missing `location_deciding` in Double-Match Check (✅ RESOLVED)**

    **Pre-Phase 1 Issue:** `offers/create.ts` and `offers/respond.ts` used incomplete status arrays missing `location_deciding`, allowing users in that state to theoretically accept another offer.

    **Resolution:** Phase 1 replaced hardcoded arrays with `ACTIVE_MATCH_STATUSES` constant, which includes all five non-terminal match statuses: `['pending', 'location_deciding', 'place_confirmed', 'heading_there', 'arrived']`.

2.  **Phantom Status `in_meetup` (✅ RESOLVED)**

    **Pre-Phase 1 Issue:** `suggestions/getCycle.ts` checked for status `'in_meetup'` which was never written anywhere in the codebase.

    **Resolution:** Phase 1 replaced the hardcoded array containing `in_meetup` with the canonical `ACTIVE_MATCH_STATUSES` constant, which uses the correct statuses `heading_there` and `arrived`.

3.  **Inconsistent Active Match Status Lists (✅ RESOLVED)**

    **Pre-Phase 1 Issue:** Different functions used different hardcoded status arrays:
    - `offers/create.ts:135`: `['pending', 'place_confirmed', 'heading_there', 'arrived']` (missing `location_deciding`)
    - `offers/respond.ts:136`: `['pending', 'place_confirmed', 'heading_there', 'arrived']` (missing `location_deciding`)
    - `suggestions/getCycle.ts:175`: `['pending', 'location_deciding', 'place_confirmed', 'in_meetup']` (phantom `in_meetup`, missing `heading_there`/`arrived`)
    - `suggestions/getTop1.ts:249`: `['pending', 'heading_there', 'arrived']` (missing `location_deciding`, `place_confirmed`)

    **Resolution:** Phase 1 replaced all four hardcoded arrays with imports of the canonical `ACTIVE_MATCH_STATUSES` constant, ensuring consistency across the codebase.

    **Code:** `functions/src/constants/state.ts`

## 10. Eligibility Guards & Non-State Ranking Logic (AS-IS)

This section clarifies which ranking/scoring mechanisms affect state transitions vs. which are purely selection logic.

### 10.1 Place Candidate Ranking (STATE-AFFECTING)

Place ranking **directly affects the `location_deciding` → `place_confirmed` transition outcome**.

| Aspect | Code Reference | State Impact |
| :--- | :--- | :--- |
| Sorting | `functions/src/utils/places.ts:154` | Candidates sorted by distance ascending |
| Rank assignment | `functions/src/utils/places.ts:82-84` | Rank 1 = closest place |
| Default resolution | `functions/src/matches/resolvePlace.ts:187-188` | Neither chose → Rank #1 wins |
| Tie-break resolution | `functions/src/matches/resolvePlace.ts:222-230` | Both chose different → lower rank wins |

**Conclusion:** Place ranking is part of the state machine because it determines which `confirmedPlaceId` is written during resolution.

### 10.2 Discovery Candidate Ranking (NON-STATE)

Discovery candidate ordering is **non-state selection logic**. It determines which user appears first in suggestions but does **not** gate any state transition. A user can send an offer to any valid candidate regardless of their score.

See: PRD_AsIs_v1.0.md#33-discovery-cycle-based-suggestions for the detailed scoring algorithm and weights.

### 10.3 Reliability Score (NON-STATE)

The `reliabilityScore` field is **updated** during state transitions (cancel penalty side-effect) but does **not gate** any transition. No code checks `reliabilityScore < X` to block actions.

See: PRD_AsIs_v1.0.md#10-credibility--reliability-score-as-is for product-level details. See: DataModel_AsIs.md#2-collection-users for the formula.

### 10.4 Exposure / Fairness Score (NON-STATE)

The `exposureScore` field tracks how many offers a user has received. It affects discovery ordering only and does **not** alter state transitions. No code checks `exposureScore` to block actions.

**Side Effect:** `offerCreate` increments target's `exposureScore` by 1 (`functions/src/offers/create.ts:297-298`). Score resets implicitly when presence is deleted and recreated.

See: PRD_AsIs_v1.0.md#33-discovery-cycle-based-suggestions for detailed fairness score calculation.