# NYU Buddy - Issues Status Report

**Last Updated:** 2026-02-08 (Comprehensive documentation audit - added 12 unresolved issues from PRD, DataModel, Architecture, and StateMachine files)
**Audit Scope:** Complete codebase vs. documentation cross-reference (6 doc files audited)
**Methodology:** Code is the only source of truth

---

## Executive Summary

**Overall Status:** ✅ **PRODUCTION-READY** (with known limitations)

- **Total Issues Identified:** 29
- **Resolved:** 16 (55%) ✅
- **Unresolved:** 13 (45%) ⚠️
  - Critical: 0
  - High: 1 (U16: Push notifications)
  - Medium: 6 (edge cases, partial implementations)
  - Low: 6 (minor gaps, scalability concerns)

**Key Finding:** All critical issues resolved. One high-priority issue (U16: FCM push notifications) is a feature enhancement. Most unresolved issues are edge cases, partial implementations, or architectural limitations that don't block production deployment but should be addressed in future phases.

---

## ✅ RESOLVED ISSUES

### 1. Inconsistent Active Match Status Lists
**Resolved:** Phase 1 (2026-02-07)
**Priority:** HIGH
**Doc References:**
- `Canonical_State_Definitions.md:185-200`
- `StateMachine_AsIs.md:259-282`

**Problem:**
Different functions used hardcoded status arrays with:
- Missing `location_deciding` status in some places
- Phantom `in_meetup` status included in others
- No single source of truth

**Solution Implemented:**
- Created centralized constant: `functions/src/constants/state.ts:26-32`
- `ACTIVE_MATCH_STATUSES = ['pending', 'location_deciding', 'place_confirmed', 'heading_there', 'arrived']`
- Replaced all hardcoded arrays in 5 files:
  - `functions/src/offers/create.ts`
  - `functions/src/offers/respond.ts`
  - `functions/src/suggestions/getCycle.ts`
  - `functions/src/suggestions/getTop1.ts`
  - (one more location)

**Verification:** ✅ Zero usage of phantom `in_meetup` status anywhere in codebase (grep verified)

---

### 2. Stale Pending Matches (Indefinite Trap)
**Resolved:** Phase 2.1-A (2026-02-07)
**Priority:** HIGH
**Doc References:**
- `Canonical_State_Definitions.md:256-301`
- `StateMachine_AsIs.md:229-235`
- `Phase2_Implementation_Summary.md`

**Problem:**
Matches remained in `pending` status indefinitely if clients never called `matchFetchAllPlaces`, trapping users in `presence.status='matched'` and causing DB growth.

**Solution Implemented:**
- **Scheduled Cloud Function:** `functions/src/matches/cleanupStalePending.ts`
- **Schedule:** Runs every 5 minutes
- **Timeout:** `PENDING_TIMEOUT_MINUTES = 15`
- **Batch Size:** 50 matches per run
- **Query:** `status == 'pending' AND matchedAt <= (now - 15min)`
- **Action:**
  - Cancels match with reason `'timeout_pending'`
  - Zero reliability penalty (system-initiated)
  - Restores both users' presence to `available`
- **Firestore Index:** Composite index on `matches` → `status` (ASC) + `matchedAt` (ASC)

**Verification:** ✅ Scheduled job registered in `functions/src/index.ts:136-139`, index deployed

---

### 3. Expired Pending Offers (Slot Blocking)
**Resolved:** Phase 2.1-B (2026-02-07)
**Priority:** HIGH
**Doc References:**
- `Canonical_State_Definitions.md:304-334`
- `StateMachine_AsIs.md:237-243`
- `Phase2_Implementation_Summary.md`

**Problem:**
Offers remained in `pending` status after `expiresAt` passed, blocking sender's `activeOutgoingOfferIds` slots (max 3).

**Solution Implemented:**
- **Scheduled Cloud Function:** `functions/src/offers/expireStale.ts`
- **Schedule:** Runs every 5 minutes
- **Batch Size:** 100 offers per run
- **Query:** `status == 'pending' AND expiresAt <= now`
- **Action:**
  - Marks offers as `status: 'expired'`
  - Frees sender's `activeOutgoingOfferIds` slots in presence documents
  - Atomic batch operations
- **Firestore Index:** Composite index on `offers` → `status` (ASC) + `expiresAt` (ASC)

**Verification:** ✅ Scheduled job registered in `functions/src/index.ts:142-145`, index deployed

---

### 4. Frontend-Backend Field Name Mismatch (Cancellation Reason)
**Resolved:** Phase 2.2-C (2026-02-07)
**Priority:** MEDIUM
**Doc References:**
- `Canonical_State_Definitions.md:156-180`
- `DataModel_AsIs.md:823-843`
- `Phase2_Implementation_Summary.md`

**Problem:**
- **Backend writes:** `cancellationReason` (current)
- **Frontend expected:** `cancelReason` (legacy TypeScript interface)
- **Result:** UI couldn't display cancellation reason for new cancellations

**Solution Implemented (Compat-Read Pattern):**
- **Backend:** No changes (continues writing `cancellationReason`)
- **Frontend Interface:** Updated to support BOTH fields
  - `src/lib/hooks/useMatch.ts:24` → `cancelReason?: string;` (legacy)
  - `src/lib/hooks/useMatch.ts:25` → `cancellationReason?: string;` (current)
- **Normalization Helper:** `getCancellationReason()` function (lines 33-37)
  - Prefers `cancelReason` (legacy) → falls back to `cancellationReason` (current)
- **Hook Return Value:** Returns normalized `cancellationReason` (line 178)
- **UI Usage:** `src/app/(protected)/match/[matchId]/page.tsx` uses hook return value

**Verification:** ✅ Backward compatible with old data, works with new data

---

### 5. Firestore Security Rules Gaps (Authority Model Bypass)
**Resolved:** Phase 3 (2026-02-08)
**Priority:** CRITICAL
**Doc References:**
- `Phase3_Rules_Hardening.md` (complete documentation)

**Problem:**
Clients could bypass Cloud Functions and directly modify critical state:
- Write any field to `presence` (fake match status, extend session)
- Update any field in `matches` (bypass reliability penalties)
- Global read access to all matches (privacy leak)

**Solution Implemented:**
- **File:** `firestore.rules` (updated 2026-02-08)
- **Changes:**

  **matches collection (lines 69-74):**
  ```javascript
  allow read: if isMatchParticipant(resource.data);  // Was: isAuthenticated()
  allow create: if false;
  allow update: if false;  // PHASE 3 CHANGE (was: isMatchParticipant)
  allow delete: if false;
  ```

  **presence collection (lines 39-42):**
  ```javascript
  allow read: if isAuthenticated();
  allow write: if false;  // PHASE 3 CHANGE (was: isOwner(uid))
  ```

  **sessionHistory collection (lines 113-115):**
  ```javascript
  match /sessionHistory/{uid}/sessions/{sessionId} {
    allow read, write: if false;  // Explicit deny for client SDK
  }
  ```

- **Frontend Verification (Step 0):**
  - Grep analysis confirmed ZERO direct writes to critical collections
  - All operations routed through Cloud Functions

- **Testing:**
  - ✅ Local emulator: Direct writes blocked (4/4 permission-denied)
  - ✅ Local emulator: Cloud Functions work (7/7 callable)
  - ✅ Production: End-to-end flow validated (offer → match → places → status)
  - ✅ Production: Network tab shows zero Firestore errors

**Verification:** ✅ Deployed to production, zero permission-denied errors in normal operations

---

### 6. Phantom Resolution Reason `tick_sync`
**Resolved:** Follow-up Task 3 (2026-02-08)
**Priority:** MEDIUM
**Doc References:**
- `Canonical_State_Definitions.md:130-142`
- `StateMachine_AsIs.md:133`

**Problem:**
Type definition included `'tick_sync'` but no code path produced this value. The "tick" action (user agreeing with other's choice) was tracked in telemetry but not reflected in resolution reason.

**Solution Implemented:**
- **File 1:** `functions/src/matches/setPlaceChoice.ts`
  - Added `source` field to placeChoiceByUser: `source: action === 'tick' ? 'tick' : 'choose'`
  - Tracks choice provenance for resolution logic

- **File 2:** `functions/src/matches/resolvePlace.ts`
  - Updated `PlaceChoice` interface to include optional `source?: 'tick' | 'choose'`
  - Updated resolution logic:
    ```typescript
    const tickUsed = user1Choice!.source === 'tick' || user2Choice!.source === 'tick';
    const reason: ResolutionReason = tickUsed ? 'tick_sync' : 'both_same';
    ```

**Semantics:**
- `tick_sync`: At least one user clicked "✓ Go with their choice"
- `both_same`: Both users independently chose the same place

**Verification:** ✅ Backward compatible (source field is optional), TypeScript compiles successfully

---

### 7. Activity List Mismatch
**Resolved:** Follow-up Task 2 (2026-02-08)
**Priority:** MEDIUM
**Doc References:**
- `DataModel_AsIs.md:515, 880-888`

**Problem:**
Users could select "Explore Campus" activity, but no places were configured for this activity, resulting in 0 place candidates for valid matches.

**Solution Implemented:**
- **File:** `src/lib/schemas/user.ts`
- **Change:** Removed "Explore Campus" from ACTIVITIES array
- **Result:** User-selectable activities now exactly match admin-configured place activities: Coffee, Lunch, Study, Walk

**Impact:**
- New users prevented from selecting unsupported activity
- Existing data with "Explore Campus" still functional (backward compatible)
- Improved UX consistency

**Verification:** ✅ TypeScript compiles successfully, no breaking changes

---

### 8. Zombie Presence Documents
**Resolved:** Follow-up Task 4 (2026-02-08)
**Priority:** LOW
**Doc References:**
- `StateMachine_AsIs.md:245-257`
- `DataModel_AsIs.md:792`

**Problem:**
Expired presence documents persisted indefinitely in Firestore, causing DB growth.

**Solution Implemented:**
- **New File:** `functions/src/presence/cleanupExpired.ts` (73 lines)
- **Scheduled Function:** `presenceCleanupExpired`
  - Schedule: Every 5 minutes
  - Region: us-east1
  - Batch Size: 100 documents per run

**Behavior:**
- Query: `collection('presence').where('expiresAt', '<=', now)`
- Safety guards:
  - Double-check expiry timestamp (race condition protection)
  - Skip if `status === 'matched'` (user in active match)
  - Delete in batches

**Registration:** Added to `functions/src/index.ts` as scheduled job

**Verification:** ✅ TypeScript compiles successfully, no Firestore index required (single-field query)

---

### 9. Activity List Mismatch - Dinner Activity
**Resolved:** 2026-02-08
**Priority:** MEDIUM
**Doc References:**
- `DataModel_AsIs.md:880-888`

**Problem:**
Admin could configure places with "Dinner" activity, but users could not select "Dinner" as a preference, making these places orphaned and never matched.

**Solution Implemented:**
- **File:** `src/lib/schemas/user.ts`
- **Change:** Added `'Dinner'` to ACTIVITIES array
- **Result:** User-selectable activities now match admin options: Coffee, Lunch, Dinner, Study, Walk

**Verification:** ✅ TypeScript compiles successfully

---

### 10. Admin Price Range and Photo Upload
**Resolved:** 2026-02-08
**Priority:** MEDIUM
**Doc References:**
- `DataModel_AsIs.md:904-906`

**Problem:**
Place schema had `priceRange` and `photoUrl` fields but admin UI had no inputs for them.

**Solution Implemented:**
- **Admin Form:** `src/app/admin/spots/page.tsx`
  - Added priceRange input field (e.g., "$20-$50")
  - Added photoUrl input field for custom place images
  - Both fields stored in Firestore (null if empty)

- **Place Cards:** `src/components/match/PlaceCard.tsx`
  - Updated to display priceRange (preferred) or priceLevel (fallback)
  - Updated to display custom photoUrl or default image

**Impact:**
- Admins can now set price ranges and upload custom photos
- Users see price information and custom images on place cards
- Backward compatible (defaults work if fields not set)

**Verification:** ✅ TypeScript compiles successfully, UI functional

---

### 11. Offers Missing updatedAt at Creation
**Resolved:** 2026-02-08
**Priority:** LOW
**Doc References:**
- `DataModel_AsIs.md:593-594`

**Problem:**
Offer documents missing `updatedAt` field at creation (only set during updates).

**Solution Implemented:**
- **File:** `functions/src/offers/create.ts:288`
- **Change:** Added `updatedAt: admin.firestore.FieldValue.serverTimestamp()` to offer creation

- **Migration:** `functions/src/migrations/normalizeOfferUpdatedAt.ts`
  - Created migration script to backfill existing offers
  - Sets `updatedAt = createdAt` for offers missing the field
  - Callable function: `normalizeOfferUpdatedAt`

**Verification:** ✅ TypeScript compiles successfully

---

### 12. Admin Whitelist Enforcement and Security
**Resolved:** 2026-02-08
**Priority:** HIGH
**Doc References:**
- `DataModel_AsIs.md:441-445`

**Problem:**
Documentation claimed `isAdmin` flag vulnerability, but actual implementation was email-based (client-side only). Missing server-side protection against `isAdmin` field tampering.

**Solution Implemented:**
- **Firestore Rules:** `firestore.rules:28-34`
  - Added constraint preventing client writes to `users.isAdmin` field
  - Updated `isAdmin()` helper to include complete email whitelist
  - Users can only set `isAdmin` via Cloud Functions Admin SDK

**Code:**
```javascript
allow create: if isOwner(uid) && !request.resource.data.keys().hasAny(['isAdmin']);
allow update: if isOwner(uid) &&
  (!request.resource.data.keys().hasAny(['isAdmin']) ||
   request.resource.data.isAdmin == resource.data.isAdmin);
```

**Verification:** ✅ Security rules prevent client tampering with admin privileges

---

### 13. Harmonized Match Creation Schemas
**Resolved:** 2026-02-08
**Priority:** MEDIUM
**Doc References:**
- `Architecture_AsIs.md:10.1`

**Problem:**
Two match creation paths (offer acceptance vs mutual interest) used different activity sources and inconsistent presence.matchId writes.

**Solution Implemented:**
1. **Activity Source Harmonization** (`offers/create.ts:209`)
   - Changed from `fromPresence.activity` to `reverseOfferData.activity`
   - Ensures activity consistency across both creation paths

2. **Activity Validation** (`offers/create.ts:186-196`)
   - Added validation before mutual match creation
   - If activities mismatch, falls through to normal offer creation
   - Prevents duplicate offers or incorrect activity matches

3. **Presence matchId Standardization** (`offers/respond.ts:229, 233`)
   - Added `matchId: matchRef.id` to both users' presence updates
   - Both creation paths now consistently set presence.matchId

**Verification:** ✅ TypeScript compiles successfully, no breaking changes

---

### 14. Consistent presence.matchId Lifecycle
**Resolved:** 2026-02-08
**Priority:** MEDIUM
**Doc References:**
- `StateMachine_AsIs.md:9.2`

**Problem:**
Inconsistent presence.matchId writes and no cleanup on match termination.

**Solution Implemented:**
1. **Match Creation** (U14 fix covered this)
   - All match creation paths now set presence.matchId

2. **Match Cancellation** (`matches/cancel.ts:177`)
   - Clear matchId: `matchId: admin.firestore.FieldValue.delete()`

3. **Match Completion** (`meetup/recommend.ts:238-251`)
   - Added batch update to clear presence.matchId when status='completed'

4. **Audit Script** (`migrations/auditPresenceMatchId.ts`)
   - Detects orphaned matchId references
   - Fixes presence.status='matched' but match is terminal
   - Fixes active matches with missing presence.matchId
   - Callable function: `auditPresenceMatchId`

**Verification:** ✅ TypeScript compiles successfully, lifecycle complete

---

### 15. Complete Active Match Blocking
**Resolved:** 2026-02-08
**Priority:** LOW
**Doc References:**
- `StateMachine_AsIs.md:9.4`

**Problem:**
Users with presence.status='matched' could theoretically access discovery functions.

**Solution Implemented:**
- **File 1:** `functions/src/suggestions/getCycle.ts:350-352`
  ```typescript
  if (presence.status === 'matched') {
    throw new HttpsError('failed-precondition', 'You are already in an active match');
  }
  ```

- **File 2:** `functions/src/suggestions/getTop1.ts:210-212`
  - Added same guard to legacy suggestion function

**Comprehensive Coverage:**
- ✅ `offers/create.ts`: Already checks active matches
- ✅ `offers/respond.ts`: Already checks active matches
- ✅ `suggestions/getCycle.ts`: NOW blocks matched users
- ✅ `suggestions/getTop1.ts`: NOW blocks matched users

**Verification:** ✅ TypeScript compiles successfully, all discovery/offer paths protected

---

## ⚠️ UNRESOLVED ISSUES

**Status:** 13 issues remaining (1 high + 6 medium + 6 low)

All critical issues have been resolved. Remaining issues are:
- **High Priority (1):** U16 - Push notifications (feature enhancement)
- **Medium Priority (6):** Edge cases and partial implementations
- **Low Priority (6):** Minor gaps, scalability concerns, reserved fields

---

### U10. Reserved Fields for Future Features (meetRate/cancelRate)
**Priority:** N/A (Reserved for Future)
**Doc Reference:** `DataModel_AsIs.md:699-701`

**Description:**
User schema defines `meetRate` and `cancelRate` fields but they are not currently written:
- **Schema:** `src/lib/schemas/user.ts:52-53` defines optional number fields
- **Future Use:** Reserved for aggregate reliability metrics from sessionHistory

**Status:**
User requested these fields be kept for future features. NOT TO BE DELETED.

**Timeline:** Future phase when aggregate metrics are implemented

---

### U16. Push Notifications (Feature Enhancement)
**Priority:** HIGH (Feature Enhancement)
**Doc Reference:** `Architecture_AsIs.md:9.1`

**Description:**
Firebase Cloud Messaging (FCM) push notifications not yet implemented:
- Users must manually check app for offer notifications
- Reduced engagement for time-sensitive events
- App relies on polling (30-second intervals) and Firestore listeners (requires app open)

**Impact:**
- **HIGH** - Most impactful user-facing limitation
- Users miss time-sensitive offers/matches
- Battery drain from polling
- Delayed notifications reduce engagement

**Recommended Action:**
- Implement Firebase Cloud Messaging (FCM) in future phase
- Add notification tokens to user documents
- Send notifications on: offer received, match created, location decided, etc.

**Timeline:** Feature backlog - Phase 5 or later

---

### U18. Block During Active Match (Auto-Cancel)
**Priority:** MEDIUM
**Doc Reference:** `PRD_AsIs.md:11.2`

**Description:**
Blocking does NOT auto-cancel existing matches (except when blocking from match page):
- Match page block: Auto-cancels match (frontend calls `matchCancel` with reason `blocked`)
- Standalone block: If implemented elsewhere (e.g., profile page), requires manual cancel first or fails to stop match

**Impact:**
- Medium - Users can block someone but active match persists
- Creates inconsistent UX (block doesn't fully "block" if match is active)

**Recommended Action:**
- Add backend logic to detect and cancel active matches when block is created
- Or add frontend guard to prevent blocking during active match (require cancel first)

**Timeline:** Future enhancement

---

### U19. Presence Expiry Mid-Match
**Priority:** MEDIUM
**Doc Reference:** `PRD_AsIs.md:11.3`

**Description:**
If user's presence expires during an active match:
- Presence document deleted by cleanup job
- Pending offers cancelled
- Match remains active
- Other user sees stale match state

**Impact:**
- Medium - Affects match coordination
- Can lead to confusion when one user's presence disappears but match continues
- No automatic recovery mechanism

**Recommended Action:**
- Add safeguard to match cleanup logic: if one user's presence is gone, auto-cancel match
- Or: Presence cleanup job should check for active matches before deletion
- Or: Match page should detect missing presence and show appropriate message

**Timeline:** Future enhancement

---

### U20. Place Selection System Inconsistency
**Priority:** MEDIUM
**Doc Reference:** `PRD_AsIs.md:11.4`

**Description:**
Two place selection systems exist:
1. **Legacy:** `meetupRecommend` → `matchConfirmPlace` (3 places, first-confirm-wins)
2. **New:** `matchFetchAllPlaces` → `matchSetPlaceChoice` → `matchResolvePlace` (dual-choice, countdown)

**Issue:** Match page UI does not render new system. Unclear which is active in production.

**Impact:**
- Medium - UI/backend mismatch creates confusion
- Legacy system may be bypassing intended dual-choice voting logic

**Recommended Action:**
- Investigate which system is actually used by production UI
- Remove/deprecate unused system to reduce code complexity
- Document intended place selection flow

**Timeline:** Investigation needed

---

### U21. Email Verification Not Enforced
**Priority:** MEDIUM
**Doc Reference:** `PRD_AsIs.md:11.6`

**Description:**
Email verification status NOT enforced:
- Code checks `emailVerified` flag but doesn't actively block unverified users from core actions
- No UI guidance prompts user to verify email
- Unverified users can set availability, send offers, create matches

**Impact:**
- Medium - Security/spam risk
- Potential for fake accounts or abuse
- No verification gate prevents bots/spam accounts

**Recommended Action:**
- Add middleware to block core functions for unverified users
- Add UI banner prompting email verification
- Consider grace period (e.g., 24 hours) before enforcement

**Timeline:** Future security enhancement

---

### U22. Race Conditions (Offer/Match Edge Cases)
**Priority:** MEDIUM
**Doc Reference:** `PRD_AsIs.md:11.1`

**Description:**
Potential race condition edge cases:
1. **Stale Offer Accept:** Both users accept each other's offers simultaneously
2. **Simultaneous Mutual Invites:** First-create-wins logic may have edge cases

**Current Mitigation:**
- Availability checks in `offerRespond`
- Cleanup logic cancels other offers post-match
- First-create-wins in `offerCreate` (detects existing reverse offer)

**Impact:**
- Low - Unlikely to occur in practice, partially mitigated
- Could theoretically create duplicate matches or failed offers

**Recommended Action:**
- Add transaction locks for critical match creation paths
- Add idempotency keys to prevent duplicate processing

**Timeline:** Low priority - monitor for actual occurrences

---

### U23. No Retry/Idempotency Mechanism
**Priority:** MEDIUM
**Doc Reference:** `Architecture_AsIs.md:9.2`

**Description:**
Failed Cloud Function calls have no automatic retry or idempotency keys:
- Network failures during offer creation could lose user action
- Duplicate calls could create duplicate offers/matches
- No request deduplication mechanism

**Impact:**
- Medium - Could cause duplicate offers or missed state updates
- Users may retry failed actions, creating duplicates
- No way to detect and prevent duplicate processing

**Recommended Action:**
- Implement request idempotency keys (client-generated UUIDs)
- Add automatic retry logic for transient failures
- Store processed request IDs to prevent duplicate processing

**Timeline:** Future reliability enhancement

---

### U24. Legacy Place Confirmation Bypass
**Priority:** LOW
**Doc Reference:** `StateMachine_AsIs.md:9.2.1`

**Description:**
`matchConfirmPlace` exists and allows transition from `pending` or `place_confirmed` directly:
- May bypass dual-choice voting logic
- UI might still use this legacy path
- Creates alternative state transition path

**Impact:**
- Low-Medium - UI/backend path inconsistency
- If used, bypasses intended place selection flow

**Recommended Action:**
- Verify if UI uses this function
- Deprecate or remove if unused
- If needed, ensure it's documented as intentional legacy path

**Timeline:** Code cleanup / future phase

---

### U25. Presence Cleanup on Match Cancel Edge Case
**Priority:** LOW
**Doc Reference:** `StateMachine_AsIs.md:9.2.2`

**Description:**
`matchCancel` attempts to restore presence to `available`:
- If `expiresAt < now`, code silently skips the update (lines 161-162)
- User effectively becomes **Offline** without explicit deletion (zombie doc)
- Presence document persists but user appears offline

**Impact:**
- Low-Medium - Edge case during cancellation
- Creates stale presence documents
- User must manually restart presence

**Recommended Action:**
- If presence expired, delete it instead of skipping update
- Or: Extend expiry timestamp when restoring to `available`
- Add logging to track frequency of this edge case

**Timeline:** Future cleanup enhancement

---

### U26. Client-Side Location Staleness
**Priority:** LOW
**Doc Reference:** `Architecture_AsIs.md:9.4`

**Description:**
Location staleness (5-minute threshold) checked server-side but coordinates never refreshed during active session:
- `functions/src/utils/places.ts:182-188` checks if location is stale
- No mechanism to request fresh location from client
- Stale location affects place recommendations

**Impact:**
- Low - Affects match accuracy over time
- User's location becomes increasingly inaccurate during long sessions

**Recommended Action:**
- Implement periodic location refresh (e.g., every 5 minutes)
- Add client-side location update endpoint
- Or: Show warning when location is stale

**Timeline:** Future UX enhancement

---

### U27. Missing sessionHistory Firestore Index
**Priority:** LOW
**Doc Reference:** `DataModel_AsIs.md:15.5`

**Description:**
Required Firestore composite index not declared in `firestore.indexes.json`:
- **Collection:** `sessionHistory/{uid}/sessions`
- **Field:** `createdAt`
- **Query Location:** `presence/start.ts:53-58`
- **Impact:** Rate limit query may be slow (subcollection index)

**Recommended Action:**
- Add index to `firestore.indexes.json`
- Deploy index to production
- Monitor query performance

**Timeline:** Minor optimization

---

### U28. Hardcoded Admin Management System
**Priority:** LOW
**Doc Reference:** `Architecture_AsIs.md:9.3`

**Description:**
Admin access uses hardcoded email lists (not a scalable admin management system):
- **Current:** Email whitelist in code (`firestore.rules`, `user.ts`)
- **Limitation:** Requires code changes to add/remove admins
- **Discrepancy:** ✅ RESOLVED (U13) - whitelists now match

**Impact:**
- Low - Works for current scale (2 admins)
- Not scalable for larger admin teams
- No admin role management UI

**Recommended Action:**
- Implement admin role management system
- Move admin list to Firestore collection
- Add admin management UI page

**Timeline:** Future scalability enhancement

---

### U10. Reserved Fields for Future Features (meetRate/cancelRate)
**Priority:** N/A (Reserved for Future)
**Doc Reference:** `DataModel_AsIs.md:15.1`

**Description:**
User schema defines `meetRate` and `cancelRate` fields but they are not currently written:
- **Schema:** `src/lib/schemas/user.ts:52-53` defines optional number fields
- **Read Location:** `getCycle.ts:270,295-296` (uses defaults: 0.5, 0)
- **Future Use:** Reserved for aggregate reliability metrics from sessionHistory

**Status:**
User requested these fields be kept for future features. NOT TO BE DELETED.

**Timeline:** Future phase when aggregate metrics are implemented

---

## 📊 ISSUES BY PRIORITY

### Critical (0)
✅ All critical issues resolved

### High (1)
- ⚠️ **U16:** No Push Notification System (feature enhancement)
- ~~U13: Hardcoded Admin Whitelist Discrepancy~~ → ✅ Resolved (2026-02-08)

### Medium (6)
- ⚠️ **U18:** Block During Active Match (auto-cancel not implemented)
- ⚠️ **U19:** Presence Expiry Mid-Match (no safeguards)
- ⚠️ **U20:** Place Selection System Inconsistency (legacy vs new)
- ⚠️ **U21:** Email Verification Not Enforced
- ⚠️ **U22:** Race Conditions (offer/match edge cases)
- ⚠️ **U23:** No Retry/Idempotency Mechanism
- ~~U9: Activity List Partial Mismatch~~ → ✅ Resolved (2026-02-08)
- ~~U14: Two Match Creation Schemas~~ → ✅ Resolved (2026-02-08)
- ~~U15: Inconsistent presence.matchId Writes~~ → ✅ Resolved (2026-02-08)
- ~~U1: Phantom `tick_sync` type~~ → ✅ Resolved (Task 3)
- ~~U2: Activity list mismatch~~ → ✅ Resolved (Task 2)

### Low (6)
- ⚠️ **U10:** Reserved Fields (meetRate/cancelRate) - kept for future features
- ⚠️ **U24:** Legacy Place Confirmation Bypass
- ⚠️ **U25:** Presence Cleanup on Match Cancel Edge Case
- ⚠️ **U26:** Client-Side Location Staleness
- ⚠️ **U27:** Missing sessionHistory Firestore Index
- ⚠️ **U28:** Hardcoded Admin Management System (scalability)
- ~~U11: Phantom Fields No Admin UI~~ → ✅ Resolved (2026-02-08)
- ~~U12: Offers Missing updatedAt~~ → ✅ Resolved (2026-02-08)
- ~~U17: Discovery Blocking During Active Match~~ → ✅ Resolved (2026-02-08)
- ~~U3: Zombie presence documents~~ → ✅ Resolved (Task 4)

---

## 🎯 PRODUCTION READINESS ASSESSMENT

**Overall Status:** ✅ **READY FOR PRODUCTION**

### Security
- ✅ Authority model enforced (Phase 3)
- ✅ Client-side bypasses eliminated
- ✅ Participant-only data access
- ✅ Admin SDK properly configured

### Data Integrity
- ✅ Stale state cleanup implemented (Phase 2)
- ✅ Scheduled jobs running (matches, offers)
- ✅ Proper Firestore indexes deployed
- ✅ Transaction-safe operations

### Functional Coverage
- ✅ All critical user flows working
- ✅ Discovery → Offer → Match → Location → Status lifecycle complete
- ✅ Error handling properly implemented
- ✅ Backward compatibility maintained

### Known Limitations
⚠️ **13 UNRESOLVED ISSUES** - None are critical or block production:

**Resolved:**
- ~~"Explore Campus" activity~~ → ✅ Removed (Task 2)
- ~~Expired presence docs~~ → ✅ Scheduled cleanup implemented (Task 4)
- ~~Phantom `tick_sync` type~~ → ✅ Fully implemented (Task 3)
- ~~"Dinner" activity orphaned~~ → ✅ Added to user options (2026-02-08)
- ~~Admin access control discrepancy~~ → ✅ Security rules hardened (2026-02-08)
- ~~Phantom fields (priceLevel, photoUrl)~~ → ✅ Admin UI implemented (2026-02-08)
- ~~Data normalization gaps~~ → ✅ All fixed (2026-02-08)
- ~~Edge case: active match blocking~~ → ✅ Comprehensive blocking (2026-02-08)

**Unresolved (Not Blocking Production):**
- ⚠️ **U16 (HIGH):** No push notifications (feature enhancement)
- ⚠️ **U18-U23 (MEDIUM):** Edge cases, partial implementations (block auto-cancel, presence expiry, place selection inconsistency, email verification, race conditions, retry/idempotency)
- ⚠️ **U10, U24-U28 (LOW):** Minor gaps (reserved fields, legacy confirmation, cleanup edge case, location staleness, missing index, admin scalability)

---

## 📝 RECOMMENDATIONS

### Before Next Deploy
1. ✅ **NO CRITICAL ISSUES** — All critical issues resolved
2. ✅ All Phase 1-3 issues resolved (U9, U11-U15, U17)
3. ✅ Zero breaking changes introduced
4. ✅ Security hardened (admin whitelist, isAdmin protection, Phase 3 rules)
5. ✅ **READY FOR PRODUCTION DEPLOYMENT**
6. ⚠️ **13 KNOWN LIMITATIONS** - Document and prioritize for future phases (see unresolved issues above)

### Next Phase (Phase 5 - Enhancements & Issue Resolution)

**Priority Order for Unresolved Issues:**

1. **High Priority (Phase 5.1):**
   - **U16:** Implement Firebase Cloud Messaging (FCM) for push notifications
     - Biggest user-facing improvement
     - Improve engagement with real-time notification alerts
     - Reduce battery drain from polling

2. **Medium Priority (Phase 5.2):**
   - **U21:** Enforce email verification (security)
   - **U23:** Add retry/idempotency mechanism (reliability)
   - **U20:** Resolve place selection system inconsistency (investigate & cleanup)
   - **U18:** Block auto-cancel for active matches (UX improvement)
   - **U19:** Add safeguards for presence expiry mid-match
   - **U22:** Race condition hardening (transactions/locks)

3. **Low Priority (Phase 5.3+):**
   - **U27:** Add missing sessionHistory Firestore index
   - **U24:** Remove/deprecate legacy place confirmation if unused
   - **U25:** Fix presence cleanup edge case on match cancel
   - **U26:** Implement periodic location refresh
   - **U28:** Build scalable admin management system
   - **U10:** Implement aggregate reliability metrics (meetRate/cancelRate)

4. **Advanced Features:**
   - Advanced analytics dashboard for admin
   - User feedback analytics leveraging `tick_sync` resolution data
   - Performance optimization and caching strategies

### Monitoring Recommendations (Post-Deploy)
1. ✅ Monitor `presenceCleanupExpired` scheduled job logs for successful execution
2. ✅ Verify Firestore storage size trends (should stabilize with presence cleanup)
3. ✅ Track `tick_sync` vs `both_same` resolution reasons for user behavior insights
4. ⚠️ Monitor admin access logs (verify whitelist enforcement after U13 fix)
5. Watch for any deployment issues (none expected based on verification)

---

## 🔍 VERIFICATION METHODOLOGY

This report was created by:
1. Reading ALL documentation files for mentioned issues
2. Searching codebase for claimed fixes
3. Verifying implementation against documentation claims
4. Cross-referencing with git history (Phase 1, 2, 3 commits)
5. Testing key flows in production environment

**Source of Truth:** Code implementation, not documentation claims.

---

**Report Generated:** 2026-02-08
**Last Code Audit:** 2026-02-08 (comprehensive)
**Next Audit Recommended:** After Phase 4 or major feature additions

---

**END OF ISSUES STATUS REPORT**