# PRD — NYU Buddy Post-Match v2.2

> **Version:** 2.2 
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
  user1Uid: string;
  user2Uid: string;
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
  // NOTE: expiresAt = matchedAt + 120s (computed, not duplicated)
  locationDecision?: {
    expiresAt: Timestamp;      // = matchedAt + 120s
    resolvedAt?: Timestamp;
    resolutionReason?: 'both_same' | 'tick_sync' | 'one_chose' | 
                       'none_chose' | 'rank_tiebreak';
  };
  
  // === Status Tracking (per-user progress) ===
  statusByUser?: { 
    [uid: string]: 'pending' | 'heading_there' | 'arrived' | 'completed' 
  };
  
  // === Per-User Completion Tracking ===
  completedByUser?: { [uid: string]: boolean };
  completedAtByUser?: { [uid: string]: Timestamp };
  
  // === Chat Policy ===
  chatPolicy?: {
    rawRetainUntil?: Timestamp;      // endedAt + 24h
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
  senderName?: string;      // Display name snapshot
  senderPhotoURL?: string;  // Photo URL snapshot
  type: 'text' | 'status_announcement';
  text: string;             // Max 100 words / 500 chars
  createdAt: Timestamp;
  
  // For status announcements only
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
  
  // Participants
  userA: string;
  userB: string;
  
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
  
  // NEW: Investor-grade coordination metrics
  timeToFirstMessageSeconds?: number;  // placeConfirmedAt → firstMessageAt
  bothArrived?: boolean;               // derived from statusByUser
  
  // Coordination quality
  usedQuickStatusButtons: boolean;
  usedCustomMessages: boolean;
  messagesSentAfterArrived?: number;
  
  // Content flags (boolean only, no raw text)
  containsPhoneNumberByUser?: { [uid: string]: boolean };
  containsSocialHandleByUser?: { [uid: string]: boolean };
  
  // Location decision metrics
  placeCandidateCount?: number;
  decisionMethod?: 'both_same' | 'tick_sync' | 'one_chose' | 
                   'none_chose' | 'rank_tiebreak';
  timeToDecisionSeconds?: number;
  findOthersClicksByUser?: { [uid: string]: number };
  choiceChangedCountByUser?: { [uid: string]: number };
  tickUsed?: boolean;
  
  // Feedback join (written later)
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

**Storage:** Full candidate list stored in `match.placeCandidates` at match creation.

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
- Info icon `ℹ️`: Shows decision rules on tap (not always visible)

### 4.3 "Find Others" Rolling Logic

Given `N` total candidates, windows always end at the **last three** items:

| N | Window Sequence |
|---|-----------------|
| ≤3 | `[1,2,3]` only (button hidden/disabled) |
| 4 | `[1,2,3]` ↔ `[1,2,4]` |
| 5 | `[1,2,3]` ↔ `[1,4,5]` |
| 6 | `[1,2,3]` ↔ `[4,5,6]` |
| 7+ | `[1,2,3]` → `[4,5,6]` → ... → `[N-2,N-1,N]` → back |

**Rule:** For N≥6, generate windows in blocks of 3, always ending with the last-three window `[N-2,N-1,N]` even if it overlaps with previous window.

**Examples:**
- N=7: `[1,2,3]` → `[4,5,6]` → `[5,6,7]` → back
- N=8: `[1,2,3]` → `[4,5,6]` → `[6,7,8]` → back
- N=9: `[1,2,3]` → `[4,5,6]` → `[7,8,9]` → back
- N=10: `[1,2,3]` → `[4,5,6]` → `[7,8,9]` → `[8,9,10]` → back

**Implementation:** Store `currentWindowIndex` in local React state only.

### 4.4 Selection Behavior

**When user taps a candidate:**
1. Write to `placeChoiceByUser[uid]`
2. UI shows:
   - Green border + `scale(0.98)` animation
   - Text: "Waiting for other user..."

**Selection persistence:** If user clicks "Find Others" and selected place isn't in new window:
- Pin selected place at top with label: "Your selection"

**Changing selection:** User can change mind anytime (latest wins).

### 4.5 Other User Panel

| Their State | Display | Frame |
|-------------|---------|-------|
| No choice | "Other user is choosing..." | Grey |
| Chose same as me | "Congrats! {Place} it is!" | 🟢 Green |
| Chose different | "{Name} chose {Place}. Waiting..." | 🔴 Red |

**"Go with their choice" button:**
- Visible when other user has chosen
- On click: set my choice = their choice
- If their place not in current window: replace slot #3 with it
- Both now same → immediate confirmation

### 4.6 Countdown & Resolution

**Countdown:**
- `expiresAt = matchedAt + 120 seconds`
- Both users see identical timer (shared, anchored to `matchedAt`)
- No separate `startedAt` field (use `matchedAt` as canonical anchor)

**Resolution Triggers:**
1. **Immediate:** Both users choose same place
2. **Immediate:** User clicks "Go with their choice"
3. **Expiry:** Countdown reaches 0

**Resolution Rules (Rank-Based Tie-Breaker):**

| Scenario | Confirmed Place |
|----------|-----------------|
| Both chose same | That place |
| User clicked "Go with their choice" | That place |
| Only one chose | Their choice |
| Neither chose | Rank #1 |
| Both chose different | **Better-ranked place (lower rank # wins)** |

> **No random selection.** Deterministic, predictable.

### 4.7 Place Validation Guard

At resolution time, confirmed place must have required fields:
- `placeId`, `name`, `address`, `lat`, `lng`

**If selected place is missing required fields → fallback to rank #1.**

### 4.8 Server-Authoritative Resolution

> **Critical:** Place confirmation is server-authoritative. `matchResolvePlaceIfNeeded` is the **only** writer of `confirmedPlace*` fields. It must be:
> - **Idempotent:** If already confirmed, return existing confirmed place
> - **Guarded:** Use transaction with "if already confirmed, skip" check
> - **Clients never directly set confirmedPlace fields**

**Post-Resolution:**
1. Update `confirmedPlaceId/Name/Address/Lat/Lng`
2. Set `match.status = 'place_confirmed'`
3. Show "Congrats! {Place} it is!" for 2 seconds
4. Redirect both to `/match/[matchId]/meetup`

### 4.9 Info Icon Content (Decision Rules)

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
│  ┌────┐                                              │
│  │ 😊 │  "I'll be there in 5!"                      │
│  └────┘  Edoardo                                     │
│                                                      │
│                              ┌────┐                  │
│    "See you soon!"           │ 😊 │                  │
│                        You   └────┘                  │
│                                                      │
│  ════════ You have arrived ════════                  │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [I'm on my way] [I've arrived] [Meetup complete]    │
├──────────────────────────────────────────────────────┤
│  [Type a message...              ] [Send]            │
│  "Chat is temporary and only available for this      │
│   meetup."                              23/100 words │
└──────────────────────────────────────────────────────┘
```

### 5.2 Message Constraints

| Constraint | Value |
|------------|-------|
| Max words per message | 100 |
| Max chars per message | 500 |
| **Max total messages per match** | **400** (source of truth) |
| Soft warning threshold | 60 total messages |
| Rate limit | 1 msg/sec, 10 msgs/30 sec burst |

> **Enforcement:** Backend enforces `maxTotalTextMessagesPerMatch = 400`. Per-user tracking optional for fairness but total cap is primary.

**Warning text (after 60 messages):**
> "Keep it short—this chat is just for meetup coordination."

**Limit reached:**
> "Message limit reached for this meetup chat."
> (Status buttons remain enabled)

### 5.3 Status Buttons — Forward-Only with Skip

**Allowed Transitions:**
```
pending → heading_there
pending → arrived (skip allowed)
heading_there → arrived
arrived → completed
```

**No backward transitions** (can't go arrived → on the way).

**Button Display by Status:**

| Current Status | Buttons Shown |
|----------------|---------------|
| `pending` | [I'm on my way] [I've arrived] |
| `heading_there` | [I've arrived] |
| `arrived` | [Meetup complete] |
| `completed` | (none, redirected) |

**Confirmation Modal for "Arrived":**
> "Confirm you've arrived at {PlaceName}?"
> [Yes, I'm here] [Not yet]

### 5.4 Status Announcements

When user clicks status button:
1. Update `statusByUser[uid]`
2. Write to `messages` subcollection:
   ```json
   {
     "senderUid": "system",
     "type": "status_announcement",
     "text": "Edoardo has arrived",
     "statusType": "arrived"
   }
   ```
3. Render as colored strip in chat (matches sender bubble color)

### 5.5 `in_meetup` Status Trigger

Set `match.status = 'in_meetup'` when **either**:
- First chat message is sent, OR
- First status update occurs (`heading_there` or `arrived`)

This improves analytics and state clarity.

### 5.6 Completion Logic

**Per-User Completion:**
- When user clicks "Meetup complete":
  1. Set `statusByUser[uid] = 'completed'`
  2. Set `completedByUser[uid] = true`
  3. Set `completedAtByUser[uid] = serverTimestamp()`
  4. Write status announcement
  5. Redirect **that user** to `/feedback/[matchId]`

**Match-Level Completion:**
- `match.status = 'completed'` **only when both users complete**:
  ```
  if (statusByUser[userA] === 'completed' && 
      statusByUser[userB] === 'completed') {
    match.status = 'completed';
  }
  ```

**Other user sees:**
> "Edoardo marked the meetup complete."

### 5.7 Ephemeral Chat Policy

**User Access:**
- Chat available only during: `place_confirmed`, `in_meetup`
- Chat inaccessible when: `completed`, `cancelled`

**End-State Messages:**
- Completed: "Meetup finished. Chat is no longer available."
- Cancelled: "Match canceled. Chat is no longer available."

**Data Retention:**
1. Raw messages retained for **24 hours** after match ends
2. Analytics transformation runs when match ends
3. Raw messages deleted after 24h
4. Only analytics metrics retained long-term

---

## 6. Cancellation Rules

### 6.1 Cancel Availability

**User CAN cancel if ALL true:**
- `match.status` ∉ `{cancelled, completed}`
- `statusByUser[currentUid]` ≠ `completed`

**User CANNOT cancel if:**
- `statusByUser[currentUid] === 'completed'`
- OR `match.status === 'completed'`
- OR `match.status === 'cancelled'`

### 6.2 Cancel Effect

1. Write system announcement: "{Name} cancelled the meetup."
2. Set `match.status = 'cancelled'`
3. Set `cancelledBy = currentUid`
4. Set `cancelledAt = serverTimestamp()`

**Grace Render:** The announcement message is written **before** status change to ensure it renders in UI before chat locks.

### 6.3 UI Behavior

- If cancel allowed: Show "Cancel meetup" in header menu
- If user completed: Hide cancel, show tooltip: "You've already completed this meetup."
- On cancel: Show terminal screen "Meetup canceled." (rendered from local state, not dependent on reading messages after cancel)

---

## 7. Backend Changes

### 7.1 New Cloud Functions

| Function | Purpose |
|----------|---------|
| `matchFetchAllPlaces` | Returns up to 9 candidates with radius fallback |
| `matchSetPlaceChoice` | Sets user's choice in `placeChoiceByUser` |
| `matchResolvePlaceIfNeeded` | **Server-authoritative:** confirms place, idempotent, guarded |
| `chatSendMessage` | Validates + writes message (enforces 400 total limit) |
| `chatSendStatus` | Updates status + writes announcement + triggers `in_meetup` |
| `chatTransformAnalytics` | Transforms raw chat to analytics (triggered on match end) |
| `chatDeleteRaw` | Deletes raw messages after 24h (scheduled cron) |

### 7.2 Modified Functions

| Function | Change |
|----------|--------|
| `meetupRecommend` | Increase limit to 9, add radius fallback |
| `matchCancel` | Add `completedByUser` check, write announcement before status |

### 7.3 Deprecated

| Function | Reason |
|----------|--------|
| `matchConfirmPlace` | Replaced by choice/resolution flow |

---

## 8. Security Rules (Pseudo-Rules)

> **Note:** These are high-level pseudo-rules. Actual Firestore rules require valid syntax.

### 8.1 Messages Subcollection

```
ALLOW read/write IF:
  - request.auth.uid is user1Uid OR user2Uid
  - match.status IN ('place_confirmed', 'in_meetup')
  
DENY read/write IF:
  - match.status IN ('completed', 'cancelled')
```

**Server Enforcement (not rules):**
- Message exceeds 500 chars or 100 words
- Total messages exceed 400
- Rate limit exceeded

### 8.2 Analytics Collection

```
DENY read/write for all clients
// Server-only via Admin SDK
```

---

## 9. Frontend Changes

### 9.1 New Components

| Component | Purpose |
|-----------|---------|
| `LocationDecisionPage` | Dual-panel with rolling, countdown, resolution |
| `MeetupChatPage` | Uber-style chat with status announcements |
| `ChatBubble` | Left/right message bubble with avatar |
| `StatusAnnouncement` | Colored strip announcement |
| `CountdownTimer` | Synced to Firestore `expiresAt` |
| `PlaceCard` | Selectable location candidate |
| `OtherChoicePanel` | Shows other user's selection |

### 9.2 New Hooks

| Hook | Purpose |
|------|---------|
| `useLocationDecision` | Subscribes to match doc for choice/resolution |
| `useChatMessages` | Subscribes to messages subcollection |
| `useMatchStatus` | Tracks status changes |

### 9.3 Routing

| Route | Component | Condition |
|-------|-----------|-----------|
| `/match/[matchId]` | `LocationDecisionPage` | If not confirmed |
| `/match/[matchId]` | Redirect to meetup | If confirmed |
| `/match/[matchId]/meetup` | `MeetupChatPage` | Active meetup |
| `/feedback/[matchId]` | `FeedbackPage` | After completion |

---

## 10. Implementation Priority

### Phase 1 — Location Decision (Week 1-2)
- [ ] Update `meetupRecommend` with 9-place cap + radius fallback
- [ ] Store `placeCandidates` in match doc
- [ ] Implement `placeChoiceByUser` selection
- [ ] Build countdown timer (synced to `matchedAt + 120s`)
- [ ] Implement "Find Others" rolling logic (last-three rule)
- [ ] Build dual-panel UI with other user choice
- [ ] Implement "Go with their choice" button
- [ ] Implement server-authoritative resolution with rank-based tie-breaker
- [ ] Add place validation guard

### Phase 2 — Meetup Chat (Week 3-4)
- [ ] Create `messages` subcollection schema
- [ ] Build `chatSendMessage` with 400-total limit
- [ ] Build `ChatBubble` component
- [ ] Build `StatusAnnouncement` component
- [ ] Implement forward-only status buttons with skip
- [ ] Add arrival confirmation modal
- [ ] Implement `in_meetup` status trigger
- [ ] Implement per-user completion + redirect
- [ ] Add cancellation with grace render

### Phase 3 — Analytics & Cleanup (Week 5)
- [ ] Implement `chatTransformAnalytics` function
- [ ] Add `timeToFirstMessageSeconds` and `bothArrived` fields
- [ ] Implement `chatDeleteRaw` scheduled function
- [ ] Add Firestore security rules
- [ ] Build ephemeral enforcement

---

## 11. Acceptance Criteria

### Location Decision
- [ ] Up to 9 candidates shown with "Find Others"
- [ ] Countdown synced across both users from `matchedAt`
- [ ] Both users see each other's choice in real-time
- [ ] "Go with their choice" syncs selection instantly
- [ ] Rank-based tie-breaker (no random)
- [ ] Place validation guard (fallback to rank #1 if invalid)
- [ ] Server-authoritative resolution (idempotent, guarded)
- [ ] Auto-redirect after resolution

### Meetup Chat
- [ ] Messages sync in real-time
- [ ] Status buttons are forward-only with skip
- [ ] 100-word/500-char limit enforced
- [ ] 400 total message limit enforced
- [ ] `in_meetup` status set on first interaction
- [ ] Status announcements appear as colored strips
- [ ] Per-user completion redirects to feedback

### Ephemeral Chat
- [ ] Chat inaccessible after match ends
- [ ] Analytics written with `timeToFirstMessageSeconds` and `bothArrived`
- [ ] Raw messages deleted after 24 hours
- [ ] No raw text in analytics

### Cancellation
- [ ] Cancel allowed until user completes
- [ ] Cancel blocked after user marks complete
- [ ] System announcement renders before status change (grace render)
