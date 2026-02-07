# PRD (AS-IS) — NYU Buddy v1.0

> **Document Type:** AS-IS Product Requirements Document
> **Version:** 1.0
> **Date:** 2026-02-04
> **Source of Truth:** Codebase
> **Purpose:** Document what EXISTS today, not what's planned

---

## 0. Document Meta

**Critical Notes:**
- This document is based ONLY on actual code implementation
- Code contradicts PRD specs in many areas - CODE is authoritative
- Features marked "NOT IMPLEMENTED" exist in PRDs but not in code

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Authentication & Onboarding](#2-authentication--onboarding)
3. [Home Page & Discovery](#3-home-page--discovery)
4. [Matching Flow](#4-matching-flow)
5. [Place Resolution](#5-place-resolution)
6. [Match Coordination Page](#6-match-coordination-page)
7. [Feedback](#7-feedback)
8. [Admin Portal](#8-admin-portal)
9. [What's NOT Implemented (vs PRDs)](#9-whats-not-implemented-vs-prds)
10. [Credibility / Reliability Score](#10-credibility--reliability-score-as-is)
11. [Known Limitations & Edge Cases](#11-known-limitations--edge-cases)
12. [Summary of Core Flows](#12-summary-of-core-flows)
13. [Acceptance Criteria (AS-IS)](#13-acceptance-criteria-as-is)

---

## 1. Product Overview

**One-sentence description:**
NYU Buddy is a real-time campus proximity matching app that connects NYU students for spontaneous meetups (coffee, study, dining) based on location and activity interests.

**Target users:**
NYU students with @nyu.edu email addresses (or admin-whitelisted emails).

**Core value proposition:**
A real-time campus activity matching platform that reduces the friction of spontaneous meetups by using live presence, conflict-safe invitations, and automated place resolution to turn intent into offline interaction within minutes.

---

## 2. Authentication & Onboarding

### 2.1 Email Restrictions

**Allowed emails:** `@nyu.edu` domains OR admin whitelist

**Admin whitelist:** `edoardo.mongardi18@gmail.com`, `468327494@qq.com` (frontend). Note: security rules whitelist differs — see Architecture_AsIs.md#93-hardcoded-admin-whitelist for details.

### 2.2 Login Flow

**Route:** `/login`

**Flow:**
1. Email/password input
2. Firebase Authentication
3. Email verification check - blocks app features until verified
4. Profile completion check → redirects to onboarding if incomplete

### 2.3 Onboarding Flow

**Route:** `/onboarding`

**Steps:**
1. **Display Name:** 2-50 characters
2. **Profile Picture:** Optional photo upload to Firebase Storage (`/profile-pictures/{uid}`)
3. **Interests:** Select 1-10 from predefined list
4. **Activities:** Select 1-5 from: Coffee, Lunch, Study, Walk, Explore Campus

**Validation:**
- Schema validation via Zod
- Firestore document at `users/{uid}` created with:
  - `displayName`, `interests`, `preferredActivities`
  - `profileCompleted: true`
  - `photoURL` (if uploaded)
  - `createdAt`, `updatedAt`

**Available Interests:** Computer Science, Data Science, Business, Arts, Music, Sports, Gaming, Reading, Movies, Travel, Photography, Cooking, Fitness, Technology, Entrepreneurship, Design, Writing, Languages, Volunteering, Finance

---

## 3. Home Page & Discovery

### 3.1 Homepage Layout

**Route:** `/` (protected)

**Tab Structure:**
- **Discover** tab: Single-card suggestions with Pass/Invite actions
- **Invites** tab: Incoming offers list with Accept/Decline

**Top Section:** Active outgoing invites (collapsible cards, max 3)

**Bottom Sheet:** Availability controls (set/stop availability)

### 3.2 Setting Availability

**Backend Function:** `presenceStart`

**User Input:**
- Activity type (Coffee, Lunch, Study, Walk, Explore Campus)
- Duration (15-240 minutes, validated)
- Location (lat/lng from browser or manual selection)

**Validation:**
- Duration: Min 15 minutes, Max 240 minutes (4 hours)
- NYC Geofencing: lat 40.4-41.0, lng -74.3 to -73.7
- Rate Limit: Max 100 sessions per hour per user

**Firestore Effect:** Creates document at `presence/{uid}`.

See: DataModel_AsIs.md#3-collection-presence

**Session Tracking:**
Also creates: `sessionHistory/{uid}/sessions/{sessionId}` for rate limiting. Preventing users from creating too many sessions in a short period.

**Effect:** User becomes discoverable and can browse suggestions.

### 3.3 Discovery (Cycle-Based Suggestions)

**Backend Function:** `suggestionGetCycle`

**Algorithm:**
1. Query all available users within 5km radius (via geohash). List refreshed every pass that user makes(Adding new candidates or removing unavailable ones).
2. Filter out:
   - Self
   - Users with active incoming offers from current user
   - Users in active matches
   - Users with mutual 6-hour rejection cooldown
   - Blocked users (symmetric)
   - Users already seen in current session (`seenUids`)
3. Return ONE candidate
4. When all candidates exhausted, reset `seenUids` and start over

**Pass Action:** `suggestionPass`
- Adds candidate to `seenUids`
- Returns next suggestion

**Match Criteria:**
- Activity type must match
- Duration mismatch tolerance: ±60 minutes
- Proximity: within 5km

#### Candidate Ordering / Ranking (AS-IS)

Currently, the system uses **weighted scoring** to determine which candidate appears first. This is selection logic only—it does not gate any state transitions (users can invite any valid candidate regardless of score).

**Scoring Formula** (`functions/src/suggestions/getCycle.ts:274-280`):
```
totalScore =
    0.40 × distanceScore +
    0.20 × durationScore +
    0.15 × interestScore +
    0.10 × reliabilityScore +
    0.10 × fairnessScore +
    0.05 × urgencyScore
```

**Score Components:**
| Factor | Weight | Calculation | Code Reference |
|--------|--------|-------------|----------------|
| Distance | 40% | Bucketed: ≤200m=1.0, ≤500m=0.8, ≤800m=0.5, ≤1km=0.2, else decay | `getCycle.ts:52-57` |
| Duration | 20% | Exact match=1.0, ±30min=0.7, ±60min=0.3, else 0 | `getCycle.ts:72-80` |
| Interests | 15% | Shared interests / 3, capped at 1.0 | `getCycle.ts:61-68` |
| Reliability | 10% | `0.5 + 0.5×meetRate - 0.3×cancelRate` | `getCycle.ts:84-89` |
| Fairness | 10% | `max(0.2, 1 - exposureScore×0.1)` — deprioritizes over-shown users | `getCycle.ts:93-94` |
| Urgency | 5% | Based on time until expiry (≤15min=1.0, ≤30min=0.8, ≤60min=0.5) | `getCycle.ts:98-108` |

**Penalty:** Users whose offers recently expired receive a −0.5 score penalty (`getCycle.ts:283-284`).

**Sorting:** Candidates are sorted by `totalScore` descending (`getCycle.ts:305`). The top candidate is returned.

**Cycle Exhaustion:** When all candidates have been seen (`seenUids`), the system resets the seen list and restarts the cycle (`getCycle.ts:364-369`). The last-viewed user is moved to the end to prevent immediate repeat (`getCycle.ts:386-397`).

#### Exposure / Fairness Score (AS-IS)

Currently, the system tracks an **exposureScore** per user to implement fairness in discovery. Users who receive many offers are deprioritized so less-exposed users have a better chance of being discovered.

**Exposure Score Lifecycle:**

| Event | Effect | Code Reference |
|-------|--------|----------------|
| Presence created | Initialized to `0` | `functions/src/presence/start.ts:96` |
| Another user sends offer TO this user | Incremented by `+1` | `functions/src/offers/create.ts:297-298` |
| Presence deleted and recreated | Reset to `0` (implicit) | New document created with initial value |

**Fairness Score Calculation** (`functions/src/suggestions/getCycle.ts:93-94`):
```
fairnessScore = max(0.2, 1 - exposureScore × 0.1)
```

| exposureScore | fairnessScore | Effect on Ranking |
|---------------|---------------|-------------------|
| 0 | 1.0 | Highest priority (never received offers this session) |
| 5 | 0.5 | Medium priority |
| 8+ | 0.2 | Minimum priority (capped) |

**Product-Level Effect:**
- Fairness score contributes **10% weight** to the discovery ranking formula
- Users who have received fewer offers appear higher in other users' suggestion lists
- Users who have received many offers are shown later in the cycle

**What Exposure Score Does NOT Affect:**
- **Eligibility:** Does not gate `presenceStart`, `offerCreate`, or any other action
- **Offer Limits:** Max 3 concurrent offers applies regardless of exposureScore
- **Match Creation:** No minimum/maximum exposureScore required
- **Persistence:** Does not persist across presence sessions (reset on new session)

### 3.4 Invitation System (Offers)

**Backend Function:** `offerCreate`

**Limits:**
- Max 3 concurrent **outgoing** offers per user

**Offer Document:** `offers/{offerId}`

See: DataModel_AsIs.md#4-collection-offers

**Expiry:** 10 minutes, auto-expires

**Mutual Invite Detection:**
If B sends invite to A while A has pending invite to B:
- Immediate match creation
- Both offers marked `accepted`
- Both presences updated to `status: 'matched'`, `matchId` set
- Redirect to match flow

### 3.5 Responding to Offers

**Backend Function:** `offerRespond`

**Actions:**
- **Accept:** Creates match if sender still available, cancels all other offers
- **Decline:** Triggers 6-hour mutual rejection cooldown, both users filtered from each other's cycles

**Cooldown Implementation:**
Symmetric 6-hour cooldown — both users cannot see each other in suggestions for 6 hours. See: StateMachine_AsIs.md#42-offer-domain for the formal mechanism.

**Availability Check:**
System verifies sender is still `available` (not `matched`, not offline) before creating match.

### 3.6 Cancelling Offers

**Backend Function:** `offerCancel`

**Effect:**
- Sets offer status to `cancelled`
- Does NOT trigger rejection cooldown
- Frees up slot for new outgoing offer

---

## 4. Matching Flow

### 4.1 Match Creation Triggers

**Scenarios:**
1. **Mutual invite:** A invites B, B invites A simultaneously
2. **Acceptance:** User accepts a pending offer

**Backend Functions:**
- `offerCreate` (mutual invite path)
- `offerRespond` (acceptance path)

**Match Document:** `matches/{matchId}`

See: DataModel_AsIs.md#5-collection-matches

**Initial State:** `status: 'pending'`

### 4.2 Post-Match Offer Cleanup

**Implementation:** `cleanupPendingOffers` utility

**Behavior:**
When match created, system cancels:
- All other outgoing offers from both users
- All incoming offers to both users(not viewed as rejection)
- Reason: `matched_elsewhere`

**Purpose:** Prevent duplicate matches, keep UI clean

### 4.3 Match Overlay

**UI Component:** `MatchOverlay`

**Flow:**
1. Display "It's a Match!" animation
2. Show both users' photos
3. Auto-redirect to `/match/{matchId}` after 3 seconds

---

## 5. Place Resolution

### 5.1 Place Fetching

**Primary System:** `matchFetchAllPlaces` → `getPlaceCandidates` (utils/places.ts)

**Actual Implementation:**
- Returns **up to 9 places** (minimum 6 before radius expansion)
- **Radius fallback:** 2km → 3km → 5km (stops when ≥6 candidates found)
- See: StateMachine_AsIs.md#3-constants--configuration for exact constants.
- Center point: Midpoint between both users' locations, OR single user location, OR NYU Washington Square default (40.7295, -73.9965)

**Algorithm:**
1. Try 2km radius
2. If < 6 candidates, expand to 3km
3. If still < 6, expand to 5km
4. Return up to 9, ranked by distance (1-indexed)

#### Place Candidate Ranking

Places are ranked by distance ascending (closest first). This ranking affects resolution outcomes. See: StateMachine_AsIs.md#101-place-candidate-ranking-state-affecting for formal ranking logic and resolution tiebreakers.

**User-Visible Impact:**
- Users see places ordered closest-first in the swipeable list
- Rank #1 (closest) is the default if neither user selects a place
- When both users choose different places, the lower rank wins (closer place)

**Legacy System Note:** `meetupRecommend` (still exists) returns only 3 places with a fixed 2km radius, but uses the same distance-ascending order.

**Place Query:**
- Filters by `active: true`
- Uses geohash proximity
- Filters by `allowedActivities` matching the match's activity type
- Location staleness check: 5-minute threshold

**Returns (PlaceCandidate):**

See: API_Contract_AsIs.md#41-placecandidate

**Zero Candidates:** If no places found, match auto-cancelled with reason `no_places_available`.

### 5.2 Place Selection

 **UI REALITY:**
 - **Swipeable List:** Horizontal scroll view showing all available place candidates (up to 9).
 - **Countdown:** 120-second timer displayed in header.
 - **Selection:** Tapping a card selects it.
 - **"Find Others":** NOT IMPLEMENTED in UI (backend logic exists but unused).

 **Backend Functions Used:**
 - `matchFetchAllPlaces`: Fetches candidates for the list
 - `matchSetPlaceChoice`: Records selection
 - `matchResolvePlaceIfNeeded`: Manual resolution
 - `matchResolveExpired`: Auto-resolution on timeout

**Countdown:** 120 seconds from `matchedAt`. See: StateMachine_AsIs.md#3-constants--configuration

**Telemetry Tracked:**
- `findOthersClicksByUser[uid]`: Increment per "Find Others" click
- `choiceChangedCountByUser[uid]`: Increment when user changes selection
- `tickUsedByUser[uid]`: Boolean, set if user clicked "Go with their choice"

**Legacy Fallback:** `matchConfirmPlace` (first-confirm-wins, may still be used in some flows)

### 5.3 Place Resolution Tiebreaker

**Functions:** `matchResolvePlaceIfNeeded` / `matchResolveExpired`

See: StateMachine_AsIs.md#44-place-decision-domain for the formal resolution algorithm.

**User-Facing Summary:** If both users agree, that place wins. If only one chose, their choice wins. If neither chose, the closest place is auto-selected. If both chose different, the system deterministically picks the closer one.

---

## 6. Match Coordination Page

### 6.1 Match Page

**Route:** `/match/[matchId]`

**Page States:**
1. **Location Selection:** If `!confirmedPlaceName` (not fully implemented in UI)
2. **Meetup Coordination:** If place confirmed

### 6.2 Meetup Coordination UI

**Sections:**
1. **Header:** Match info, settings menu (Report, Block, Cancel)
2. **Place Card:** Confirmed location with "Open in Maps" link
3. **Status Progression:** Visual timeline (Matched → On the way → Arrived → Complete)
4. **Message Section:** (Placeholder, chat not implemented)
5. **Status Buttons:** User updates their status

### 6.3 Status Updates

**Backend Function:** `updateMatchStatus`

See: StateMachine_AsIs.md#53-match-transitions for formal transition rules and status aggregation logic.

**User-Visible Progression:** Matched → On the way → Arrived → Complete (forward-only, no backward transitions).

### 6.4 Report & Block

**Report:**
- User submits a reason for the report
- No automated action, admin review only **[NOT VERIFIED IN CODE — no admin report UI found in codebase]**
- See: DataModel_AsIs.md#8-collection-reports for document schema.

**Block:**
1. Create document at `blocks/{blockerUid}/blocked/{blockedUid}` (subcollection structure)
2. Call `matchCancel` with `reason: 'blocked'`
3. Redirect to home

**Block Effect:**
- Symmetric filtering in discovery (both users blocked from seeing each other)
- **Effect:** Match is cancelled immediately when blocking in the UI (triggered by client).
  - *Note:* Backend does not automatically scan/cancel matches if a block record is created outside the app flow.

### 6.5 Cancellation

**Backend Function:** `matchCancel`

**Triggers:**
- User clicks "Cancel Meetup" in menu
- User blocks other user during match
- Auto-cancel on presence expiry (if user goes offline)

**Cancel Modal:**
**Cancel Modal Options:**
- Time conflict / Something came up
- My buddy is not responding
- Changed my mind
- Safety concerns
- Other (custom text)

**Effect:**
- Match cancelled with reason recorded
- Redirect to `/?cancelled=true&reason=...`
- See: DataModel_AsIs.md#5-collection-matches for field details. Note: frontend/backend field name mismatch exists (DataModel_AsIs.md#153-frontendbackend-field-name-mismatch).

**Reliability Score:** Updated on cancel (see Section 10 for details)

---

## 7. Feedback

### 7.1 Feedback Page

**Route:** `/feedback/[matchId]`

**Questions:**
1. **Did you meet up?** Yes/No (required)
2. **How was the experience?** 1-5 stars (if yes)
3. **Would you meet them again?** Yes/No (if yes)
4. **Comments:** Optional text

**Firestore Document:** `feedback/{matchId}_{uid}`

See: DataModel_AsIs.md#7-collection-feedback

**Behavior:**
- Client-side write (no backend function)
- Skip button available
- Redirect to home after submission or skip

---

## 8. Admin Portal

### 8.1 Admin Access

**Route:** `/admin/*`

**Access Control:**
- Email whitelist check (same as login)
- Layout enforces redirect if not admin

### 8.2 Admin Spots Page

**Route:** `/admin/spots`

**Purpose:** CRUD operations for meetup places

**Place Document:** `places/{placeId}`

See: DataModel_AsIs.md#6-collection-places

**Features:**
- Add new place (manual lat/lng input)
- Edit existing place
- Delete place
- Toggle active/inactive
- Default activity suggestions based on category
- Real-time list via Firestore listener

---

> **Backend Functions Inventory:** See API_Contract_AsIs.md#1-api-surface-summary
> **Frontend Hooks Inventory:** See Architecture_AsIs.md#32-state-management-layer
> **Data Retention & Cleanup Policies:** See DataModel_AsIs.md#14-retention--cleanup-policies
> **Technical Stack:** See Architecture_AsIs.md#8-technical-stack

---

## 9. What's NOT Implemented (vs PRDs)

### 9.1 Chat/Messaging System
**Status:** NOT IMPLEMENTED

**PRDs Specify:**
- Ephemeral chat during meetup
- 100-word/500-char limit per message
- 400 total message cap
- Status announcements
- 24-hour deletion
- Analytics transformation

**Code Reality:**
- No chat UI components
- No backend functions for chat
- No messages subcollection
- Match page has placeholder message section

### 9.2 Dual-Choice Place Selection
**Status:** PARTIALLY IMPLEMENTED

**PRDs Specify:**
- Both users select simultaneously
- Real-time "Other user panel"
- "Go with their choice" button
- Countdown timer
- Resolution on timer expiry

**Code Reality:**
- Backend functions exist (`matchFetchAllPlaces`, `matchSetPlaceChoice`, `matchResolvePlace`)
- Frontend hook `useLocationDecision` has logic
- **Match page UI does NOT render location decision flow and "find others" button**
- Instead it shows a swipeable list up to 9 places from top 9 filtered places.

### 9.3 9-Place System with "Find Others"
**Status:** IMPLEMENTED (Backend)

**PRDs Specify:**
- Up to 9 place candidates
- Radius fallback (2km → 3km → 5km)
- "Find Others" rolling windows

**Code Reality:**
- **IMPLEMENTED:** `matchFetchAllPlaces` → `getPlaceCandidates` returns up to 9 places with 2km→3km→5km fallback
- `useLocationDecision` hook has complete window generation logic
- Match page UI does not fully renders this system.

### 9.4 Analytics & Cleanup
**Status:** NOT IMPLEMENTED

**PRDs Specify:**
- Chat analytics transformation
- Stale meetup auto-cancel (24h)
- Incomplete grace finalizer (12h)
- Raw message deletion

**Code Reality:**
- No analytics-related scheduled jobs or cleanup
- No analytics collection
- Matches persist indefinitely
- **Note:** `matchResolveExpired` (runs every 1 minute) is a scheduled job for place decision timeout resolution, NOT data cleanup. See: API_Contract_AsIs.md#315-matchresolveexpired

### 9.5 Security Rules Enforcement
**Status:** PARTIALLY INSECURE / VULNERABLE — See: Architecture_AsIs.md#95-security-rules-enforcement-gap for details.

---

## 10. Credibility / Reliability Score (AS-IS)

Currently, the system tracks and updates a **reliability score** per user, but its impact on user experience is limited.

### 10.1 What Updates the Score

When a user cancels a match, their reliability stats are updated. Penalty severity depends on cancellation context (system/safety reasons → no penalty; grace period → no penalty; severe cancel → higher penalty).

See: StateMachine_AsIs.md#43-match-domain for the formal penalty multiplier table. See: DataModel_AsIs.md#2-collection-users for stored fields and score formula.

### 10.2 How It Affects User Experience Today

**Discovery Ranking:** The reliability score contributes **10% weight** to candidate ordering (`functions/src/suggestions/getCycle.ts:26, 278`). Users with higher scores appear slightly higher in suggestions.

**What It Does NOT Affect:**
- **Eligibility:** No code gates `presenceStart`, `offerCreate`, or any action based on reliability score
- **Invite limits:** Max 3 concurrent offers applies regardless of score
- **Match creation:** No minimum score required to accept/send offers

**Conclusion:** Currently stored and updated, but only used as a minor ranking factor (10% weight). Does not gate any user actions or eligibility.

### 10.3 Fields Read But Not Populated

See: DataModel_AsIs.md#151-phantom-fields-read-but-never-written for details on `meetRate` and `cancelRate` fields that are read by the scoring logic but never written.

---

## 11. Known Limitations & Edge Cases

### 11.1 Race Conditions

**Stale Offer Accept:**
- Mitigated by availability checks in `offerRespond`
- Cleanup logic cancels other offers post-match
- Potential edge case if both users accept each other's offers simultaneously

**Simultaneous Mutual Invites:**
- First-create-wins in `offerCreate`
- Second invite detects existing reverse offer

### 11.2 Block During Active Match

**Issue:** Blocking does NOT auto-cancel existing matches.

**Behavior:**
 - **Match Page Block:** Auto-cancels match (Frontend calls `matchCancel` with reason `blocked`).
 - **Standalone Block:** If implemented elsewhere (e.g. profile), requires manual cancel first or fails to stop match.

### 11.3 Presence Expiry

**Effect:** If user's presence expires mid-match:
- Presence deleted
- Pending offers cancelled
- Match remains active
- Other user sees stale match state

**Mitigation:** None currently implemented

### 11.4 Place Selection Inconsistency

**Issue:** Two systems exist:
1. Legacy: `meetupRecommend` → `matchConfirmPlace` (3 places, first-confirm-wins)
2. New: `matchFetchAllPlaces` → `matchSetPlaceChoice` → `matchResolvePlace` (dual-choice, countdown)

**Reality:** Match page does not render new system UI. Unclear which is active.

### 11.5 Activity List Mismatch (Places vs Users)

See: DataModel_AsIs.md#156-activity-list-mismatch for details. Users selecting "Explore Campus" will find 0 matching places; "Dinner" in places is unreachable from user activities.

### 11.6 Email Verification Blocking

 **Status:** NOT ENFORCED

 **Behavior:**
 - Code logic checks `emailVerified` flag but does NOT actively block unverified users from core actions (setting availability, etc).
 - No UI guidance prompts user to verify.
 - **Risk:** Unverified users can use the platform freely.

---

## 12. Summary of Core Flows

### 12.1 Happy Path (Acceptance)

1. User A sets availability
2. User A browses suggestions, sends invite to User B
3. User B receives invite, accepts within 10 minutes
4. Match created, "It's a Match!" overlay
5. Redirect to `/match/{matchId}`
6. System shows 9 nearby places (swipeable list)
7. Both users select preference (Dual Choice)
8. Both users update status: heading_there → arrived → completed
9. Redirect to feedback page
10. Provide feedback, return home

### 12.2 Mutual Invite Path

1. User A invites User B
2. User B (simultaneously) invites User A
3. System detects mutual invite in `offerCreate`
4. Immediate match creation
5. Flow continues as Happy Path from step 4

### 12.3 Decline Path

1. User receives invite
2. User declines
3. 6-hour rejection cooldown created (symmetric)
4. Both users filtered from each other's suggestions for 6 hours

### 12.4 Expiry Path

1. User sends invite
2. Recipient does not respond
3. 10 minutes pass
4. Offer status auto-updates to `expired`
5. Sender's outgoing slot freed for new invite

### 12.5 Cancel Path

1. Match in progress
2. User clicks "Cancel Meetup"
3. Select reason, confirm
4. Match status → `cancelled`
5. Redirect to home with "Meetup Cancelled" toast

---

## 13. Acceptance Criteria (AS-IS)

### Implemented & Working

- [x] @nyu.edu email restriction
- [x] Onboarding with profile picture upload
- [x] Set/stop availability
- [x] Proximity-based discovery (5km)
- [x] Cycle-based suggestions (stateless, fresh)
- [x] Send invites (max 3 concurrent)
- [x] Accept/decline invites
- [x] Mutual invite detection → auto-match
- [x] 10-minute offer expiry
- [x] 6-hour rejection cooldown (symmetric)
- [x] Offer cleanup on match creation
- [x] Match overlay animation
- [x] Place recommendation system (up to 9 places w/ 2km→3km→5km fallback)
- [x] Dual-choice backend (matchFetchAllPlaces, matchSetPlaceChoice, matchResolvePlace)
- [x] Location decision countdown (120s from matchedAt)
- [x] Status progression (pending → heading_there → arrived → completed)
- [x] Report user
- [x] Block user
- [x] Cancel match
- [x] Feedback collection
- [x] Admin spots CRUD
- [x] Duration validation (15-240 min)
- [x] NYC geofencing (lat 40.4-41.0, lng -74.3 to -73.7)
- [x] Session rate limiting (100/hour)

### NOT Implemented

- [ ] Ephemeral chat system
- [ ] Chat message limits (400 total, 100 words/message)
- [ ] Status announcements in chat
- [ ] Match analytics transformation
- [ ] Stale meetup auto-cancel (24h)
- [ ] Raw data cleanup (24h deletion)

### Partially Implemented

 - [~] Security rules (enforcement unknown)
 - [~] Email verification prompts/UI

---

**END OF DOCUMENT**