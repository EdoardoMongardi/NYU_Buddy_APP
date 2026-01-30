# PRD — NYU Buddy Post-Match v2.4 (Final)

> **Version:** 2.4 Final  
> **Date:** 2026-01-30  
> **Status:** Ready for Implementation

---

## 0. Executive Summary

| Current | New |
|---------|-----|
| First-confirm-wins | Dual choice + countdown + rank tie-breaker |
| Blind status | Uber-style ephemeral chat |
| 3 candidates | Up to 9 with radius fallback |

---

## 1. Goals & Non-Goals

### 1.1 Goals
- Fair, interactive location selection
- 120-second shared countdown from match creation
- Deterministic rank-based tie-breaker
- Uber-style ephemeral chat
- Forward-only status progression
- Per-user completion with analytics
- Privacy-safe: raw chat deleted after 24h

### 1.2 Non-Goals
- Image/video messages, reactions, typing indicators, read receipts
- Embedded maps/navigation
- Long-term messenger functionality

---

## 2. Definitions

| Term | Definition |
|------|------------|
| Match | Firestore doc at `matches/{matchId}` |
| Countdown | 120 seconds from `matchedAt` |
| Ephemeral Chat | Deleted after 24h post-match |

---

## 3. Data Model

### 3.1 Match Document (`matches/{matchId}`)

```typescript
interface Match {
  // === Core Fields ===
  id: string;
  user1Uid: string;
  user2Uid: string;
  activityType: string;
  matchedAt: Timestamp;
  
  // === Status ===
  status: 'location_deciding' | 'place_confirmed' | 'in_meetup' | 
          'completed' | 'cancelled';
  endedAt?: Timestamp;  // Set when completed or cancelled
  
  // === Confirmed Place (SERVER-ONLY WRITE) ===
  confirmedPlaceId?: string;
  confirmedPlaceName?: string;
  confirmedPlaceAddress?: string;
  confirmedPlaceLat?: number;
  confirmedPlaceLng?: number;
  confirmedAt?: Timestamp;
  
  // === Candidates (snapshot, read-only for clients) ===
  // Keep lean: only essential fields, no photos/long descriptions
  placeCandidates?: Array<{
    placeId: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    distance: number;
    rank: number;
  }>;
  
  // === Per-User Choice (SERVER-ONLY WRITE via function) ===
  placeChoiceByUser?: {
    [uid: string]: {
      placeId: string;
      placeRank: number;
      chosenAt: Timestamp;
    } | null;
  };
  
  // === Location Decision ===
  locationDecision?: {
    expiresAt: Timestamp;
    resolvedAt?: Timestamp;
    resolutionReason?: 'both_same' | 'tick_sync' | 'one_chose' | 
                       'none_chose' | 'rank_tiebreak';
  };
  
  // === Telemetry (SERVER-ONLY WRITE) ===
  telemetry?: {
    findOthersClicksByUser?: { [uid: string]: number };
    choiceChangedCountByUser?: { [uid: string]: number };
    tickUsedByUser?: { [uid: string]: boolean };
  };
  
  // === Status Tracking ===
  // Initialized on match creation: both users = 'pending'
  statusByUser: { 
    [uid: string]: 'pending' | 'heading_there' | 'arrived' | 'completed' 
  };
  
  // === Completion Tracking ===
  completedByUser?: { [uid: string]: boolean };
  completedAtByUser?: { [uid: string]: Timestamp };
  
  // === Chat Counters (SERVER-ONLY WRITE) ===
  chatCounters?: {
    totalTextMessages?: number;
    textMessagesByUser?: { [uid: string]: number };
    lastMessageAtByUser?: { [uid: string]: Timestamp };
  };
  
  // === Chat Policy ===
  chatPolicy?: {
    rawRetainUntil?: Timestamp;  // = endedAt + 24h
    analyticsWrittenAt?: Timestamp;
    rawDeletedAt?: Timestamp;
  };
  lastChatMessageAt?: Timestamp;
  lastActivityAt?: Timestamp;  // For stale detection
  
  // === Cancellation ===
  cancelledBy?: string;  // uid or 'system'
  cancelledAt?: Timestamp;
  cancellationReason?: string;
}
```

### 3.2 Chat Messages

```typescript
interface ChatMessage {
  id: string;
  matchId: string;
  clientMessageId?: string;  // UUID for idempotency
  senderUid: string;
  senderName?: string;
  senderPhotoURL?: string;
  type: 'text' | 'status_announcement';
  text: string;
  createdAt: Timestamp;
  statusType?: 'heading_there' | 'arrived' | 'completed' | 'cancelled';
}
```

### 3.3 Chat Analytics

```typescript
interface MatchChatAnalytics {
  matchId: string;
  activityType: string;
  matchCreatedAt: Timestamp;
  placeConfirmedAt?: Timestamp;
  endedAt: Timestamp;
  endReason: 'completed' | 'cancelled' | 'timeout_stale';
  user1Uid: string;
  user2Uid: string;
  // ... (volume, timing, telemetry fields as before)
}
```

---

## 4. Phase 1 — Location Decision

### 4.1 Candidate Fetching

- Hard cap: **9** | Soft min: **6**
- Radius fallback: 2km → 3km → 5km
- **Doc size note:** Keep `placeCandidates` lean (no photos, short descriptions)

**On match creation:**
- `matchFetchAllPlaces` writes `placeCandidates` + `locationDecision.expiresAt`
- Initialize `statusByUser[user1Uid] = 'pending'`
- Initialize `statusByUser[user2Uid] = 'pending'`

### 4.2-4.5 UI & Selection

(Same as v2.3 — dual-panel, rolling windows, selection behavior)

### 4.6 Resolution (Deterministic)

| Scenario | Result |
|----------|--------|
| Both same | That place |
| Tick used | That place |
| One chose | Their choice |
| Neither | Rank #1 |
| Both different | Lower rank → if equal, lexicographic `placeId` |

### 4.7-4.9 Server-Authoritative Resolution

(Same as v2.3 — idempotent, guarded, scheduled expiry)

---

## 5. Phase 2 — Meetup Chat

### 5.1 Message Constraints

| Constraint | Value |
|------------|-------|
| Per message | 100 words / 500 chars |
| Total cap | 400 |
| Rate | 1/sec, 10/30sec burst |

### 5.2 Idempotency (Duplicate Prevention)

**`chatSendMessage` accepts `clientMessageId` (UUID):**
1. Check if `clientMessageId` exists for sender in match
2. If exists → return success, do NOT increment counters
3. Else → write message + increment counters

**`matchSetPlaceChoice` idempotency:**
- If new choice equals current choice → do not increment `choiceChangedCount`

### 5.3-5.6 Status Buttons & Completion

(Same as v2.3 — forward-only with skip, per-user completion)

### 5.7 `endedAt` Timestamp

Set `endedAt = serverTimestamp()` when:
- `status` becomes `completed`, OR
- `status` becomes `cancelled`

Then: `chatPolicy.rawRetainUntil = endedAt + 24h`

---

## 6. Cancellation Rules

### 6.1 Normal Cancel

(Same as v2.3)

### 6.2 Stale Meetup Auto-Cancel

**Policy:** If `status ∈ {place_confirmed, in_meetup}` and `lastActivityAt` > 24h ago:
1. Set `status = 'cancelled'`
2. Set `cancelledBy = 'system'`
3. Set `endedAt = serverTimestamp()`
4. Write system announcement (optional)

**Scheduled job:** Runs hourly to detect and cancel stale meetups.

### 6.3 Incomplete Meetup Finalization

**If one user completed but other hasn't for 12h:**
- Set `endedAt` with `endReason = 'timeout_incomplete'`
- Keep `status = 'in_meetup'` (don't force completion)
- Allows retention cleanup to proceed

---

## 7. Write Permissions & Security

### 7.1 Client Can Only Call Functions

| Function | Writes |
|----------|--------|
| `matchSetPlaceChoice` | `placeChoiceByUser`, `telemetry.*` |
| `chatSendMessage` | `messages`, `chatCounters` |
| `chatSendStatus` | `statusByUser`, `messages` |
| `matchCancel` | `status`, `cancelledBy`, etc. |

### 7.2 Clients CANNOT Directly Write

- `messages` subcollection
- `confirmedPlace*` fields
- `chatCounters` / `telemetry`
- `placeChoiceByUser` (via rules)

### 7.3 Clients CAN Read

- `match` doc (all fields)
- `messages` subcollection (if `status ∈ {place_confirmed, in_meetup}`)

### 7.4 Security Rules (Pseudo)

```
match /matches/{matchId}:
  ALLOW read: if auth.uid in [user1Uid, user2Uid]
  DENY write: for all clients (function-only)

match /messages/{messageId}:
  ALLOW read: if auth.uid in [user1Uid, user2Uid] AND status in [place_confirmed, in_meetup]
  DENY write: for all clients (function-only)

match /analytics/*:
  DENY all: server-only
```

---

## 8. Backend Functions

| Function | Purpose |
|----------|---------|
| `matchFetchAllPlaces` | Writes candidates + expiresAt + initializes statusByUser |
| `matchSetPlaceChoice` | Idempotent choice + telemetry |
| `matchResolvePlaceIfNeeded` | Server-authoritative |
| `matchResolveExpired` | Scheduled expiry resolver |
| `chatSendMessage` | Idempotent via clientMessageId |
| `chatSendStatus` | Status + announcement |
| `matchCancel` | Sets endedAt |
| `staleMeetupCleaner` | Scheduled: cancels 24h-inactive |
| `incompleteGraceFinalizer` | Scheduled: sets endedAt for 12h-stale |
| `chatTransformAnalytics` | Transforms on match end |
| `chatDeleteRaw` | Deletes after 24h |

---

## 9. Frontend

### 9.1 Components

(Same as v2.3)

### 9.2 Terminal Routing Guards

```
If cancelled → "Meetup canceled" + Home CTA
If completed + no feedback → redirect /feedback
If completed + feedback → "Meetup completed"
If /meetup but location_deciding → redirect /match
```

---

## 10. Implementation Priority

### Phase 1 — Location (Week 1-2)
- [ ] `matchFetchAllPlaces` + statusByUser init
- [ ] Countdown + skew tolerance
- [ ] Server-authoritative resolution + scheduler
- [ ] Telemetry (idempotent increment)

### Phase 2 — Chat (Week 3-4)
- [ ] `chatSendMessage` with `clientMessageId` idempotency
- [ ] Counter enforcement
- [ ] Status buttons + completion
- [ ] `endedAt` on complete/cancel

### Phase 3 — Cleanup (Week 5)
- [ ] Stale meetup auto-cancel (24h)
- [ ] Incomplete grace finalizer (12h)
- [ ] Analytics transform
- [ ] Raw deletion
- [ ] Security rules (function-only writes)

---

## 11. Acceptance Criteria

- [ ] Clients call functions only, no direct writes
- [ ] Idempotency via `clientMessageId`
- [ ] `statusByUser` initialized on creation
- [ ] `endedAt` set on complete/cancel
- [ ] Stale auto-cancel after 24h inactivity
- [ ] `placeCandidates` lean (no photos)
- [ ] Security rules enforce function-only writes
