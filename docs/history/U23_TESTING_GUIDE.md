# U23 Idempotency & Retry Testing Guide

Complete testing instructions for the U23 implementation (Idempotency + Client Retry).

## Quick Start: Debug Page

**Recommended**: Use the interactive debug page at `/idempotency-debug` for automated testing.

```bash
# Terminal 1: Start Firebase emulators
cd functions
npm run serve

# Terminal 2: Start dev server (from root directory)
npm run dev

# 3. Navigate to:
http://localhost:3001/idempotency-debug

# 4. Click test buttons to run automated tests
```

---

## Manual Testing Instructions

If you prefer manual testing or need to verify specific scenarios, follow these step-by-step instructions.

### Prerequisites

1. **Firebase Emulators Running**:
   ```bash
   cd functions
   npm run serve
   ```

2. **Dev Server Running**:
   ```bash
   npm run dev
   ```

3. **User Authenticated**: Log in to the app

4. **Browser DevTools Open**: Keep console open to see retry logs

---

## Test Suite

### ✅ Test 1: Concurrent Duplicate Calls (presenceStart)

**Objective**: Verify only ONE session is created when multiple concurrent requests arrive.

**Steps**:

1. Open browser console
2. Paste and run this code:
   ```javascript
   // Send 5 concurrent presenceStart requests
   const promises = Array(5).fill(null).map(() =>
     fetch('/api/presenceStart', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         activity: 'Coffee',
         durationMin: 30,
         lat: 40.7299,
         lng: -73.9972
       })
     })
   );

   Promise.allSettled(promises).then(results => {
     console.log('Results:', results);
     results.forEach((r, i) => {
       console.log(`Request ${i + 1}:`, r.status, r.value?.status);
     });
   });
   ```

3. **Expected Results**:
   - All 5 requests complete successfully
   - All return the SAME `sessionId`
   - Console shows retry logs: `[Retry] Duplicate in-progress detected`

4. **Verify in Firestore**:
   ```bash
   # Open Firestore emulator UI
   open http://localhost:4000/firestore

   # Check collections:
   - presence/{userId}: Only 1 document exists
   - sessionHistory/{userId}/sessions: Only 1 session document
   - idempotency: 1 record with status='completed'
   ```

**✅ Pass Criteria**:
- Only 1 presence document created
- Only 1 sessionHistory entry
- All requests return same sessionId
- No errors in console (except expected DUPLICATE_IN_PROGRESS during retry)

---

### ✅ Test 2: Parameter Mismatch (presenceStart)

**Objective**: Verify requests with different parameters don't reuse existing session.

**Steps**:

1. Start a Coffee session:
   ```javascript
   await fetch('/api/presenceStart', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       activity: 'Coffee',
       durationMin: 30,
       lat: 40.7299,
       lng: -73.9972
     })
   }).then(r => r.json()).then(console.log);
   ```

2. Wait 2 seconds

3. Try to start a Study session (should fail):
   ```javascript
   await fetch('/api/presenceStart', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       activity: 'Study',
       durationMin: 60,
       lat: 40.7299,
       lng: -73.9972
     })
   }).then(r => r.json()).then(console.log).catch(console.error);
   ```

**Expected Results**:
- First request succeeds
- Second request fails with error:
  ```
  "You already have an active 'Coffee' session.
   Please end it before starting a new 'Study' session."
  ```

**✅ Pass Criteria**:
- Coffee session created successfully
- Study request rejected with clear error message
- No duplicate sessions created

---

### ✅ Test 3: Stale Lock Detection

**Objective**: Verify locks stuck in 'processing' for >60s are auto-recovered.

**Steps**:

1. **Simulate stale lock** by manually creating an idempotency record:
   ```javascript
   // In Firestore emulator, create document:
   // Collection: idempotency
   // Document ID: {userId}_presenceStart_test-stale-key
   {
     requestId: 'test-stale-key',
     uid: '{your-user-id}',
     operation: 'presenceStart',
     status: 'processing',
     createdAt: new Date(Date.now() - 70000), // 70 seconds ago
     expiresAt: new Date(Date.now() + 7130000), // 2 hours from now
     processingStartedAt: new Date(Date.now() - 70000) // 70 seconds ago
   }
   ```

2. Send request with same idempotency key:
   ```javascript
   await fetch('/api/presenceStart', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       activity: 'Coffee',
       durationMin: 30,
       lat: 40.7299,
       lng: -73.9972,
       idempotencyKey: 'test-stale-key'
     })
   }).then(r => r.json()).then(console.log);
   ```

**Expected Results**:
- Console log: `[Idempotency] Stale lock detected (processing for 70s)`
- Lock marked as 'failed'
- Operation executes successfully
- New session created

**✅ Pass Criteria**:
- Stale lock detected (console log)
- Operation succeeds (not blocked by stale lock)
- Idempotency record updated to status='failed' or 'completed'

---

### ✅ Test 4: Client-Side Retry Behavior

**Objective**: Verify exponential backoff retry works for transient errors.

**Steps**:

1. **Simulate network error** (Chrome DevTools):
   - Open DevTools → Network tab
   - Set throttling to "Offline"

2. Send request:
   ```javascript
   const startTime = Date.now();

   await fetch('/api/presenceStart', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       activity: 'Coffee',
       durationMin: 30,
       lat: 40.7299,
       lng: -73.9972
     })
   }).then(r => r.json())
     .then(data => {
       const elapsed = (Date.now() - startTime) / 1000;
       console.log(`✅ Success after ${elapsed}s`, data);
     })
     .catch(error => {
       const elapsed = (Date.now() - startTime) / 1000;
       console.log(`❌ Failed after ${elapsed}s`, error);
     });
   ```

3. Wait 3 seconds, then set throttling back to "Online"

**Expected Results**:
- Console shows retry logs:
  ```
  [Retry] Attempt 1 failed (unavailable), retrying in 1000ms...
  [Retry] Attempt 2 failed (unavailable), retrying in 2000ms...
  [Retry] Attempt 3 succeeded
  ```
- Request eventually succeeds after reconnecting
- Total time: ~5-7 seconds (includes wait time)

**✅ Pass Criteria**:
- Automatic retry on transient errors
- Exponential backoff observed (1s → 2s → 4s)
- Request succeeds after network restored

---

### ✅ Test 5: Deadline Enforcement (15s timeout)

**Objective**: Verify requests timeout after 15 seconds, not indefinitely.

**Steps**:

1. **Simulate slow backend** by adding delay in Cloud Function:
   ```typescript
   // In functions/src/presence/start.ts, add at the beginning:
   await new Promise(resolve => setTimeout(resolve, 20000)); // 20s delay
   ```

2. Redeploy functions:
   ```bash
   cd functions
   npm run build
   firebase emulators:start --only functions
   ```

3. Send request:
   ```javascript
   const startTime = Date.now();

   await fetch('/api/presenceStart', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       activity: 'Coffee',
       durationMin: 30,
       lat: 40.7299,
       lng: -73.9972
     })
   }).catch(error => {
     const elapsed = (Date.now() - startTime) / 1000;
     console.log(`Timeout after ${elapsed}s`, error.message);
   });
   ```

**Expected Results**:
- Request times out after ~15 seconds (not 20s)
- Error message:
  ```
  "Your request is still being processed.
   Please check your inbox or matches page in a moment.
   Avoid tapping repeatedly."
  ```
- Error code: `processing-timeout`

**✅ Pass Criteria**:
- Timeout occurs at ~15 seconds (±2s)
- User-friendly error message (not generic "network error")
- No indefinite hanging

**Cleanup**: Remove the artificial delay from the function.

---

### ✅ Test 6: Rapid Fire (Stress Test)

**Objective**: Verify system handles rapid duplicate requests (accidental double-taps).

**Steps**:

1. Send 20 rapid requests:
   ```javascript
   const startTime = Date.now();
   const promises = [];

   for (let i = 0; i < 20; i++) {
     promises.push(
       fetch('/api/presenceStart', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           activity: 'Coffee',
           durationMin: 30,
           lat: 40.7299,
           lng: -73.9972
         })
       }).then(r => r.json())
     );
   }

   Promise.allSettled(promises).then(results => {
     const elapsed = (Date.now() - startTime) / 1000;
     const successful = results.filter(r => r.status === 'fulfilled').length;

     console.log(`Completed ${successful}/20 requests in ${elapsed}s`);
     console.log('All returned same sessionId?',
       new Set(results.map(r => r.value?.sessionId)).size === 1
     );
   });
   ```

**Expected Results**:
- All 20 requests complete
- All return the SAME `sessionId`
- Total time: <5 seconds (most are cached/deduplicated)

**Verify in Firestore**:
- Only 1 presence document
- Only 1 sessionHistory entry
- 1 idempotency record (status='completed')

**✅ Pass Criteria**:
- No duplicate sessions
- No database write conflicts
- All requests return same result

---

### ✅ Test 7: Error Classification (Non-Retryable Errors)

**Objective**: Verify non-retryable errors fail immediately without retry.

**Steps**:

1. **Trigger permission-denied error** (send offer without active session):
   ```javascript
   const startTime = Date.now();

   await fetch('/api/offerCreate', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({
       targetUid: 'fake-user-id'
     })
   }).catch(error => {
     const elapsed = (Date.now() - startTime) / 1000;
     console.log(`Failed after ${elapsed}s`, error.code, error.message);
   });
   ```

**Expected Results**:
- Request fails IMMEDIATELY (~0.5s, not 15s)
- Error code: `permission-denied`
- No retry attempts in console
- Clear error message explaining the issue

**✅ Pass Criteria**:
- Fails immediately (<2s)
- No retry attempts
- Appropriate error code and message

---

## Production Verification

After deployment to staging/production, verify with real traffic:

### 1. Monitor Cloud Functions Logs

```bash
firebase functions:log --only presenceStart,offerCreate,offerRespond,matchCancel --tail
```

**Look for**:
- `[Idempotency] Lock acquired` - Normal operation
- `[Idempotency] Cache hit` - Duplicate detected, returning cached result ✅
- `[Idempotency] Duplicate in-progress` - Concurrent duplicate, will retry
- `[Idempotency] Stale lock detected` - Auto-recovery working ✅

**Red flags**:
- No cache hit logs (idempotency not working)
- Frequent stale locks (functions crashing)
- Many processing timeouts (backend too slow)

### 2. Monitor Idempotency Cleanup Job

```bash
firebase functions:log --only idempotencyCleanup --tail
```

**Expected logs** (every 2 hours):
```
[idempotencyCleanup] Starting cleanup job
[idempotencyCleanup] Deleted 150 expired records
```

**Red flags**:
- Deleted count approaching 2000 (capacity limit)
- Cleanup failing (check permissions)

### 3. Check Firestore Metrics

Open Firebase Console → Firestore → Usage tab:

**Expected**:
- `idempotency` collection size: <10MB (cleanup working)
- Read operations: Normal increase (not exponential)
- Write operations: Steady (no write storms)

**Red flags**:
- `idempotency` collection growing unbounded (cleanup failing)
- Spike in write operations (duplicate storm)

### 4. User Experience Metrics

Track in your analytics:

**Good indicators**:
- "processing-timeout" errors: <1% of requests
- Duplicate matches created: 0% (vs 2-5% before U23)
- User complaints about "double sessions": 0 (vs previous issues)

**Red flags**:
- Timeout errors >5% (backend too slow or deadline too short)
- Users reporting "can't start session" (parameter mismatch logic too strict)

---

## Troubleshooting

### Issue: Idempotency not working (duplicates still created)

**Symptoms**: Multiple sessions/offers/matches with same request

**Checks**:
1. Client sending idempotencyKey?
   ```javascript
   // Check in browser DevTools → Network tab → Request payload
   // Should include: idempotencyKey: "uuid-here"
   ```

2. Backend receiving idempotencyKey?
   ```bash
   # Check function logs
   firebase functions:log --tail | grep "idempotencyKey"
   ```

3. Firestore index deployed?
   ```bash
   firebase deploy --only firestore:indexes
   ```

**Fix**: Ensure retry wrapper is applied to all 4 high-value functions.

---

### Issue: Stale locks frequently detected

**Symptoms**: Many `[Idempotency] Stale lock detected` logs

**Root Cause**: Functions crashing or timing out before completing

**Checks**:
1. Function timeout settings (default: 60s)
2. Memory allocation (may need increase)
3. Cold start time (optimize dependencies)

**Fix**:
```javascript
// Increase timeout in functions/src/index.ts
export const presenceStart = onCall(
  { region: 'us-east1', timeoutSeconds: 120 }, // Increase if needed
  presenceStartHandler
);
```

---

### Issue: Processing timeouts common (>5% of requests)

**Symptoms**: Users see "still processing" message frequently

**Root Cause**: Backend genuinely slow or 15s deadline too short

**Checks**:
1. Cold start time (should be <5s)
2. Database query performance (check indexes)
3. External API calls (Google Places, etc.)

**Fix Options**:
1. Optimize backend (reduce cold start)
2. Increase deadline to 20s:
   ```typescript
   // In src/lib/utils/retry.ts
   maxTotalMs = 20000 // Increase to 20s
   ```

---

### Issue: "Already have active session" error on legitimate retry

**Symptoms**: User retries presenceStart, gets rejected

**Root Cause**: First request succeeded but client thinks it failed

**Check**: Network logs to see if first request actually completed

**Fix**: Educate users to check presence status before retrying, or add auto-check in UI:
```typescript
// Before calling presenceStart, check if already active
const presenceDoc = await getDoc(doc(db, 'presence', userId));
if (presenceDoc.exists() && presenceDoc.data().status === 'available') {
  // Already active, don't call presenceStart
  return presenceDoc.data();
}
```

---

## Success Metrics

After U23 deployment, you should see:

| Metric | Before U23 | After U23 | Target |
|--------|-----------|-----------|---------|
| Duplicate matches | 2-5% | <0.1% | 0% |
| Duplicate sessionHistory entries | 1-2/day | 0 | 0 |
| Processing timeout errors | N/A | <1% | <2% |
| User "double session" complaints | 2-3/week | 0 | 0 |
| Stale lock auto-recoveries | N/A | <5/day | <10/day |
| Idempotency storage growth | N/A | <10MB | <50MB |

---

## Automated Testing Script

For CI/CD integration, use this test script:

```bash
#!/bin/bash
# tests/u23-integration-test.sh

echo "🧪 U23 Idempotency Integration Tests"
echo "===================================="

# Start emulators
firebase emulators:start --only functions,firestore &
EMULATOR_PID=$!
sleep 10

# Run tests
npm run test:u23

# Capture exit code
TEST_EXIT_CODE=$?

# Stop emulators
kill $EMULATOR_PID

# Report results
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All U23 tests passed!"
  exit 0
else
  echo "❌ U23 tests failed"
  exit 1
fi
```

Add to `package.json`:
```json
{
  "scripts": {
    "test:u23": "jest tests/u23/*.test.ts"
  }
}
```

---

## Summary

**Quick Testing** (5 minutes):
1. Open `/idempotency-debug`
2. Run all 4 test scenarios
3. Verify: No duplicates, parameter mismatch works, retry behavior correct

**Comprehensive Testing** (30 minutes):
1. Follow all 7 manual test scenarios
2. Verify Firestore state after each test
3. Check console logs for expected behavior

**Production Monitoring** (Ongoing):
1. Watch function logs for cache hits
2. Monitor cleanup job (every 2 hours)
3. Track timeout errors (<1%)
4. Verify zero duplicate entities

**Success Criteria**:
✅ Zero duplicate matches/offers/sessions
✅ Parameter mismatch correctly rejected
✅ Stale locks auto-recover
✅ Timeout errors <1%
✅ User-friendly error messages
✅ Cleanup job running smoothly

---

## Next Steps

1. ✅ Complete all manual tests
2. ✅ Deploy to staging
3. ✅ Monitor for 24 hours
4. ✅ Run stress test with 100+ concurrent users
5. ✅ Deploy to production
6. ✅ Update runbook with U23 troubleshooting

**Questions?** Check function logs or Firestore console for detailed debugging.