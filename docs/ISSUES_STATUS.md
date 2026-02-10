# NYU Buddy - Issues Status Report

**Last Updated:** 2026-02-10 (U19 resolved - Presence expiry mid-match safeguards + redirect loop fix)
**Audit Scope:** Complete codebase vs. documentation cross-reference (6 doc files audited)
**Methodology:** Code is the only source of truth

---

## Executive Summary

**Overall Status:** ✅ **PRODUCTION-READY** (with known limitations)

- **Total Issues Identified:** 29
- **Resolved:** 25 (86%) ✅
- **Unresolved:** 4 (14%) ⚠️
  - Critical: 0
  - High: 0
  - Medium: 0
  - Low: 4 (minor gaps, scalability concerns)

**Key Finding:** All critical, high, and medium-priority issues resolved. Remaining unresolved issues are low-priority architectural limitations and minor gaps that don't block production deployment.

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

### 16. Push Notifications and PWA Installation
**Resolved:** 2026-02-08
**Priority:** HIGH
**Doc References:**
- `Architecture_AsIs.md:9.1`
- `FCM_SETUP.md` (complete setup guide)

**Problem:**
No push notification system for time-sensitive events:
- Users manually check app for offer notifications
- Battery drain from 30-second polling intervals
- iOS notifications only work in PWA standalone mode
- No guided installation flow for mobile users

**Solution Implemented:**

**Part 1: FCM Push Notifications**

**Backend (Cloud Functions):**
- **File:** `functions/src/utils/notifications.ts` (NEW)
  - `sendNotificationToUser()` - Core FCM sending logic
  - `sendOfferReceivedNotification()` - "You received an offer from XXX"
  - `sendMatchCreatedNotification()` - "You have successfully matched with XXX"
  - Handles invalid token cleanup
  - Platform-specific payload (Android/iOS)

- **Integration:**
  - `functions/src/offers/create.ts` - Send notification on offer creation + mutual match
  - `functions/src/offers/respond.ts` - Send notification on match acceptance
  - Fire-and-forget pattern (non-blocking)

**Frontend:**
- **Hook:** `src/lib/hooks/useNotifications.ts` (NEW)
  - Permission management
  - FCM token registration
  - Token storage in Firestore (`users.fcmToken`)
  - VAPID key configuration

- **Component:** `src/components/notifications/NotificationPrompt.tsx` (NEW)
  - Banner prompting users to enable notifications
  - Styled with gradient violet background
  - Error handling and dismissal

- **Service Worker:** `public/firebase-messaging-sw.js` (NEW)
  - Background notification handling
  - Shows notifications when app not in focus

- **Debug Tool:** `src/app/(protected)/notifications-debug/page.tsx` (NEW)
  - Configuration status checker
  - Platform detection
  - Token verification
  - Test notification sender

**Part 2: PWA Installation Banner**

**Core Utilities:**
- **File:** `src/lib/utils/platform.ts` (NEW)
  - Robust iOS Safari detection: `/Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)`
  - Detects iOS, Android, Desktop
  - Dual standalone detection: `matchMedia('(display-mode: standalone)')` + `navigator.standalone`
  - Excludes iOS Chrome, Edge, Firefox from Safari detection

- **Hook:** `src/lib/hooks/useInstallation.ts` (NEW)
  - Installation state management
  - localStorage keys: `installBannerDismissUntil` (timestamp), `installBannerInstalled` (boolean)
  - 24-hour "Later" dismissal
  - Android `appinstalled` event listener
  - `beforeinstallprompt` event capture

**Components:**
- **Main Banner:** `src/components/installation/InstallBanner.tsx` (NEW)
  - Platform-specific messaging
  - Styled to match NotificationPrompt
  - Gradient violet background
  - Mobile-responsive

- **iOS Safari Guide:** `src/components/installation/IOSInstallGuide.tsx` (NEW)
  - Visual step-by-step guide
  - Icons for Share → Add to Home Screen → Add
  - Modal with gradient header

- **Android Guide:** `src/components/installation/AndroidInstallGuide.tsx` (NEW)
  - Manual installation steps
  - Browser menu → Install app → Confirm
  - Fallback for browsers without native prompt

- **iOS Safari Prompt:** `src/components/installation/IOSSafariPrompt.tsx` (NEW)
  - For iOS Chrome/Edge/Firefox users
  - "Copy Link" (primary action)
  - "Open in Safari" (best-effort secondary)
  - Manual instructions if auto-open fails

**Integration:**
- **File:** `src/app/(protected)/layout.tsx`
  - Added `<InstallBanner />` below `<NotificationPrompt />`
  - Both banners parallel, same styling

**PWA Configuration:**
- **Manifest:** `public/manifest.json` (UPDATED)
  - `"display": "standalone"` - Critical for iOS notifications
  - App icons: `/icon-192.svg`, `/icon-512.svg`
  - Theme color: `#7c3aed` (violet)

- **Metadata:** `src/app/layout.tsx` (UPDATED)
  - Added `manifest: "/manifest.json"`
  - Added `appleWebApp` configuration
  - Viewport settings for mobile

**Behavior:**
- **Desktop:** No installation banner (hidden)
- **iOS Safari:** Shows "Add to Home Screen" banner → Visual guide modal
- **iOS Chrome/Edge/Firefox:** Shows "Install from Safari" banner → Copy link prompt
- **Android:** Shows "Install NYU Buddy" banner → Native prompt or manual guide
- **All platforms:** Banner disappears permanently when app opens in standalone mode

**Environment Configuration:**
- **Local:** `.env.local` - `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- **Production:** Vercel environment variables
- **Service Worker:** Firebase config in `public/firebase-messaging-sw.js`

**Verification:**
- ✅ FCM notifications working on Android in browser
- ✅ FCM notifications working on iOS in PWA standalone mode
- ✅ Installation banner detects platform correctly
- ✅ PWA installs successfully on iOS Safari
- ✅ PWA installs successfully on Android Chrome
- ✅ TypeScript compiles without errors
- ✅ ESLint passes all files
- ✅ No breaking changes

**Impact:**
- **High** - Major user experience improvement
- Real-time notifications for offers and matches
- Reduced battery drain (no more polling)
- Guided installation improves PWA adoption
- Platform-specific UX optimization

---

### 17. Idempotency and Client Retry (U23)
**Resolved:** 2026-02-08
**Priority:** MEDIUM
**Doc References:**
- `Architecture_AsIs.md:9.2`
- `U23_TESTING_GUIDE.md` (comprehensive testing documentation)

**Problem:**
No retry or idempotency mechanism for Cloud Function calls:
- Network failures during critical operations (presenceStart, offerCreate, matchCancel) could lose user actions
- Duplicate calls from client retries could create duplicate sessions, offers, or matches
- No request deduplication mechanism
- Poor user experience during transient network issues

**Solution Implemented:**

**Part 1: Client-Side Retry with Exponential Backoff**

**Core Retry Logic** (`src/lib/utils/retry.ts` - NEW):
- Exponential backoff: 1s → 2s → 4s → 8s
- Total deadline: 15 seconds
- Retry on transient errors only (unavailable, deadline-exceeded, resource-exhausted)
- Non-retryable errors fail immediately (invalid-argument, unauthenticated, permission-denied)
- Idempotency key generation: Single UUID generated once, reused across all retries
- Detailed logging for debugging

**Integration Pattern:**
```typescript
export async function presenceStart(data: {
  activity: string;
  durationMin: number;
  lat: number;
  lng: number;
  idempotencyKey?: string; // Optional client-provided key
}): Promise<{ success: boolean; sessionId: string; expiresAt: string }> {
  return retryWithBackoff(async (generatedKey) => {
    const keyToUse = data.idempotencyKey || generatedKey;
    const fn = httpsCallable(...);
    const result = await fn({ ...data, idempotencyKey: keyToUse });
    return result.data;
  });
}
```

**Protected Functions** (`src/lib/firebase/functions.ts`):
- ✅ `presenceStart` - Retry-wrapped with idempotency
- ✅ `offerCreate` - Retry-wrapped with idempotency
- ✅ `offerRespond` - Retry-wrapped with idempotency
- ✅ `matchCancel` - Retry-wrapped with idempotency
- Other functions use standard callables (non-critical or read-only)

**Part 2: Backend Idempotency**

**Core Utility** (`functions/src/utils/idempotency.ts` - NEW, 340 lines):

**Key Design Decisions:**
- Atomic lock via `create()` - No check-then-set race condition
- Minimal result caching - Only IDs and flags, not full payloads
- Status tracking: `processing` → `completed` / `failed`
- 2-hour TTL (sufficient for realistic retry windows)
- Transaction-scoped variant for complex operations

**Non-Transactional Pattern** (`withIdempotencyLock`):
1. Attempt atomic lock: `idempotencyRef.create({ status: 'processing', ... })`
2. If succeeds → Execute operation → Store minimal result → Mark completed
3. If already exists → Check status:
   - `completed`: Return cached result
   - `processing`: Throw `DUPLICATE_IN_PROGRESS` error
   - `failed`: Allow retry (delete and retry create)

**Transaction-Scoped Pattern** (`checkIdempotencyInTransaction`, `markIdempotencyCompleteInTransaction`):
- Used for operations requiring Firestore transactions (offerCreate, offerRespond)
- Lock acquisition happens inside transaction
- Result stored atomically with business operation

**Idempotency Collection Schema:**
```typescript
interface IdempotencyRecord {
  requestId: string;           // UUID from client
  uid: string;                 // User who made request
  operation: string;           // e.g., 'presenceStart'
  status: 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  expiresAt: Timestamp;        // 2-hour TTL
  processingStartedAt?: Timestamp;
  completedAt?: Timestamp;
  minimalResult?: MinimalResult;  // Only IDs and flags
  error?: string;
}
```

**Business-Level Idempotency** (presenceStart specific):
- Beyond atomic locking, checks if active session already exists with matching parameters
- Returns existing sessionId if session still valid (not expired, activity matches)
- Prevents duplicate sessions even if idempotency record expires

**Protected Functions** (`functions/src/`):
- ✅ `presence/start.ts` - Full idempotency (atomic + business-level)
- ✅ `offers/create.ts` - Transaction-scoped idempotency
- ✅ `offers/respond.ts` - Transaction-scoped idempotency
- ✅ `matches/cancel.ts` - Full idempotency

**Part 3: Firestore Security Rules**

**Added** (`firestore.rules:128-131`):
```javascript
// U23: Idempotency collection
match /idempotency/{idempotencyId} {
  allow read: if isAuthenticated() && resource.data.uid == request.auth.uid;
  allow write: if false; // Cloud Functions only
}
```

**Part 4: Scheduled Cleanup**

**Cleanup Job** (`functions/src/idempotency/cleanup.ts` - NEW):
- Schedule: Every 2 hours
- Batch size: 500 records per run
- Query: `expiresAt <= now`
- Prevents unbounded storage growth
- Registered in `functions/src/index.ts`

**Part 5: Testing Infrastructure**

**Debug Page** (`src/app/(protected)/idempotency-debug/page.tsx` - NEW, 600+ lines):
- **Test 1:** Concurrent duplicate calls (same key → same sessionId)
- **Test 2:** Parameter mismatch detection (activity change blocked)
- **Test 3:** Retry behavior verification (exponential backoff logging)
- **Test 4:** Rapid-fire stress test (10 concurrent → 1 session)
- Real-time idempotency record inspection
- Presence data verification
- Complete test automation

**Testing Guide** (`docs/U23_TESTING_GUIDE.md` - NEW, 658 lines):
- Quick start with debug page
- Manual testing instructions
- 4 comprehensive test scenarios
- Expected behaviors and verification steps
- Troubleshooting guide

**Technical Challenges Resolved:**

**Challenge 1: Node 25 Incompatibility**
- **Problem:** `admin.firestore.Timestamp` undefined in Node 25 with firebase-admin@13.6.0
  - Firebase officially supports Node 20 (not Node 25)
  - Emulator warning: "Your requested 'node' version '20' doesn't match your global version '25'"
- **Workaround:** Import from `firebase-admin/firestore` submodule instead of `admin.firestore`
  ```typescript
  import { Timestamp, FieldValue } from 'firebase-admin/firestore';
  ```
- **Files Fixed:**
  - `functions/src/presence/start.ts`
  - `functions/src/utils/idempotency.ts`
- **⚠️ Production Requirement:** Must use Node 20 (workaround is for local development only)

**Challenge 2: Client Wrapper Key Overwriting**
- **Problem:** Retry wrapper overwrote user-provided idempotencyKey with generated key
- **Root Cause:** `{ ...data, idempotencyKey }` spreads data first, then overwrites
- **Solution:** Explicit key selection
  ```typescript
  const keyToUse = data.idempotencyKey || generatedKey;
  ```

**Verification:**
- ✅ All 4 automated tests passing
- ✅ Test 1: Concurrent duplicates → Same sessionId (idempotency working)
- ✅ Test 2: Parameter mismatch → Correct rejection
- ✅ Test 3: Retry behavior → Exponential backoff confirmed
- ✅ Test 4: Rapid-fire 10 requests → 1 session created (no duplicates)
- ✅ Emulator logs show proper lock acquisition and completion
- ✅ Business-level idempotency returning existing sessions
- ✅ TypeScript compiles successfully
- ✅ **Requires Node 20** (Node 25 workaround via submodule imports, not officially supported)

**Impact:**
- **High** - Major reliability improvement
- Prevents duplicate operations from client retries
- Graceful handling of network failures
- Better user experience during poor connectivity
- Production-ready idempotency infrastructure
- Comprehensive testing coverage

**Timeline:** COMPLETED 2026-02-08

---

### 18. Race Condition Protection (U22)
**Resolved:** 2026-02-09
**Priority:** HIGH (CRITICAL)
**Doc References:**
- `U22_RACE_CONDITION_FIX.md`
- `functions/test/U22_VERIFICATION_SUMMARY.md`
- `PRD_AsIs.md:11.1`

**Problem:**
Critical race conditions in match creation leading to duplicate matches and inconsistent state:
1. **Concurrent Opposite Accepts:** Users A and B accepting each other's offers simultaneously created 2 separate matches
2. **User-Level Duplication:** User A could match with both B and C at the same time
3. **No Guard Release:** Completed/cancelled matches blocked future rematches (guard persisted forever)
4. **State Inconsistency:** Hardcoded status arrays missing critical statuses in checks

**Root Causes:**
- Outside-transaction active match checks (TOCTOU vulnerability)
- No atomic guard mechanism for pair-level mutual exclusion
- Presence checks happened before transaction, allowing race conditions
- Guard documents never released on terminal states
- Hardcoded `ACTIVE_MATCH_STATUSES` missing `location_deciding` and `place_confirmed`

**Solution Implemented:**

**1. Atomic Match Creation with Pair-Level Guard**
- **File:** `functions/src/matches/createMatchAtomic.ts` (NEW, 313 lines)
- **Core Mechanism:** Guard document in `activeMatchesByPair` collection
- **Guard Key:** `pairKey = ${minUid}_${maxUid}` (sorted UIDs for consistency)
- **Guard Schema:**
  ```typescript
  {
    pairKey: string,
    matchId: string,
    status: 'active',
    activity: string,
    createdAt: Timestamp,
    expiresAt: Timestamp  // 2-hour safety TTL
  }
  ```

**2. User-Level Mutual Exclusion (Step 2.5)**
- **Lines 122-189:** Inside-transaction checks for EACH user
- **Logic:** Verify neither user is already in an active match with ANYONE else
- **Behavior:** Returns existing matchId instead of throwing error (idempotent)
- **Prevents:** User A matching with both B and C simultaneously

**3. Transaction-Scoped Atomic Operations**
```
Transaction flow:
  1. Read pair guard
  2. If exists and active → return existing match (idempotent)
  3. Check user1 presence.status === 'matched' → return their existing match
  4. Check user2 presence.status === 'matched' → return their existing match
  5. Create new match doc
  6. Create new guard doc
  7. Update both presences to 'matched'
```

**4. Guard Lifecycle Management**
- **Creation:** `createMatchAtomic()` creates guard atomically with match
- **Release on Completion:** `functions/src/matches/updateStatus.ts:109-117`
- **Release on Cancellation:** `functions/src/matches/cancel.ts:188-195`
- **Function:** `releaseMatchGuard(matchId, user1Uid, user2Uid)` - Idempotent

**5. Canonical State Constants**
- **Fixed:** Imported `ACTIVE_MATCH_STATUSES` from `../constants/state`
- **Was:** Hardcoded `['pending','accepted','heading_there','arrived']`
- **Now:** `['pending','location_deciding','place_confirmed','heading_there','arrived']`
- **Impact:** Matches in `location_deciding` now properly treated as active (critical bug fix)

**6. All Match Creation Migrated**
- ✅ `functions/src/offers/respond.ts` - Offer acceptance → createMatchAtomic
- ✅ `functions/src/offers/create.ts` - Mutual offer → createMatchAtomic
- ✅ `functions/src/suggestions/respond.ts` - Mutual suggestion → createMatchAtomic
- **Verification:** Grep confirmed ZERO bypasses

**7. Static Imports Only**
- Replaced all dynamic `await import()` with static imports at file top
- **Reason:** Reduces transaction execution time, prevents timeout risk

**8. Firestore Security Rules**
```javascript
match /activeMatchesByPair/{pairKey} {
  allow read: if false;   // Cloud Functions only
  allow write: if false;  // Cloud Functions only
}
```

**Testing & Verification:**

**Test 0: Compilation** ✅ PASSED
- All TypeScript compiles successfully

**Test 1: User-Level Mutual Exclusion** ✅ PASSED (Production)
- Created match A-B, attempted A-C → returned existing A-B (idempotent)
- User C remained available, no A-C guard created
- **Verified:** User cannot match with multiple people simultaneously

**Test 2: Pair-Level Guard (Concurrent Race)** ✅ PASSED (Production)
- Simulated concurrent opposite accepts
- Observed Firestore transaction retries (3 attempts in logs)
- Final result: Both returned same matchId
- **Verified:** Race-free match creation via atomic guard

**Test 3: Guard Release on Completion** ✅ PASSED (Production)
- Completed match, released guard, created rematch successfully
- **Verified:** Completed matches don't block rematches

**Test 4: Guard Release on Cancel** ✅ PASSED (Production)
- Cancelled match, released guard, created rematch successfully
- **Verified:** Cancelled matches don't block rematches

**Test 5: Bypass Check** ✅ PASSED
- Only 1 `collection('matches').doc()` found - inside createMatchAtomic.ts

**Files Modified/Created:**
- **NEW:** `functions/src/matches/createMatchAtomic.ts` (313 lines)
- **NEW:** `functions/test/u22-verification-tests.ts` (645 lines)
- **NEW:** `functions/test/U22_VERIFICATION_SUMMARY.md`
- **UPDATED:** `functions/src/offers/respond.ts`
- **UPDATED:** `functions/src/offers/create.ts`
- **UPDATED:** `functions/src/suggestions/respond.ts`
- **UPDATED:** `functions/src/matches/cancel.ts`
- **UPDATED:** `functions/src/matches/updateStatus.ts`
- **UPDATED:** `firestore.rules`

**Impact:**
- **CRITICAL** - Eliminated all known race conditions
- **High** - Prevents duplicate matches
- **High** - Prevents user matching with multiple people
- **High** - Allows rematches after completion/cancellation
- **High** - Production-verified with real Firestore transactions

**Verification:**
- ✅ All 5 tests passed against production database
- ✅ Observed transaction retries working correctly (expected behavior)
- ✅ Zero race condition bypasses
- ✅ Guards properly released on ALL terminal states

**Timeline:** COMPLETED 2026-02-09

---

## ⚠️ UNRESOLVED ISSUES

**Status:** 4 issues remaining (0 high + 0 medium + 4 low)

All critical, high, and medium-priority issues have been resolved. Remaining issues are:
- **High Priority (0):** None
- **Medium Priority (0):** None
- **Low Priority (4):** Minor gaps, scalability concerns, reserved fields

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

### U18. ~~Block During Active Match (Auto-Cancel)~~ ✅ RESOLVED (2026-02-09)

**Status:** ✅ **RESOLVED** (2026-02-09)

**Pre-Fix Issue:**
Blocking was only available in the "Place Confirmed" phase (Step 2) of a match. During the "Location Deciding" phase (Step 1), users had no block/report option — only a Cancel Match button. This meant:
- Users couldn't block an unsafe user during location selection
- Inconsistent safety UX across match phases

**U18 Resolution:**

**Added Block & Report buttons to Location Deciding phase (Step 1):**
- **File:** `src/app/(protected)/match/[matchId]/page.tsx`
- **Change:** Added a Safety Actions Card below the `LocationDecisionPanel` component in the Step 1 block, containing the same Report + Block button row that exists in Step 2.

**UI Added (inside `{showLocationSelection && ( <> ... </> )}` block):**
- **Report button** (Flag icon, outline) — Opens uncontrolled `<Dialog>` with textarea for describing the issue. Saves to `reports/{matchId}_{userId}` collection.
- **Block button** (Ban icon, red text, outline) — Calls existing `handleBlock()` which:
  1. Shows `window.confirm()` confirmation prompt
  2. Creates block document at `blocks/{userId}/blocked/{otherUid}`
  3. Calls `matchCancel({ matchId, reason: 'blocked' })` (zero reliability penalty)
  4. Redirects to homepage with toast notification

**Design Decisions:**
- **No new state or handlers** — Reuses existing `handleReport`, `handleBlock`, `reportReason`, `isReporting`, `isBlocking` from the page component
- **Mutual exclusivity verified** — Step 1 renders when `showLocationSelection = !match?.confirmedPlaceName` is true, Step 2 renders when false. Strictly mutually exclusive — no edge case where both button sets appear simultaneously.
- **Dialog singleton safety** — Both Step 1 and Step 2 use uncontrolled `<Dialog>` (via `<DialogTrigger>`), and since only one step renders at a time, only one Dialog instance exists in the DOM. No state conflict.
- **No backend changes** — `handleBlock` already calls `matchCancel` which cancels the match, clears presence, releases match guard, and deletes associated offers. The `'blocked'` reason has zero reliability penalty.

**Complete Block Coverage Across All Match Phases:**
- ✅ **Location Deciding (Step 1):** Block + Report buttons in Safety Actions Card
- ✅ **Place Confirmed (Step 2):** Block + Report buttons in Safety Actions Card (already existed)
- ✅ **Both phases:** Block always creates block doc → cancels match → redirects home

**Firestore Rules Verified:**
- `reports` collection (lines 105-110): `allow create: if isAuthenticated() && request.resource.data.reportedBy == request.auth.uid` — works for both phases
- `blocks` collection (lines 114-116): `allow read, write: if isOwner(uid)` — works for both phases

**Verification:**
- ✅ ESLint: Zero warnings or errors
- ✅ TypeScript: Compiles successfully with `tsc --noEmit`
- ✅ Step 1 and Step 2 are strictly mutually exclusive (no double-render)
- ✅ Block flow: confirmation → block doc → matchCancel → redirect home
- ✅ Report flow: dialog → textarea → submit to Firestore → close

**Timeline:** COMPLETED 2026-02-09

---

### U19. ~~Presence Expiry Mid-Match~~ ✅ RESOLVED (2026-02-10)

**Status:** ✅ **RESOLVED** (2026-02-10)

**Pre-Fix Issue:**
If user's presence expired during an active match:
- Presence document deleted by cleanup job
- Match remains active with orphaned state
- Other user sees stale match state
- No automatic recovery mechanism

**U19 Resolution — 3-Part Fix:**

**Part 1: Extend presence TTL on match creation** (`functions/src/matches/createMatchAtomic.ts`)
- On match creation, saves `originalExpiresAt` (the user's original session expiry) and extends `expiresAt` to +2 hours
- Prevents presence from expiring mid-match while preserving the original session info
- `originalExpiresAt` is restored when match terminates (completion or cancellation)
- Frontend countdown timer and discovery system unaffected (they use `expiresAt` which gets restored)

**Part 2: Restore originalExpiresAt on match termination**

**On cancellation** (`functions/src/matches/cancel.ts`):
- Added `'system_presence_expired'` to zero-penalty cancel reasons
- Safety checks: skip if `presence.matchId !== matchId` or `presence.status !== 'matched'`
- Restore logic: uses `originalExpiresAt` (falls back to `expiresAt`)
  - If original expired → `transaction.delete(presenceDoc.ref)` (user goes offline)
  - If still valid → restore to `available` with original `expiresAt`, delete `originalExpiresAt`

**On completion** (`functions/src/matches/updateStatus.ts`):
- Extracted `restorePresence()` helper with same safety checks and restore/delete logic
- **Individual completion:** When one user marks `completed`, immediately restore their presence so the homepage stops redirecting them back
- **Overall completion:** Restore both users' presences with safety checks (prevents double-restore)

**Part 3: Auto-cancel abandoned matches in cleanup** (`functions/src/presence/cleanupExpired.ts`)
- Two-pass approach to avoid write amplification:
  - **Pass 1:** Normal expired docs (not matched) → batch delete (fast)
  - **Pass 2:** Matched expired docs → individually call `cancelMatchInternal()` with `cancelledBy: 'system'`, `reason: 'system_presence_expired'`, `skipPermissionCheck: true`. Only delete presence on cancel success; preserve on failure.
- Zero reliability penalty for system-initiated cancellations

**Related Bug Fixes Discovered During U19 Implementation:**

**Bug 1: Redirect loop after individual match completion**
- **Symptom:** After one user clicked "Complete Meetup" → feedback → homepage, they were immediately redirected back to the match page
- **Root Cause (Backend):** Accepted offers were never updated to terminal status on match completion. The `useOffers` real-time listener on the homepage found offers with `status: 'accepted'` and `matchId`, triggering a redirect back.
- **Root Cause (Frontend):** The offer-based fallback redirect on the homepage had no presence guard, and `showMatchOverlay` was a one-way latch (never cleared). Stale cached Firestore offer data could trigger the redirect before the server update arrived.
- **Backend Fix** (`functions/src/matches/updateStatus.ts`): When any user marks themselves `completed`, query all offers with `matchId` and `status: 'accepted'` and update them to `status: 'completed'`. This mirrors what `cancel.ts` already does (setting offers to `cancelled`).
- **Frontend Fix** (`src/app/(protected)/page.tsx`):
  - Added presence guard to offer fallback redirect: `if (!presence?.matchId || presence.status !== 'matched') return;`
  - Added overlay clearing: when presence changes to non-matched, clear `showMatchOverlay` to null

**Bug 2: Firestore transaction read-before-write violation (U23 regression)**
- **Symptom:** `offerCreate` and `offerRespond` returned INTERNAL error after U19 deploy
- **Root Cause:** `checkIdempotencyInTransaction` wrote a 'processing' record (`transaction.set`) before `createMatchAtomic` tried to read (guard doc, presence). Firestore requires all reads before all writes.
- **Fix** (`functions/src/utils/idempotency.ts`): `checkIdempotencyInTransaction` now only reads (no writes). Transaction isolation handles dedup automatically. `markIdempotencyCompleteInTransaction` uses `set()` instead of `update()`.

**Bug 3: Missing fields in match document**
- `createMatchAtomic.ts` was missing `statusByUser` and `matchedAt` fields, causing `TypeError: Cannot read properties of undefined` on the match page
- Fixed by adding `statusByUser: { [user1Uid]: 'pending', [user2Uid]: 'pending' }` and `matchedAt: now`

**Bug 4: Undefined `durationMinutes` in match creation**
- `offers/create.ts` and `offers/respond.ts` referenced `offer.durationMin` which doesn't exist (field names are `fromDurationMinutes` / `toDurationMinutes`)
- Fixed to `Math.min(offer.fromDurationMinutes || 30, offer.toDurationMinutes || 30)`

**Bug 5: Firestore transaction order violation in `matchConfirmMeeting` (discovered 2026-02-10)**
- **Symptom:** Post-match resolution testing on `/admin/match-test` page returned `FAILED: functions/internal INTERNAL` error when clicking "Met" to confirm meeting
- **Test Scenario:** Force-expired match (Case B: one user completed, other pending) → user clicked "Met" → INTERNAL error
- **Firebase Logs Error (2026-02-10 11:14:59):**
  ```
  Unhandled error Error: Firestore transactions require all reads to be executed before all writes.
      at Transaction.get (/workspace/node_modules/@google-cloud/firestore/build/src/transaction.js:97:19)
      at /workspace/lib/matches/confirmMeeting.js:170:56
  ```
- **Root Cause:** When resolving to `completed` status, the function was reading user documents (lines 182-183) to update reliability stats AFTER already writing to the match document (line 215/226). Firestore requires all `transaction.get()` calls to happen before any `transaction.update()` calls.
- **Original Code Flow (BROKEN):**
  ```typescript
  transaction => {
    1. Read match document ✅
    2. ... validation logic ...
    3. Write to match document (line 215/226) ✅
    4. IF (status === 'completed'):
         Read user documents (line 183) ❌ TOO LATE!
  }
  ```
- **Fix** (`functions/src/matches/confirmMeeting.ts` lines 147-153, 180):
  - **Phase 1 (ALL READS):** Pre-read both user documents at the beginning of the transaction, before any writes
  - **Phase 2 (COMPUTE AND WRITE):** Use cached `userSnapshots[userUid]` instead of `transaction.get(userRef)`
  - Added explicit phase separation comments for maintainability
- **Updated Code Flow (FIXED):**
  ```typescript
  transaction => {
    // ===== PHASE 1: ALL READS =====
    1. Read match document
    2. Pre-read BOTH user documents (even if we might not need them)
       Store in userSnapshots map
    
    // ===== PHASE 2: COMPUTE AND WRITE =====
    3. Write to match document
    4. IF (status === 'completed'):
         Use userSnapshots[userUid] (no new reads!)
  }
  ```
- **Trade-off:** Now reads both user documents on EVERY call (even when not resolving to `completed`), but this is acceptable because:
  - Document reads are cheap (financially and performance-wise)
  - The overhead is minimal (2 extra reads per call)
  - Correctness > micro-optimization
  - Function only called when match expires (infrequent event)
- **Deployed:** 2026-02-10 12:56 UTC
- **Verification:** ✅ Test passed after deployment - meeting confirmation works correctly


**Files Modified:**
- `functions/src/matches/createMatchAtomic.ts` — Save `originalExpiresAt`, extend `expiresAt`, add `statusByUser`/`matchedAt`
- `functions/src/matches/cancel.ts` — Add `system_presence_expired` zero-penalty, restore/delete logic
- `functions/src/matches/updateStatus.ts` — `restorePresence()` helper, individual completion handling, offer cleanup
- `functions/src/matches/confirmMeeting.ts` — Fix transaction order violation: pre-read user docs before writes (Bug 5)
- `functions/src/presence/cleanupExpired.ts` — Two-pass auto-cancel for matched expired docs
- `functions/src/utils/idempotency.ts` — Read-only check, set-based completion (no read-before-write violation)
- `functions/src/offers/create.ts` — Fix `durationMin` → `fromDurationMinutes`/`toDurationMinutes`
- `functions/src/offers/respond.ts` — Same durationMinutes fix
- `src/app/(protected)/page.tsx` — Presence guard on offer fallback redirect, stale overlay clearing

**Verification:**
- ✅ TypeScript compiles successfully (both `functions/` and `src/`)
- ✅ ESLint passes
- ✅ Next.js build passes
- ✅ Firebase Functions deployed successfully (all 24 functions)
- ✅ Match creation works (offer accept + mutual invite)
- ✅ Individual completion no longer causes redirect loop
- ✅ Presence restored correctly on match termination
- ✅ Post-match resolution "Did you meet?" confirmation works (Bug 5 fixed)

**Timeline:** COMPLETED 2026-02-10

---

### U20. ~~Place Selection System Inconsistency~~ ✅ RESOLVED (2026-02-08)

**Status:** ✅ **RESOLVED** (2026-02-08)

**Pre-Fix Issue:**
Two place selection systems existed creating confusion:
1. **Legacy:** `meetupRecommend` → `matchConfirmPlace` (3 places, first-confirm-wins)
2. **New:** `matchFetchAllPlaces` → `matchSetPlaceChoice` → `matchResolvePlace` (dual-choice, countdown)

**Problem:** UI used new system exclusively, but legacy functions remained in codebase.

**U20 Resolution:**
- ✅ **Deleted Legacy Backend Functions:**
  - `functions/src/meetup/recommend.ts` (meetupRecommend)
  - `functions/src/matches/confirmPlace.ts` (matchConfirmPlace)
  - Removed both Cloud Functions from production

- ✅ **Cleaned Up Frontend:**
  - Removed `meetupRecommend` and `matchConfirmPlace` from `src/lib/firebase/functions.ts`
  - Removed unused `fetchRecommendations` function from `src/lib/hooks/useMatch.ts`
  - Removed unused imports and state

- ✅ **Preserved Critical Function:**
  - Moved `updateMatchStatus` to new file `matches/updateStatus.ts`
  - Redeployed to production (used for heading_there/arrived/completed status)

**Verification:**
- UI uses `useLocationDecision` hook → calls `matchFetchAllPlaces` (new system only)
- No code references to legacy functions remain
- All matches now use dual-choice voting with countdown

**Timeline:** COMPLETED 2026-02-08

---

### U21. ~~Email Verification Not Enforced~~ ✅ RESOLVED (2026-02-08)

**Status:** ✅ **RESOLVED** (2026-02-08)

**Pre-Fix Issue:**
Email verification was not enforced on backend:
- Frontend checked `emailVerified` but easily bypassed with direct API calls
- Any fake `@nyu.edu` email (e.g., `fake123@nyu.edu`) could fully use the app
- No backend verification on critical functions
- Security/spam risk

**U21 Resolution:**

**1. Backend Verification Middleware** (`functions/src/utils/verifyEmail.ts` - NEW)
- Created `requireEmailVerification()` helper function
- Zero grace period enforcement (immediate blocking)
- Returns clear error: `EMAIL_NOT_VERIFIED`

**2. Protected 9 Critical Functions:**
- ✅ `presenceStart` - Set availability
- ✅ `offerCreate` - Send offers
- ✅ `offerRespond` - Accept/decline offers
- ✅ `suggestionGetCycle` - Browse suggestions (new)
- ✅ `suggestionGetTop1` - Browse suggestions (legacy)
- ✅ `matchFetchAllPlaces` - Fetch locations
- ✅ `matchSetPlaceChoice` - Choose location
- ✅ `matchCancel` - Cancel match
- ✅ `updateMatchStatus` - Update match status

**3. Frontend Enhancements:**
- Enhanced error handling in `AvailabilitySheet.tsx`
- Shows user-friendly verification message on error
- Existing verification banner already in place (Navbar.tsx)
- UI blocks features for unverified users (page.tsx)

**User Experience:**
- Unverified users: Can login, see UI, but cannot use any features
- Verification banner shown at top: "Please verify your email to access all features"
- After verification: All features immediately accessible
- Backend prevents API bypass attempts

**Verification:** ✅ Deployed to production (2026-02-08)

**Timeline:** COMPLETED 2026-02-08

---

### U22. ~~Race Conditions (Offer/Match Edge Cases)~~ ✅ RESOLVED (2026-02-09)

**Status:** ✅ **RESOLVED** (2026-02-09)

**Pre-Fix Issue:**
Critical race conditions in match creation:
1. **Concurrent Opposite Accepts:** Users accepting each other's offers simultaneously created duplicate matches
2. **User-Level Duplication:** User A could match with both B and C at the same time
3. **No Guard Release:** Completed/cancelled matches blocked future rematches permanently

**U22 Resolution:**

See "18. Race Condition Protection (U22)" in RESOLVED ISSUES section above for complete implementation details.

**Quick Summary:**
- ✅ Atomic match creation with pair-level guard (`activeMatchesByPair` collection)
- ✅ User-level mutual exclusion (Step 2.5 inside transaction)
- ✅ Guard lifecycle management (release on completion AND cancellation)
- ✅ All match creation migrated to `createMatchAtomic()`
- ✅ Canonical state constants imported (fixed hardcoded arrays)
- ✅ Static imports only (no dynamic imports in transactions)
- ✅ Production-verified with all 5 tests passing

**Files Created:**
- `functions/src/matches/createMatchAtomic.ts` (313 lines)
- `functions/test/u22-verification-tests.ts` (645 lines)
- `functions/test/U22_VERIFICATION_SUMMARY.md`

**Files Updated:**
- `functions/src/offers/respond.ts`, `offers/create.ts`, `suggestions/respond.ts`
- `functions/src/matches/cancel.ts`, `matches/updateStatus.ts`
- `firestore.rules` (guard collection rules)

**Verification:**
- ✅ Test 0: Compilation passes
- ✅ Test 1: User-level mutual exclusion works
- ✅ Test 2: Pair-level guard prevents race conditions
- ✅ Test 3: Guard released on completion
- ✅ Test 4: Guard released on cancellation
- ✅ Test 5: No bypasses found (grep verified)

**Timeline:** COMPLETED 2026-02-09

---

### U23. ~~No Retry/Idempotency Mechanism~~ ✅ RESOLVED (2026-02-08)

**Status:** ✅ **RESOLVED** (2026-02-08)

**Pre-Fix Issue:**
Failed Cloud Function calls had no automatic retry or idempotency keys, leading to duplicate operations or lost user actions.

**Resolution:**
Complete idempotency and retry implementation with:
- Client-side exponential backoff retry (1s → 2s → 4s → 8s)
- Backend atomic idempotency locks
- Transaction-scoped idempotency for complex operations
- 2-hour TTL with scheduled cleanup
- Comprehensive testing infrastructure

**Details:** See "17. Idempotency and Client Retry (U23)" in RESOLVED ISSUES section above for complete implementation details.

**Timeline:** COMPLETED 2026-02-08

---

### U24. ~~Legacy Place Confirmation Bypass~~ ✅ RESOLVED (as part of U20)

**Status:** ✅ **RESOLVED** (2026-02-08 - same as U20)

**Pre-Fix Issue:**
`matchConfirmPlace` existed and allowed direct transition bypassing dual-choice voting logic.

**Resolution:**
This issue was **automatically resolved as part of U20** (Place Selection System Inconsistency):
- ✅ `functions/src/matches/confirmPlace.ts` was deleted
- ✅ `matchConfirmPlace` Cloud Function removed from production
- ✅ No code references remain (verified by grep)
- ✅ Only dual-choice voting system exists now

**Verification:**
- Function not exported in `functions/src/index.ts`
- Function file does not exist in codebase
- No imports or calls to `matchConfirmPlace` anywhere

**Timeline:** COMPLETED 2026-02-08 (same deployment as U20)

---

### U25. ~~Presence Cleanup on Match Cancel Edge Case~~ ✅ RESOLVED (2026-02-10, part of U19)

**Status:** ✅ **RESOLVED** (2026-02-10 — fixed as part of U19)

**Pre-Fix Issue:**
`matchCancel` restored presence to `available` but if `expiresAt < now`, code silently skipped the update, leaving a zombie presence document.

**Resolution:**
Fixed in U19's `restorePresence()` logic in both `cancel.ts` and `updateStatus.ts`:
- If `originalExpiresAt` (or `expiresAt`) has expired → **delete** the presence document (user goes offline cleanly)
- If still valid → restore to `available` with original `expiresAt`
- No more zombie docs — presence is either restored or deleted

**Timeline:** COMPLETED 2026-02-10 (same deployment as U19)

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

### High (0)
- ~~U16: No Push Notification System~~ → ✅ Resolved (2026-02-08)
- ~~U13: Hardcoded Admin Whitelist Discrepancy~~ → ✅ Resolved (2026-02-08)

### Medium (0)
- ~~U18: Block During Active Match (auto-cancel not implemented)~~ → ✅ Resolved (2026-02-09)
- ~~U19: Presence Expiry Mid-Match (no safeguards)~~ → ✅ Resolved (2026-02-10)
- ~~U22: Race Conditions (offer/match edge cases)~~ → ✅ Resolved (2026-02-09)
- ~~U23: No Retry/Idempotency Mechanism~~ → ✅ Resolved (2026-02-08)
- ~~U21: Email Verification Not Enforced~~ → ✅ Resolved (2026-02-08)
- ~~U20: Place Selection System Inconsistency~~ → ✅ Resolved (2026-02-08)
- ~~U9: Activity List Partial Mismatch~~ → ✅ Resolved (2026-02-08)
- ~~U14: Two Match Creation Schemas~~ → ✅ Resolved (2026-02-08)
- ~~U15: Inconsistent presence.matchId Writes~~ → ✅ Resolved (2026-02-08)
- ~~U1: Phantom `tick_sync` type~~ → ✅ Resolved (Task 3)
- ~~U2: Activity list mismatch~~ → ✅ Resolved (Task 2)

### Low (4)
- ⚠️ **U10:** Reserved Fields (meetRate/cancelRate) - kept for future features
- ~~U24: Legacy Place Confirmation Bypass~~ → ✅ Resolved (2026-02-08, part of U20)
- ~~U25: Presence Cleanup on Match Cancel Edge Case~~ → ✅ Resolved (2026-02-10, part of U19)
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
⚠️ **4 UNRESOLVED ISSUES** - None are critical or block production:

**Resolved:**
- ~~"Explore Campus" activity~~ → ✅ Removed (Task 2)
- ~~Expired presence docs~~ → ✅ Scheduled cleanup implemented (Task 4)
- ~~Phantom `tick_sync` type~~ → ✅ Fully implemented (Task 3)
- ~~"Dinner" activity orphaned~~ → ✅ Added to user options (2026-02-08)
- ~~Admin access control discrepancy~~ → ✅ Security rules hardened (2026-02-08)
- ~~Phantom fields (priceLevel, photoUrl)~~ → ✅ Admin UI implemented (2026-02-08)
- ~~Data normalization gaps~~ → ✅ All fixed (2026-02-08)
- ~~Edge case: active match blocking~~ → ✅ Comprehensive blocking (2026-02-08)
- ~~Place selection inconsistency~~ → ✅ Legacy system removed (2026-02-08)
- ~~Email verification not enforced~~ → ✅ Backend enforcement added (2026-02-08)
- ~~Retry/idempotency mechanism~~ → ✅ Full implementation with testing (2026-02-08)
- ~~Race conditions (U22)~~ → ✅ Atomic match creation with guards (2026-02-09)
- ~~Block during active match (U18)~~ → ✅ Block/Report in all match phases (2026-02-09)
- ~~Presence expiry mid-match (U19)~~ → ✅ Extended TTL + auto-cancel + restore logic (2026-02-10)
- ~~Presence cleanup edge case (U25)~~ → ✅ Delete or restore based on originalExpiresAt (2026-02-10)

**Unresolved (Not Blocking Production):**
- ⚠️ **U10, U26-U28 (LOW):** Minor gaps (reserved fields, location staleness, missing index, admin scalability)

---

## 📝 RECOMMENDATIONS

### Before Next Deploy
1. ✅ **NO CRITICAL ISSUES** — All critical issues resolved
2. ✅ All Phase 1-3 issues resolved (U9, U11-U15, U17)
3. ✅ Zero breaking changes introduced
4. ✅ Security hardened (admin whitelist, isAdmin protection, Phase 3 rules)
5. ✅ **READY FOR PRODUCTION DEPLOYMENT**
6. ⚠️ **4 KNOWN LIMITATIONS** - Document and prioritize for future phases (see unresolved issues above)

### Next Phase (Phase 5 - Enhancements & Issue Resolution)

**Priority Order for Unresolved Issues:**

1. **Medium Priority (Phase 5.1):**
   - ~~**U18:** Block auto-cancel for active matches~~ → ✅ Resolved (2026-02-09)
   - ~~**U19:** Add safeguards for presence expiry mid-match~~ → ✅ Resolved (2026-02-10)
   - ~~**U22:** Race condition hardening~~ → ✅ Resolved (2026-02-09)

2. **Low Priority (Phase 5.2+):**
   - **U27:** Add missing sessionHistory Firestore index
   - ~~**U25:** Fix presence cleanup edge case on match cancel~~ → ✅ Resolved (2026-02-10, part of U19)
   - **U26:** Implement periodic location refresh
   - **U28:** Build scalable admin management system
   - **U10:** Implement aggregate reliability metrics (meetRate/cancelRate)

3. **Advanced Features:**
   - Advanced analytics dashboard for admin
   - User feedback analytics leveraging `tick_sync` resolution data
   - Performance optimization and caching strategies

### Monitoring Recommendations (Post-Deploy)
1. ✅ Monitor `presenceCleanupExpired` scheduled job logs for successful execution
2. ✅ Verify Firestore storage size trends (should stabilize with presence cleanup)
3. ✅ Track `tick_sync` vs `both_same` resolution reasons for user behavior insights
4. ⚠️ Monitor admin access logs (verify whitelist enforcement after U13 fix)
5. ✅ Monitor `idempotencyCleanup` scheduled job (runs every 2 hours, cleans expired records)
6. ✅ Track idempotency collection size (should remain stable with cleanup)
7. ✅ Monitor for DUPLICATE_IN_PROGRESS errors (indicates concurrent requests with same key)
8. Watch for any deployment issues (none expected based on verification)

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