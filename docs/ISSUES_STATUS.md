# NYU Buddy - Issues Status Report

**Last Updated:** 2026-02-08
**Audit Scope:** Complete codebase vs. documentation cross-reference
**Methodology:** Code is the only source of truth

---

## Executive Summary

**Overall Status:** ✅ **PRODUCTION-READY**

- **Total Issues Identified:** 8
- **Resolved:** 5 (62.5%)
- **Unresolved:** 3 (37.5%)
  - Critical: 0
  - High: 0
  - Medium: 2
  - Low: 1

**Key Finding:** All critical and high-priority issues have been resolved through Phases 1, 2, and 3. Remaining issues are known limitations with minimal functional impact.

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

## ⚠️ UNRESOLVED ISSUES

### U1. Phantom Resolution Reason `tick_sync`
**Priority:** MEDIUM (Type Safety Only)
**Doc References:**
- `Canonical_State_Definitions.md:130-142`
- `StateMachine_AsIs.md:133`

**Description:**
Type definition includes `'tick_sync'` but no code path produces this value:
- **Type:** `functions/src/matches/resolvePlace.ts:24`
  ```typescript
  type ResolutionReason = 'both_same' | 'tick_sync' | 'one_chose' | 'none_chose' | 'rank_tiebreak';
  ```
- **Reality:** Resolution algorithm (lines 187-230) only produces: `'both_same'`, `'one_chose'`, `'none_chose'`, `'rank_tiebreak'`
- **Never written:** Zero assignments to `'tick_sync'` anywhere in codebase

**Impact:**
- **Functional:** None (never produced, never stored in DB)
- **Type Safety:** Misleading type definition

**Root Cause:**
Listed as "reserved/unused" in documentation. Phase 2 explicitly deferred phantom field resolution.

**Recommended Action:**
- **Option 1:** Remove `'tick_sync'` from type (if truly unused)
- **Option 2:** Document as "reserved for future feature X"
- **Option 3:** Implement the deferred functionality

**Timeline:** Can defer to Phase 4 or future iteration

---

### U2. Activity List Mismatch (Places vs Users)
**Priority:** MEDIUM (User Experience)
**Doc References:**
- `DataModel_AsIs.md:515, 880-888`

**Description:**
User-facing activity options don't align with admin-configured place activities:
- **Users can select:** `'Coffee'`, `'Study'`, `'Lunch'`, `'Explore Campus'`, etc.
  - Source: `src/lib/schemas/user.ts:77-83`
- **Admin can tag places with:** `'Coffee'`, `'Study'`, `'Lunch'`, `'Dinner'`, etc.
  - Source: `src/app/admin/spots/page.tsx:72-83`
- **Mismatch:**
  - Users can select `'Explore Campus'` → No places available (0 results)
  - Places can be tagged `'Dinner'` → Users cannot select this activity

**Impact:**
- Users selecting "Explore Campus" will match with others but receive 0 place candidates
- `matchFetchAllPlaces` will return empty array
- Not a crash/error, but poor UX

**Current Filtering Logic:**
`functions/src/utils/places.ts:133-136` filters by exact `allowedActivities` match.

**Recommended Action:**
- **Option 1:** Add `'Explore Campus'` to admin place activity options (preferred)
- **Option 2:** Remove `'Explore Campus'` from user-facing options
- **Option 3:** Add default "outdoor" places that work for "Explore Campus"

**Timeline:** Next iteration (not blocking for production)

---

### U3. Zombie Presence Documents (Expired Sessions)
**Priority:** LOW (Operational)
**Doc References:**
- `StateMachine_AsIs.md:245-257`
- `DataModel_AsIs.md:792`

**Description:**
Expired presence documents persist in Firestore until:
- User manually calls `presenceEnd`, OR
- User triggers lazy cleanup via `suggestionGetCycle`

**Current Behavior:**
- **Lazy Cleanup:** `functions/src/suggestions/getCycle.ts:342-344` (self-cleanup on query)
- **Passive Filtering:** Various functions check `expiresAt < now` at query time
- **No Scheduled Job:** Unlike offers/matches, presence has no scheduled cleanup
- **Documents Persist:** Marked as expired but never deleted

**Impact:**
- **Functional:** Minimal (expired docs filtered out in queries)
- **Operational:** DB growth over time
- **Cost:** Slight increase in Firestore storage costs

**Current Mitigation:**
- Discovery queries exclude expired presence
- Lazy cleanup works for active users
- Not a data integrity issue

**Recommended Action:**
- **Phase 4:** Implement scheduled cleanup job (similar to offer/match cleanup)
- **Or:** Implement TTL-based deletion (if Firestore adds this feature)
- **Or:** Accept as operational limitation if DB growth is negligible

**Timeline:** Monitor DB size; implement if growth becomes concern

---

## 📊 ISSUES BY PRIORITY

### Critical (0)
✅ All critical issues resolved

### High (0)
✅ All high-priority issues resolved

### Medium (2)
- ⚠️ U1: Phantom `tick_sync` type (type safety)
- ⚠️ U2: Activity list mismatch (UX issue)

### Low (1)
- ⚠️ U3: Zombie presence documents (operational)

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
- ⚠️ "Explore Campus" activity has no places (documented)
- ⚠️ Expired presence docs accumulate slowly (acceptable)
- ⚠️ One phantom type in code (no functional impact)

---

## 📝 RECOMMENDATIONS

### Before Next Deploy
1. ✅ **NO BLOCKING ISSUES** — Safe to deploy immediately
2. Consider documenting Activity List Mismatch as "Known Limitation" in user docs
3. Update DataModel_AsIs.md to reflect Phase 3 sessionHistory rules (completed above)

### Next Phase (Phase 4 - Optional)
1. **Activity Alignment:** Sync user-facing and admin place activities
2. **Phantom Cleanup:** Remove or implement `tick_sync` resolution reason
3. **Presence Archival:** Add scheduled cleanup for expired presence documents
4. **Terminal State Archival:** Archive completed/cancelled matches (if DB growth is concern)

### Monitoring Recommendations
1. Track "Explore Campus" selection rate (if high, prioritize adding places)
2. Monitor Firestore storage size (if growing rapidly, implement presence cleanup)
3. Watch for any `tick_sync` mentions in logs (should be zero)

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