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

**Admin whitelist:**
- `edoardo.mongardi18@gmail.com`
- `468327494@qq.com`

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

**Firestore Effect:**
Creates document at `presence/{uid}`:
```typescript
{
  uid: string; // User ID
  sessionId: string; // UUID for this session
  lat: number; // Latitude
  lng: number; // Longitude
  geohash: string; // for proximity queries
  activity: string; // activity that user chose
  status: 'available' | 'matched'; // status of the user
  expiresAt: Timestamp; // when the session expires
  matchId?: string; // set when matched
  seenUids: string[]; // Potentiall matching candidate that users have seen (cycle tracking)
  lastViewedUid?: string; // last potential match that user have seen
  createdAt: Timestamp; // time of session creation
  updatedAt: Timestamp; // for staleness detection (5min threshold, not used yet)
}
```

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

### 3.4 Invitation System (Offers)

**Backend Function:** `offerCreate`

**Limits:**
- Max 3 concurrent **outgoing** offers per user

**Offer Document:** `offers/{offerId}`
```typescript
{
  id: string; // offer ID
  fromUid: string; // sender user ID
  targetUid: string; // receiver user ID
  activity: string; // activity that user chose
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled'; // status of the offer
  createdAt: Timestamp; // time of offer creation
  expiresAt: Timestamp; // 10 minutes from creation
  matchId?: string; // set if accepted => match created
  responseAt?: Timestamp; // time of response
}
```

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
Document at `rejections/{uid}` collection, with rejection records.
Symmetric: prevents re-discovery for 6 hours (REJECTION_COOLDOWN_MS = 6 * 60 * 60 * 1000)

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
```typescript
{
  id: string; // match ID
  user1Uid: string; // user 1 ID
  user2Uid: string; // user 2 ID
  activity: string; // e.g., "Coffee"
  status: 'pending' | 'location_deciding' | 'place_confirmed' | 
          'heading_there' | 'arrived' | 'completed' | 'cancelled'; // status of the match
  matchedAt: Timestamp; // time of match creation
  
  // Location decision
  placeCandidates?: PlaceCandidate[]; // up to 9
  placeChoiceByUser?: { [uid]: { placeId, placeRank, chosenAt } }; // place choice of both users
  locationDecision?: { expiresAt, resolvedAt, resolutionReason }; // location decision
  
  // Confirmed place
  confirmedPlaceId?: string; // confirmed place ID
  confirmedPlaceName?: string; // confirmed place name
  confirmedPlaceAddress?: string; // confirmed place address
  confirmedPlaceLat?: number; // confirmed place latitude
  confirmedPlaceLng?: number; // confirmed place longitude
  
  // Status tracking
  statusByUser?: { [uid]: 'pending' | 'heading_there' | 'arrived' | 'completed' };
  
  // Cancellation
  cancelledBy?: string; // user who cancelled the match
  cancelledAt?: Timestamp; // time of match cancellation
  cancelReason?: string; // reason for match cancellation
  
  createdAt: Timestamp; // time of match creation
  updatedAt: Timestamp; // time of match update(not used yet)
}
```

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
- Returns **up to 9 places** (HARD_CAP = 9, SOFT_MIN = 6)
- **Radius fallback:** 2km → 3km → 5km (stops when ≥6 candidates found)
- Center point: Midpoint between both users' locations, OR single user location, OR NYU Washington Square default (40.7295, -73.9965)

**Algorithm:**
1. Try 2km radius
2. If < 6 candidates, expand to 3km
3. If still < 6, expand to 5km
4. Return up to 9, ranked by distance (1-indexed)

**Place Query:**
- Filters by `active: true`
- Uses geohash proximity
- Filters by `allowedActivities` matching the match's activity type
- Location staleness check: 5-minute threshold

**Legacy System:** `meetupRecommend` (still exists)
- Returns 3 places, 2km fixed radius
- Used for backwards compatibility

**Returns (PlaceCandidate):**
```typescript
{
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distance: number; // meters
  rank: number; // 1-indexed
  tags?: string[];
  priceLevel?: number;
  photoUrl?: string | null;
}
```

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

**Countdown:** 120 seconds from `matchedAt` (LOCATION_DECISION_SECONDS = 120)

**Telemetry Tracked:**
- `findOthersClicksByUser[uid]`: Increment per "Find Others" click
- `choiceChangedCountByUser[uid]`: Increment when user changes selection
- `tickUsedByUser[uid]`: Boolean, set if user clicked "Go with their choice"

**Legacy Fallback:** `matchConfirmPlace` (first-confirm-wins, may still be used in some flows)

### 5.3 Place Resolution Tiebreaker

**Function:** `matchResolvePlaceIfNeeded` / `matchResolveExpired`

**Resolution Logic (from code):**
- Both chose same: That place
- One chose, one didn't: That place
- Neither chose: Rank #1
- Both chose different: Lower rank wins (deterministic)
- If ranks equal: Lexicographic `placeId` comparison

**Guard:** Place validation ensures required fields exist, else fallback to rank #1

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

**Allowed Transitions:**
```
pending → heading_there
pending → arrived (skip allowed)
heading_there → arrived
arrived → completed
```

**Per-User Status:** Stored in `statusByUser[uid]`

**Match-Level Status:**
- Both `heading_there` OR `arrived` → `status: 'heading_there'`
- Both `arrived` → `status: 'arrived'`
- Both `completed` → `status: 'completed'`

**Forward-Only:** No backward transitions (can't revert from arrived to on the way)

### 6.4 Report & Block

**Report:**
- Creates document at `reports/{reportId}`
- Fields: `reportedUid`, `reporterUid`, `matchId`, `reason`, `details`
- No automated action, admin review only

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
- `status: 'cancelled'`
- `cancelledBy: uid`
- `cancelReason: string`
- Redirect to `/?cancelled=true&reason=...`

**Reliability Score:** (mentioned in code, actual impact on discovery unclear)

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
```typescript
{
  matchId: string;
  uid: string;
  didMeet: boolean;
  rating?: number; // 1-5, null if didn't meet
  wouldMeetAgain?: boolean; // null if didn't meet
  comment?: string;
  createdAt: Timestamp;
}
```

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
```typescript
{
  id: string;
  name: string;
  category: 'Cafe' | 'Restaurant' | 'Library' | 'Park' | 'Study Space' | 'Other';
  address: string;
  lat: number;
  lng: number;
  geohash: string; // calculated from lat/lng
  tags: string[];
  allowedActivities: string[]; // e.g., ['Coffee', 'Study']
  active: boolean;
}
```

**Features:**
- Add new place (manual lat/lng input)
- Edit existing place
- Delete place
- Toggle active/inactive
- Default activity suggestions based on category
- Real-time list via Firestore listener

---

## 9. Backend Functions Inventory

### 9.1 Presence

| Function | Purpose |
|----------|---------|
| `presenceStart` | Create presence, set user available |
| `presenceEnd` | Delete presence, cancel pending offers, go offline |

### 9.2 Suggestions

| Function | Purpose |
|----------|---------|
| `suggestionGetCycle` | Get one suggestion from cycle |
| `suggestionPass` | Mark user seen, get next |
| `suggestionGetTop1` | (Legacy, likely deprecated) |
| `suggestionRespond` | (Legacy, likely deprecated) |

### 9.3 Offers

| Function | Purpose |
|----------|---------|
| `offerCreate` | Send invite, detect mutual invite |
| `offerRespond` | Accept/decline offer |
| `offerCancel` | Cancel outgoing offer |
| `offersGetInbox` | Fetch incoming offers for user |
| `offerGetOutgoing` | Fetch outgoing offers for user |

### 9.4 Matches

| Function | Purpose |
|----------|---------|
| `matchConfirmPlace` | First-confirm-wins place selection (legacy) |
| `matchCancel` | Cancel match |
| `matchFetchAllPlaces` | Fetch candidates, store in match |
| `matchSetPlaceChoice` | Record user's place selection |
| `matchResolvePlaceIfNeeded` | Manual resolution call |
| `matchResolveExpired` | Scheduled: resolve expired countdowns |

### 9.5 Meetup

| Function | Purpose |
|----------|---------|
| `meetupRecommend` | Fetch 3 nearby places |
| `updateMatchStatus` | Update per-user status |

### 9.6 Availability

| Function | Purpose |
|----------|---------|
| `checkAvailabilityForUser` | Verify user is available |

---

## 10. Frontend Hooks Inventory

| Hook | Purpose |
|------|---------|
| `useAuth` | Firebase auth state, user profile |
| `usePresence` | Monitor presence status, availability |
| `useSuggestion` | (Legacy) Single suggestion logic |
| `useCycleSuggestions` | Cycle-based discovery |
| `useOffers` | Inbox, outgoing offers, respond/cancel |
| `useMatch` | Real-time match document listener |
| `useLocationDecision` | Place fetching, selection, countdown |

---

## 11. What's NOT Implemented (vs PRDs)

### 11.1 Chat/Messaging System
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

### 11.2 Dual-Choice Place Selection
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

### 11.3 9-Place System with "Find Others"
**Status:** IMPLEMENTED (Backend)

**PRDs Specify:**
- Up to 9 place candidates
- Radius fallback (2km → 3km → 5km)
- "Find Others" rolling windows

**Code Reality:**
- **IMPLEMENTED:** `matchFetchAllPlaces` → `getPlaceCandidates` returns up to 9 places with 2km→3km→5km fallback (HARD_CAP=9, SOFT_MIN=6)
- `useLocationDecision` hook has complete window generation logic
- Match page UI does not fully renders this system.

### 11.4 Analytics & Cleanup
**Status:** NOT IMPLEMENTED

**PRDs Specify:**
- Chat analytics transformation
- Stale meetup auto-cancel (24h)
- Incomplete grace finalizer (12h)
- Raw message deletion

**Code Reality:**
- No scheduled cleanup jobs
- No analytics collection
- Matches persist indefinitely

### 11.5 Security Rules Enforcement
 **Status:** ⚠️ PARTIALLY INSECURE / VULNERABLE
 
 **PRDs Specify:**
 - Clients cannot write to `matches`, `messages`, `confirmedPlace*`
 - Function-only writes
 - Idempotency via `clientMessageId`
 
 **Code Reality:**
 - **Matches:** ❌ **INSECURE**. Rules allow `isMatchParticipant` to update documents directly, bypassing backend logic.
 - **Presence:** ❌ **INSECURE**. Rules allow `isOwner` to write directly.
 - **Offers:** ✅ **SECURE**. Client writes explicitly denied (`if false`).
 - **Action Required:** Rules need tightening to enforce "Function-only writes" pattern.

---

## 12. Known Limitations & Edge Cases

### 12.1 Race Conditions

**Stale Offer Accept:**
- Mitigated by availability checks in `offerRespond`
- Cleanup logic cancels other offers post-match
- Potential edge case if both users accept each other's offers simultaneously

**Simultaneous Mutual Invites:**
- First-create-wins in `offerCreate`
- Second invite detects existing reverse offer

### 12.2 Block During Active Match

**Issue:** Blocking does NOT auto-cancel existing matches.

**Behavior:**
 - **Match Page Block:** Auto-cancels match (Frontend calls `matchCancel` with reason `blocked`).
 - **Standalone Block:** If implemented elsewhere (e.g. profile), requires manual cancel first or fails to stop match.

### 12.3 Presence Expiry

**Effect:** If user's presence expires mid-match:
- Presence deleted
- Pending offers cancelled
- Match remains active
- Other user sees stale match state

**Mitigation:** None currently implemented

### 12.4 Place Selection Inconsistency

**Issue:** Two systems exist:
1. Legacy: `meetupRecommend` → `matchConfirmPlace` (3 places, first-confirm-wins)
2. New: `matchFetchAllPlaces` → `matchSetPlaceChoice` → `matchResolvePlace` (dual-choice, countdown)

**Reality:** Match page does not render new system UI. Unclear which is active.

### 12.5 Email Verification Blocking
 
 **Status:** NOT ENFORCED
 
 **Behavior:**
 - Code logic checks `emailVerified` flag but does NOT actively block unverified users from core actions (setting availability, etc).
 - No UI guidance prompts user to verify.
 - **Risk:** Unverified users can use the platform freely.

---

## 13. Data Retention & Privacy

### 13.1 User Data

**Stored:**
- Profile: `displayName`, `photoURL`, `interests`, `preferredActivities`
- Presence: `lat/lng` (ephemeral, deleted on offline)
- Feedback: Anonymous, tied to match not user identity

**Deletion:** No auto-deletion implemented. Manual admin deletion only.

### 13.2 Match History

**Retention:** Indefinite
- All matches persist in `matches` collection
- No cleanup or archival

### 13.3 Offers

**Retention:** Indefinite
- Expired/declined/cancelled offers remain in database
- No scheduled deletion

### 13.4 Reports & Blocks

**Retention:** Indefinite
- Reports: Manual admin review only
- Blocks: Permanent unless manually removed

---

## 14. Summary of Core Flows

### 14.1 Happy Path (Acceptance)

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

### 14.2 Mutual Invite Path

1. User A invites User B
2. User B (simultaneously) invites User A
3. System detects mutual invite in `offerCreate`
4. Immediate match creation
5. Flow continues as Happy Path from step 4

### 14.3 Decline Path

1. User receives invite
2. User declines
3. 6-hour rejection cooldown created (symmetric)
4. Both users filtered from each other's suggestions for 6 hours

### 14.4 Expiry Path

1. User sends invite
2. Recipient does not respond
3. 10 minutes pass
4. Offer status auto-updates to `expired`
5. Sender's outgoing slot freed for new invite

### 14.5 Cancel Path

1. Match in progress
2. User clicks "Cancel Meetup"
3. Select reason, confirm
4. Match status → `cancelled`
5. Redirect to home with "Meetup Cancelled" toast

---

## 15. Technical Stack

**Frontend:**
- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS
- Shadcn UI
- Framer Motion (animations)
- Firebase SDK (Firestore, Auth, Storage)

**Backend:**
- Firebase Cloud Functions (Node.js, TypeScript)
- Firestore (database)
- Firebase Authentication
- Firebase Storage (profile pictures)
- Geofire Common (geospatial queries)

**Deployment:**
- Vercel (Frontend)
- Firebase Functions (us-east1 region)

---

## 16. Acceptance Criteria (AS-IS)

### ✅ Implemented & Working

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

### ❌ NOT Implemented

- [ ] Ephemeral chat system
- [ ] Chat message limits (400 total, 100 words/message)
- [ ] Status announcements in chat
- [ ] Match analytics transformation
- [ ] Stale meetup auto-cancel (24h)
- [ ] Raw data cleanup (24h deletion)

### ⚠️ Partially Implemented
 
 - [~] Security rules (enforcement unknown)
 - [~] Email verification prompts/UI

---

**END OF DOCUMENT**
