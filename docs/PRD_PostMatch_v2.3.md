# PRD — NYU Buddy Post-Match v2.3

> **Version:** 2.3
> **Date:** 2026-01-30  
> **Status:** Ready for Implementation

---

## 0. Executive Summary

This PRD redesigns the post-match experience for NYU Buddy:

| Current | New |
|---------|-----|
| First-confirm-wins location | Dual choice + countdown + "Find Others" + rank-based tie-breaker |
| Blind status tracking | Uber-style ephemeral chat with status announcements |
| 3 location candidates | Up to 9 candidates with radius fallback |
| No real-time sync | Firestore listeners for instant UI updates |

---

## 1. Goals & Non-Goals

### 1.1 Goals
- Fair, interactive location selection where both users see each other's choice
- "Find Others" button for browsing up to 9 location candidates
- 120-second shared countdown starting at match creation
- Deterministic rank-based tie-breaker (no random)
- Uber-style ephemeral chat with plain text + status announcements
- Forward-only status progression with skip support
- Per-user completion with analytics-ready data transformation
- Privacy-safe: raw chat deleted after 24h, only metrics retained

### 1.2 Non-Goals (Out of Scope)
- Image/video messages
- Emoji reactions / stickers
- Typing indicators
- Read receipts
- Embedded maps/navigation
- Long-term DM/messenger functionality
- Searchable chat history for users

---

## 2. Definitions

| Term | Definition |
|------|------------|
| Match | Firestore doc at `matches/{matchId}` |
| Location Candidate | A place from `meetupRecommend()` ranked by distance |
| Window | Which 3 candidates are currently displayed (based on offset) |
| User Choice | Place selected by a user (stored in `placeChoiceByUser`) |
| Confirmed Place | Final locked place after resolution |
| Countdown | 120 seconds from `matchedAt` |
| Ephemeral Chat | Chat accessible only during active meetup, deleted after 24h |

---

## 3. Data Model

### 3.1 Match Document (`matches/{matchId}`)

```typescript
interface Match {
  // === Existing Fields ===
  id: string;
  user1Uid: string;  // STANDARDIZED naming
  user2Uid: string;  // STANDARDIZED naming
  activityType: string;
  matchedAt: Timestamp;  // CANONICAL countdown anchor
  
  // === Status (lifecycle, not progress) ===
  status: 'location_deciding' | 'place_confirmed' | 'in_meetup' | 
          'completed' | 'cancelled';
  
  // === Confirmed Place (set after resolution) ===
  // IMPORTANT: Only matchResolvePlaceIfNeeded may write these fields
  confirmedPlaceId?: string;
  confirmedPlaceName?: string;
  confirmedPlaceAddress?: string;
  confirmedPlaceLat?: number;
  confirmedPlaceLng?: number;
  confirmedAt?: Timestamp;
  
  // === Full Ranked Candidates (snapshot at match creation) ===
  // Written ONCE by matchFetchAllPlaces, read-only for clients
  placeCandidates?: Array<{
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number; // 1-indexed, lower = better
  }>;
  
  // === Per-User Choice (not final) ===
  placeChoiceByUser?: {
    [uid: string]: {
      placeId: string;
      placeRank: number;
      chosenAt: Timestamp;
    } | null;
  };
  
  // === Location Decision Metadata ===
  locationDecision?: {
    expiresAt: Timestamp;      // = matchedAt + 120s
    resolvedAt?: Timestamp;
    resolutionReason?: 'both_same' | 'tick_sync' | 'one_chose' | 
                       'none_chose' | 'rank_tiebreak';
  };
  
  // === Telemetry (for analytics) ===
  telemetry?: {
    findOthersClicksByUser?: { [uid: string]: number };
    choiceChangedCountByUser?: { [uid: string]: number };
    tickUsedByUser?: { [uid: string]: boolean };
  };
  
  // === Status Tracking (per-user progress) ===
  statusByUser?: { 
    [uid: string]: 'pending' | 'heading_there' | 'arrived' | 'completed' 
  };
  
  // === Per-User Completion Tracking ===
  completedByUser?: { [uid: string]: boolean };
  completedAtByUser?: { [uid: string]: Timestamp };
  
  // === Chat Counters (for efficient enforcement) ===
  chatCounters?: {
    totalTextMessages?: number;
    textMessagesByUser?: { [uid: string]: number };
    lastMessageAtByUser?: { [uid: string]: Timestamp };
  };
  
  // === Chat Policy ===
  chatPolicy?: {
    rawRetainUntil?: Timestamp;
    analyticsWrittenAt?: Timestamp;
    rawDeletedAt?: Timestamp;
  };
  lastChatMessageAt?: Timestamp;
  
  // === Cancellation ===
  cancelledBy?: string;
  cancelledAt?: Timestamp;
  cancellationReason?: string;
}
```

### 3.2 Chat Messages (`matches/{matchId}/messages/{messageId}`)

```typescript
interface ChatMessage {
  id: string;
  matchId: string;
  senderUid: string;        // User UID or "system"
  senderName?: string;
  senderPhotoURL?: string;
  type: 'text' | 'status_announcement';
  text: string;             // Max 100 words / 500 chars
  createdAt: Timestamp;
  statusType?: 'heading_there' | 'arrived' | 'completed' | 'cancelled';
}
```

### 3.3 Chat Analytics (`analytics/matchChats/{matchId}`)

```typescript
interface MatchChatAnalytics {
  matchId: string;
  activityType: string;
  
  // Lifecycle
  matchCreatedAt: Timestamp;
  placeConfirmedAt?: Timestamp;
  endedAt: Timestamp;
  endReason: 'completed' | 'cancelled';
  
  // Participants (STANDARDIZED naming)
  user1Uid: string;
  user2Uid: string;
  
  // Volume
  totalTextMessages: number;
  totalStatusAnnouncements: number;
  textMessagesByUser: { [uid: string]: number };
  
  // Status events
  statusEventsByUser: {
    [uid: string]: {
      heading_there: number;
      arrived: number;
      completed: number;
    }
  };
  
  // Timing
  firstMessageAt?: Timestamp;
  lastMessageAt?: Timestamp;
  avgResponseSeconds?: number;
  medianResponseSeconds?: number;
  maxSilenceSeconds?: number;
  timeToFirstMessageSeconds?: number;
  bothArrived?: boolean;
  
  // Coordination quality
  usedQuickStatusButtons: boolean;
  usedCustomMessages: boolean;
  messagesSentAfterArrived?: number;
  
  // Content flags (boolean only)
  containsPhoneNumberByUser?: { [uid: string]: boolean };
  containsSocialHandleByUser?: { [uid: string]: boolean };
  
  // Location decision metrics (from telemetry)
  placeCandidateCount?: number;
  decisionMethod?: 'both_same' | 'tick_sync' | 'one_chose' | 
                   'none_chose' | 'rank_tiebreak';
  timeToDecisionSeconds?: number;
  findOthersClicksByUser?: { [uid: string]: number };
  choiceChangedCountByUser?: { [uid: string]: number };
  tickUsed?: boolean;
  
  // Feedback join
  didMeet?: boolean;
  rating?: number;
  wouldMeetAgain?: boolean;
  
  // Safety
  reportOccurred?: boolean;
  blockOccurred?: boolean;
}
```

---

## 4. Phase 1 — Location Decision

### 4.1 Candidate Fetching

**Limits:**
- Hard cap: **9 candidates** max
- Soft minimum: **6 candidates** target

**Fallback Logic:**
1. Search radius = 2km → take up to 9
2. If count < 6, expand to radius = 3km → fill up to 9
3. If still < 6, expand to radius = 5km → fill up to 9

**Authoritative Snapshot Creation:**
- `placeCandidates` must be generated **server-side immediately after match creation** and written once to `matches/{matchId}.placeCandidates`
- Clients treat `placeCandidates` as **read-only** snapshot for the full 120s decision window

**Responsibilities:**
- Cloud Function `matchFetchAllPlaces`:
  - Runs on match creation (invoked by match creation handler)
  - Writes: `placeCandidates` (ranked, up to 9) + `locationDecision.expiresAt = matchedAt + 120s`

### 4.2 UI Layout

```
┌─────────────────────────────────────────────────────┐
│  ⏱️ Time left: 1:47                    [ℹ️] [Cancel]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────────────┐    ┌────────────────────────┐ │
│  │ Pick a spot      │    │ Their choice           │ │
│  │ ─────────────────│    │ ──────────────────────│  │
│  │ [☕ Blue Bottle] │    │ "Choosing..."          │ │
│  │ [🍽️ Starbucks]  ✓│    │ or                     │ │
│  │ [📚 Bobst Cafe]  │    │ [Place X] 🔴/🟢        │ │
│  │                  │    │                        │ │
│  │ Find others ↻    │    │ [Go with their choice] │ │
│  └──────────────────┘    └────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**UI Hierarchy:**
- Primary CTA: **"Pick a spot"** (large, prominent)
- Secondary action: **"Find others"** (smaller, below cards)
- Match CTA: **"Go with their choice"** (big green button when available)
- Info icon `ℹ️`: Shows decision rules on tap

### 4.3 "Find Others" Rolling Logic (Algorithm)

Given `N = placeCandidates.length`:

**Case A — N ≤ 3:**
- Only one window: `[1,2,3]` (or `[1..N]` if fewer)
- "Find Others" is hidden/disabled

**Case B — N = 4:**
- Windows cycle: `[1,2,3]` ↔ `[1,2,4]`

**Case C — N = 5:**
- Windows cycle: `[1,2,3]` ↔ `[1,4,5]`

**Case D — N ≥ 6:**
```
Windows = [[1,2,3]]
For i = 4 to N step 3:
  add [i, i+1, i+2] if all indices ≤ N
Ensure final window is [N-2, N-1, N] if not already last
Cycling: windows[0..k-1] then wrap to 0
```

**Examples:**
- N=7: `[1,2,3]` → `[4,5,6]` → `[5,6,7]` → back
- N=9: `[1,2,3]` → `[4,5,6]` → `[7,8,9]` → back
- N=10: `[1,2,3]` → `[4,5,6]` → `[7,8,9]` → `[8,9,10]` → back

**Implementation:** `currentWindowIndex` in local React state only.

**Telemetry:** On each click, increment `telemetry.findOthersClicksByUser[currentUid]`.

### 4.4 Selection Behavior

**When user taps a candidate:**
1. Write to `placeChoiceByUser[uid]`
2. UI shows green border + "Waiting for other user..."

**Selection persistence:** If "Find Others" and selected not in window → pin at top with "Your selection"

**Changing selection:** User can change anytime (latest wins).
- **Telemetry:** If changing from existing choice, increment `telemetry.choiceChangedCountByUser[uid]`

### 4.5 Other User Panel

| Their State | Display | Frame |
|-------------|---------|-------|
| No choice | "Other user is choosing..." | Grey |
| Chose same | "Congrats! {Place} it is!" | 🟢 Green |
| Chose different | "{Name} chose {Place}. Waiting..." | 🔴 Red |

**"Go with their choice" button:**
- Visible when other user has chosen
- On click: set my choice = their choice
- **Telemetry:** Set `telemetry.tickUsedByUser[uid] = true`

### 4.6 Countdown & Resolution

**Countdown:**
- `expiresAt = matchedAt + 120 seconds`
- Both users see identical timer (shared)

**Clock Skew Tolerance:**
- UI displays `max(0, expiresAt - clientNow)`
- If computed remaining ≤ 0: show `0:00` and trigger resolution refresh

**Resolution Triggers:**
1. **Immediate:** Both users choose same place
2. **Immediate:** User clicks "Go with their choice"
3. **Expiry:** Countdown reaches 0

**Resolution Rules (Deterministic Tie-Breaker):**

| Scenario | Result |
|----------|--------|
| Both chose same | That place |
| User clicked tick | That place |
| One chose | Their choice |
| Neither | Rank #1 |
| Both different | **Deterministic resolution** (see below) |

**Deterministic Tie-Breaker When Both Chose Different:**
1. Compare `placeRank` → lower rank wins
2. If `placeRank` equal → **choose lexicographically smaller `placeId`**

> Ensures identical outcome on all clients. No randomness.

### 4.7 Place Validation Guard

Confirmed place must have: `placeId`, `name`, `address`, `lat`, `lng`

**If missing → fallback to rank #1.**

### 4.8 Server-Authoritative Resolution

> `matchResolvePlaceIfNeeded` is the **only** writer of `confirmedPlace*` fields.

**Must be:**
- **Idempotent:** If `confirmedPlaceId` exists → return existing, do nothing
- **Guarded:** Transaction with "if already confirmed, skip"
- **Clients never write confirmedPlace fields**

### 4.9 Resolution Invocation Policy

`matchResolvePlaceIfNeeded(matchId)` invoked when:

1. **On choice write:** Either user updates `placeChoiceByUser[uid]`
2. **On tick-sync:** User clicks "Go with their choice"
3. **On expiry:** Countdown reaches `expiresAt` (even if no user online)

**Expiry Guarantee (Required):**
- Scheduled job runs every minute to resolve matches with `status='location_deciding'` AND `now >= expiresAt` AND not resolved
- OR use Firestore TTL/queue-based trigger

### 4.10 Info Icon Content

On tap, show modal:
> "If you both pick the same spot, you're set! Otherwise, the higher-ranked spot wins. If no one picks, we'll choose the top suggestion."

---

## 5. Phase 2 — Meetup Chat + Status

### 5.1 Page Layout

```
┌──────────────────────────────────────────────────────┐
│  📍 Blue Bottle Coffee                    [⋮ Menu]   │
│     123 Broadway, NYC   [Open in Maps]               │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ════════ Edoardo is on the way ════════             │
│                                                      │
│  ┌────┐ "I'll be there in 5!"                       │
│  └────┘  Edoardo                                     │
│                                                      │
│                    "See you soon!" ┌────┐            │
│                              You   └────┘            │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [I'm on my way] [I've arrived] [Meetup complete]    │
├──────────────────────────────────────────────────────┤
│  [Type a message...              ] [Send]            │
│  "Chat is temporary."                   23/100 words │
└──────────────────────────────────────────────────────┘
```

### 5.2 Message Constraints

| Constraint | Value |
|------------|-------|
| Per message | 100 words / 500 chars |
| **Total cap** | **400 messages** |
| Soft warning | After 60 messages |
| Rate limit | 1 msg/sec, 10/30sec burst |

**Backend Enforcement Strategy:**
- `chatSendMessage` uses transaction:
  1. Read `match.chatCounters.totalTextMessages` (default 0)
  2. If ≥ 400 → reject
  3. Else increment and write message
- Rate limit via `chatCounters.lastMessageAtByUser[uid]`

**Warning (after 60):** "Keep it short—this chat is just for meetup coordination."

**Limit reached:** "Message limit reached." (Status buttons remain enabled)

### 5.3 Status Buttons — Forward-Only with Skip

**Allowed Transitions:**
```
pending → heading_there
pending → arrived (skip)
heading_there → arrived
arrived → completed
```

**No backward transitions.**

| Current Status | Buttons Shown |
|----------------|---------------|
| `pending` | [I'm on my way] [I've arrived] |
| `heading_there` | [I've arrived] |
| `arrived` | [Meetup complete] |
| `completed` | (none, redirected) |

**Confirmation Modal for "Arrived":**
> "Confirm you've arrived at {PlaceName}?"

### 5.4 Status Announcements

On status button click:
1. Update `statusByUser[uid]`
2. Write to `messages`: `{senderUid: "system", type: "status_announcement", text: "...", statusType: "..."}`
3. Render as colored strip

### 5.5 `in_meetup` Status Trigger

Set `match.status = 'in_meetup'` when:
- First chat message sent, OR
- First status update (`heading_there` or `arrived`)

### 5.6 Completion Logic

**Per-User:**
1. Set `statusByUser[uid] = 'completed'`
2. Set `completedByUser[uid] = true`
3. Set `completedAtByUser[uid] = serverTimestamp()`
4. Write status announcement
5. Redirect user to `/feedback/[matchId]`

**Match-Level:** `status = 'completed'` only when **both** complete.

### 5.7 Ephemeral Chat Policy

- Available during: `place_confirmed`, `in_meetup`
- Inaccessible when: `completed`, `cancelled`
- Raw retained 24h → analytics → delete

---

## 6. Cancellation Rules

### 6.1 Cancel Availability

**CAN cancel if:**
- `match.status` ∉ `{cancelled, completed}`
- `statusByUser[currentUid]` ≠ `completed`

### 6.2 Cancel Effect

1. Write system announcement: "{Name} cancelled the meetup."
2. Set `match.status = 'cancelled'`
3. Set `cancelledBy`, `cancelledAt`

**Grace Render:** Announcement written **before** status change.

**Robustness:** UI **must not** rely on reading messages after `status='cancelled'`. Render terminal from `match.status` listener.

### 6.3 UI Behavior

- Cancel allowed: Show in header menu
- User completed: Hide, tooltip "You've already completed."
- On cancel: Terminal screen "Meetup canceled." + CTA "Back to Home"

---

## 7. Backend Changes

### 7.1 New Cloud Functions

| Function | Purpose |
|----------|---------|
| `matchFetchAllPlaces` | 9 candidates + radius fallback + writes `placeCandidates` + `expiresAt` |
| `matchSetPlaceChoice` | Sets choice + increments telemetry |
| `matchResolvePlaceIfNeeded` | Server-authoritative, idempotent, guarded |
| `matchResolveExpired` | Scheduled job for expiry resolution |
| `chatSendMessage` | 400 limit enforcement via counters |
| `chatSendStatus` | Status + announcement + `in_meetup` trigger |
| `chatTransformAnalytics` | Transforms + copies telemetry to analytics |
| `chatDeleteRaw` | Deletes raw after 24h |

### 7.2 Modified Functions

| Function | Change |
|----------|--------|
| `meetupRecommend` | Increase to 9, add radius fallback |
| `matchCancel` | `completedByUser` check, announcement before status |

### 7.3 Deprecated

| Function | Reason |
|----------|--------|
| `matchConfirmPlace` | Replaced by resolution flow |

---

## 8. Security Rules (Pseudo-Rules)

### 8.1 Messages Subcollection

```
ALLOW read/write IF:
  - request.auth.uid is user1Uid OR user2Uid
  - match.status IN ('place_confirmed', 'in_meetup')
  
DENY after completed/cancelled
```

**Server enforces:** Word count, total count, rate limit.

### 8.2 Analytics

```
DENY read/write for all clients (server-only)
```

---

## 9. Frontend Changes

### 9.1 New Components

| Component | Purpose |
|-----------|---------|
| `LocationDecisionPage` | Dual-panel, rolling, countdown |
| `MeetupChatPage` | Chat + status |
| `ChatBubble` | Message bubble |
| `StatusAnnouncement` | Colored strip |
| `CountdownTimer` | Synced to `expiresAt` |
| `PlaceCard` | Selectable candidate |
| `OtherChoicePanel` | Other user's selection |

### 9.2 New Hooks

| Hook | Purpose |
|------|---------|
| `useLocationDecision` | Match doc subscription |
| `useChatMessages` | Messages subcollection |
| `useMatchStatus` | Status tracking |

### 9.3 Routing

| Route | Component | Condition |
|-------|-----------|-----------|
| `/match/[matchId]` | `LocationDecisionPage` | If not confirmed |
| `/match/[matchId]` | Redirect to meetup | If confirmed |
| `/match/[matchId]/meetup` | `MeetupChatPage` | Active meetup |
| `/feedback/[matchId]` | `FeedbackPage` | After completion |

### 9.4 Terminal Routing Guards

All pages must handle lifecycle changes via real-time listener:

**If `status == 'cancelled'`:**
- Render "Meetup canceled." + CTA "Back to Home"
- Disable chat/status buttons

**If `status == 'completed'`:**
- If user has not submitted feedback → redirect to `/feedback/[matchId]`
- Else render "Meetup completed."

**If loading `/meetup` but `status == 'location_deciding'`:**
- Redirect to `/match/[matchId]`

---

## 10. Implementation Priority

### Phase 1 — Location (Week 1-2)
- [ ] `matchFetchAllPlaces` with 9-cap + radius + writes expiresAt
- [ ] Countdown from `matchedAt` with skew tolerance
- [ ] "Find Others" algorithm
- [ ] Server-authoritative resolution + expiry scheduler
- [ ] Telemetry recording

### Phase 2 — Chat (Week 3-4)
- [ ] Messages subcollection + counters
- [ ] `chatSendMessage` with 400 limit
- [ ] Forward-only status buttons
- [ ] `in_meetup` trigger
- [ ] Per-user completion
- [ ] Cancel with grace render

### Phase 3 — Analytics (Week 5)
- [ ] `chatTransformAnalytics` (copies telemetry)
- [ ] `chatDeleteRaw` scheduler
- [ ] Security rules
- [ ] Terminal routing guards

---

## 11. Acceptance Criteria

### Location Decision
- [ ] 9 candidates with "Find Others"
- [ ] Countdown synced from `matchedAt`
- [ ] Deterministic tie-breaker (lexicographic placeId)
- [ ] Expiry resolution guaranteed (scheduler)
- [ ] Telemetry recorded

### Chat
- [ ] 400 total limit enforced via counters
- [ ] Forward-only status with skip
- [ ] `in_meetup` on first interaction
- [ ] Per-user completion

### Ephemeral
- [ ] Chat inaccessible after end
- [ ] Analytics with telemetry fields
- [ ] Raw deleted after 24h

### Cancellation
- [ ] Cancel until complete
- [ ] Grace render
- [ ] Terminal screen from status listener

### Routing
- [ ] Terminal guards for all states
