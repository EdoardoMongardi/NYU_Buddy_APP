# Canonical State Definitions

**Version:** 1.0
**Date:** 2026-02-07
**Purpose:** Single source of truth for all status values and state sets in NYU Buddy

---

## 1. Canonical Status Enums

### 1.1 Presence.status

| Value | Description | Notes |
|-------|-------------|-------|
| (no document) | Offline | User has no presence document in Firestore |
| `available` | Available for discovery | User is discoverable and can browse/send offers |
| `matched` | In active match | User is in an active match, hidden from discovery |

**Rationale:** These are the only three values written by the codebase. No additional statuses exist.

---

### 1.2 Offer.status

| Value | Description |
|-------|-------------|
| `pending` | Awaiting recipient response |
| `accepted` | Recipient accepted, match created |
| `declined` | Recipient declined |
| `expired` | TTL exceeded or user unavailable |
| `cancelled` | Cancelled by system cleanup |

**Rationale:** These values are written by `offerCreate`, `offerRespond`, `offerCancel`, and cleanup utilities.

---

### 1.3 Match.status

| Value | Description | Terminal? |
|-------|-------------|-----------|
| `pending` | Match created, awaiting place fetch | No |
| `location_deciding` | Users selecting meetup place (120s window) | No |
| `place_confirmed` | Place confirmed, users coordinating | No |
| `heading_there` | One or both users en route | No |
| `arrived` | One or both users arrived | No |
| `completed` | Both users confirmed meetup complete | **Yes** |
| `cancelled` | Match cancelled by user or system | **Yes** |

**Rationale:** These statuses are written by match creation, place resolution, status updates, and cancellation functions. `completed` and `cancelled` are terminal states (no further transitions allowed).

---

### 1.4 Match ResolutionReason

Used in `matches.locationDecision.resolutionReason`:

| Value | Description | Produced? |
|-------|-------------|-----------|
| `both_same` | Both users chose the same place | Yes |
| `one_chose` | Only one user chose a place | Yes |
| `none_chose` | Neither user chose (default to rank #1) | Yes |
| `rank_tiebreak` | Both chose different places (lower rank wins) | Yes |
| `tick_sync` | **PHANTOM** - Defined in type but never produced | **No** |

**Rationale:** `tick_sync` is defined in `resolvePlace.ts:24` but no code path produces this value. May be removed in Phase 2 or retained as reserved/unused.

---

## 2. Canonical Status Sets

### 2.1 ACTIVE_MATCH_STATUSES

**Definition:** Match statuses that indicate a user is in an "active match" and must be:
- Excluded from discovery (`suggestionGetCycle`, `suggestionGetTop1`)
- Blocked from creating new offers (`offerCreate`)
- Blocked from accepting new offers (`offerRespond`)

**Canonical Set:**
```typescript
['pending', 'location_deciding', 'place_confirmed', 'heading_there', 'arrived']
```

**Rationale:** These are all non-terminal match statuses. A user in any of these states is committed to an ongoing match and should not be discoverable or able to accept/create new matches.

**Usage:**
- `functions/src/offers/create.ts` — Double-match prevention guard
- `functions/src/offers/respond.ts` — Double-match prevention guard
- `functions/src/suggestions/getCycle.ts` — Discovery filter
- `functions/src/suggestions/getTop1.ts` — Discovery filter

**Important Constraint:**
- **Maximum 10 values** - Firestore `in` operator has a hard limit of 10 values per query
- Current array has 5 values (safe)
- Do NOT add more than 5 additional match statuses without refactoring the query pattern

---

### 2.2 TERMINAL_MATCH_STATUSES

**Definition:** Match statuses that indicate a match has reached a final state.

**Canonical Set:**
```typescript
['completed', 'cancelled']
```

**Rationale:** These statuses are treated as terminal by current transition logic. No intended forward transitions exist from these states. The `matchCancel` function guards against cancelling already-completed or already-cancelled matches (`functions/src/matches/cancel.ts:49-55`).

---

## 3. Phantom and Invalid Values

### 3.1 Historical Phantom Match Status: `in_meetup` (Fixed in Phase 1)

**Status:** ✅ **REMOVED** - No longer present in codebase as of Phase 1

**Historical Location:** Previously at `functions/src/suggestions/getCycle.ts:175`

**Issue (Pre-Phase 1):** Was referenced in active match filter but never written by any code path.

**Resolution:** Phase 1 replaced the hardcoded array containing `in_meetup` with the canonical `ACTIVE_MATCH_STATUSES` constant, which uses the correct statuses: `heading_there` and `arrived`.

**Historical Code Evidence:**
- Never was written in `matchCreate`, `updateMatchStatus`, or any other function
- Was not in the canonical Match.status enum
- Was a legacy/draft value that was never implemented

---

### 3.2 Phantom Resolution Reason: `tick_sync`

**Location:** `functions/src/matches/resolvePlace.ts:24` (type definition)

**Status:** Defined in TypeScript type but never produced by resolution algorithm.

**Canonical Treatment:** Documented as reserved/unused. May be removed in Phase 2 or retained for future use.

**Code Evidence:**
- Defined at line 24: `type ResolutionReason = 'both_same' | 'tick_sync' | ...`
- Never assigned in `resolveMatchPlaceAlgorithm` (lines 179-231)
- No code path currently produces this value

---

## 4. Known Field Naming Inconsistencies

### 4.1 Offers: `cancelReason`

**Collection:** `offers`
**Field:** `cancelReason`
**Backend Writes:** `functions/src/offers/cleanup.ts:28,46`
**Status:** Consistent (no mismatch)

---

### 4.2 Matches: `cancellationReason` vs `cancelReason`

**Collection:** `matches`
**Backend Writes:** `cancellationReason` (e.g., `functions/src/matches/cancel.ts:108`)
**Frontend Expects:** `cancelReason` (per `src/lib/hooks/useMatch.ts:22`)

**Issue:** Field name mismatch. Backend writes `cancellationReason`, but frontend TypeScript interface expects `cancelReason`.

**Impact:** Frontend will not correctly read the cancellation reason field.

**Phase 1 Action:** Document only. Fixing this requires changing either backend writes or frontend interface, which could affect behavior. Recommend fixing in Phase 2 (interface alignment).

---

## 5. Pre-Phase 1 Inconsistencies (Resolved)

**Note:** All inconsistencies listed below were resolved in Phase 1 by replacing hardcoded arrays with imports of the canonical `ACTIVE_MATCH_STATUSES` constant from `functions/src/constants/state.ts`.

### 5.1 Inconsistent Active Match Status Lists (Pre-Phase 1 State)

| File | Line | Status List | Issues |
|------|------|-------------|--------|
| `offers/create.ts` | 135 | `['pending', 'place_confirmed', 'heading_there', 'arrived']` | **Missing:** `location_deciding` |
| `offers/respond.ts` | 136 | `['pending', 'place_confirmed', 'heading_there', 'arrived']` | **Missing:** `location_deciding` |
| `suggestions/getCycle.ts` | 175 | `['pending', 'location_deciding', 'place_confirmed', 'in_meetup']` | **Phantom:** `in_meetup` <br> **Missing:** `heading_there`, `arrived` |
| `suggestions/getTop1.ts` | 249 | `['pending', 'heading_there', 'arrived']` | **Missing:** `location_deciding`, `place_confirmed` |

**Phase 1 Resolution:** All four files now import and use:
```typescript
import { ACTIVE_MATCH_STATUSES } from '../constants/state';
// ACTIVE_MATCH_STATUSES = ['pending', 'location_deciding', 'place_confirmed', 'heading_there', 'arrived']
```

---

## 6. Phase 1 Implementation Summary

### 6.1 Double-Match Prevention (Fixed)

**Pre-Phase 1 Issue:**
- `offers/create.ts:135` and `offers/respond.ts:136` were **MISSING** `location_deciding`
- **Bug Impact:** A user in `location_deciding` status could theoretically accept another offer or have an offer created for them, bypassing the double-match guard

**Phase 1 Resolution:** ✅ Both files now use `ACTIVE_MATCH_STATUSES` which includes `location_deciding`.

---

### 6.2 Discovery Filtering (Fixed)

**Pre-Phase 1 Issues:**
- `getCycle.ts:175` checked for phantom `in_meetup` status
- `getCycle.ts:175` and `getTop1.ts:249` had incomplete active status lists

**Bug Impact:** Users in certain active match states could appear in discovery, leading to failed offer attempts.

**Phase 1 Resolution:** ✅ All discovery filters now use the canonical `ACTIVE_MATCH_STATUSES` set.

---

## 7. Canonical Constants Module

All status sets should be imported from a centralized module:

**Location:** `functions/src/constants/state.ts`

**Exports:**
```typescript
export const ACTIVE_MATCH_STATUSES = [
  'pending',
  'location_deciding',
  'place_confirmed',
  'heading_there',
  'arrived',
] as const;

export const TERMINAL_MATCH_STATUSES = [
  'completed',
  'cancelled',
] as const;
```

**Usage:** Import in all files that perform match status checks.

---

## 8. Known System Limitations

### 8.1 Indefinite `pending` Matches

**Issue:** Matches can remain in `pending` status indefinitely if clients never call `matchFetchAllPlaces`.

**Lifecycle:**
1. Match created with `status: 'pending'` (via `offerCreate` or `offerRespond`)
2. Expected transition: `pending` → `location_deciding` via client-invoked `matchFetchAllPlaces`
3. **Problem:** No server-side timeout or scheduled job forces this transition

**When This Occurs:**
- User closes app immediately after match creation
- UI fails to trigger place fetching
- Client crashes before `matchFetchAllPlaces` call
- Network issues prevent function call

**Why `pending` Is Still "Active":**
- User presence is updated to `status: 'matched'` when match is created
- User is removed from discovery
- User cannot create/accept new offers
- Both users have committed to the match (offer accepted)

**Impact:**
- Database growth (stale `pending` matches accumulate)
- Users remain in "matched" presence state until manual intervention
- No automatic cleanup mechanism exists

**Current Behavior (Verified):**
- `pending` is correctly included in `ACTIVE_MATCH_STATUSES` (intentional)
- Double-match prevention works correctly
- Discovery filtering works correctly
- No immediate functional bug, but operational concern

**Phase 2 Recommendations:**
1. Add scheduled Cloud Function to auto-cancel `pending` matches after timeout (e.g., 15 minutes)
2. Add `matchedAt` timestamp check in scheduled job
3. Cancel with reason: `'timeout_pending'` or `'no_place_fetch'`
4. Restore user presence to `available` status
5. Document timeout value in constants

**Code References:**
- Match creation: `functions/src/offers/respond.ts:196-215`, `functions/src/offers/create.ts:188-207`
- Expected transition: `functions/src/matches/fetchPlaces.ts:157`
- No timeout mechanism: Verified via grep (no scheduled job for pending matches)

---

**END OF DOCUMENT**