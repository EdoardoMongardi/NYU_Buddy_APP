/**
 * U22 Race Condition Fix - Verification Tests
 *
 * These tests verify the critical fixes for race conditions in match creation:
 * 1. User-level mutual exclusion (A can't match with both B and C)
 * 2. Pair-level guard (same pair can't create duplicate matches)
 * 3. Guard release on completion (completed matches allow rematch)
 * 4. Guard release on cancel/timeout (cancelled matches allow rematch)
 *
 * Run with:
 * ```bash
 * npm run build && ts-node --project tsconfig.json test/u22-verification-tests.ts
 * ```
 *
 * Or add to package.json:
 * "test:verification": "npm run build && ts-node --project tsconfig.json test/u22-verification-tests.ts"
 */

import * as admin from 'firebase-admin';
import { createMatchAtomic, releaseMatchGuard, getPairKey } from '../src/matches/createMatchAtomic';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'nyu-buddy',
  });
}

const db = admin.firestore();

// Test utilities
function log(test: string, message: string) {
  console.log(`[${test}] ${message}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function createTestPresence(uid: string, activity: string, durationMin: number) {
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  await db.collection('presence').doc(uid).set({
    status: 'available',
    activity,
    durationMin,
    lat: 40.7128,
    lng: -74.0060,
    expiresAt,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function cleanupTestData(uids: string[]) {
  const batch = db.batch();

  for (const uid of uids) {
    batch.delete(db.collection('presence').doc(uid));
  }

  // Clean up matches
  for (const uid of uids) {
    const matchesSnapshot = await db.collection('matches')
      .where('user1Uid', '==', uid)
      .get();
    matchesSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    const matchesSnapshot2 = await db.collection('matches')
      .where('user2Uid', '==', uid)
      .get();
    matchesSnapshot2.docs.forEach(doc => batch.delete(doc.ref));
  }

  // Clean up guards
  for (let i = 0; i < uids.length; i++) {
    for (let j = i + 1; j < uids.length; j++) {
      const pairKey = getPairKey(uids[i], uids[j]);
      batch.delete(db.collection('activeMatchesByPair').doc(pairKey));
    }
  }

  await batch.commit();
}

/**
 * Test 1: User-Level Mutual Exclusion
 */
async function test1_userLevelMutualExclusion() {
  const testName = 'Test 1: User-Level Mutual Exclusion';
  console.log(`\n${'='.repeat(60)}`);
  console.log(testName);
  console.log('='.repeat(60));

  const userA = 'test_user_A_' + Date.now();
  const userB = 'test_user_B_' + Date.now();
  const userC = 'test_user_C_' + Date.now();

  try {
    log(testName, 'Setting up test presences...');
    await createTestPresence(userA, 'coffee', 30);
    await createTestPresence(userB, 'coffee', 30);
    await createTestPresence(userC, 'coffee', 30);

    // Step 1: Create match A-B
    log(testName, 'Step 1: Creating match A-B...');
    const abResult = await createMatchAtomic({
      user1Uid: userA,
      user2Uid: userB,
      activity: 'coffee',
      durationMinutes: 30,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(abResult.isNewMatch, 'A-B match should be new');
    log(testName, `✓ Created match A-B: ${abResult.matchId}`);

    // Verify guard exists
    const abPairKey = getPairKey(userA, userB);
    const abGuard = await db.collection('activeMatchesByPair').doc(abPairKey).get();
    assert(abGuard.exists, 'A-B guard should exist');
    log(testName, '✓ A-B guard verified');

    // Step 2: Try to create match A-C (should fail/return existing A-B match)
    log(testName, 'Step 2: Attempting to create match A-C (should return existing A-B)...');
    const acResult = await createMatchAtomic({
      user1Uid: userA,
      user2Uid: userC,
      activity: 'coffee',
      durationMinutes: 30,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(!acResult.isNewMatch, 'A-C should return existing match (not create new)');
    assert(acResult.matchId === abResult.matchId, 'Should return existing A-B matchId');
    log(testName, `✓ A-C returned existing match: ${acResult.matchId}`);

    // Verify no A-C guard created
    const acPairKey = getPairKey(userA, userC);
    const acGuard = await db.collection('activeMatchesByPair').doc(acPairKey).get();
    assert(!acGuard.exists, 'A-C guard should NOT exist');
    log(testName, '✓ A-C guard does not exist (correct)');

    // Verify C is still available
    const presenceC = await db.collection('presence').doc(userC).get();
    assert(presenceC.data()?.status === 'available', 'User C should still be available');
    log(testName, '✓ User C is still available');

    console.log(`\n✅ ${testName} PASSED\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${testName} FAILED:`, error);
    return false;
  } finally {
    await cleanupTestData([userA, userB, userC]);
  }
}

/**
 * Test 2: Pair-Level Guard (Concurrent Opposite Accepts)
 */
async function test2_pairLevelGuard() {
  const testName = 'Test 2: Pair-Level Guard';
  console.log(`\n${'='.repeat(60)}`);
  console.log(testName);
  console.log('='.repeat(60));

  const userD = 'test_user_D_' + Date.now();
  const userE = 'test_user_E_' + Date.now();

  try {
    log(testName, 'Setting up test presences...');
    await createTestPresence(userD, 'lunch', 60);
    await createTestPresence(userE, 'lunch', 60);

    log(testName, 'Simulating concurrent opposite accepts...');
    const [result1, result2] = await Promise.all([
      createMatchAtomic({
        user1Uid: userD,
        user2Uid: userE,
        activity: 'lunch',
        durationMinutes: 60,
        user1Coords: { lat: 40.7128, lng: -74.0060 },
        user2Coords: { lat: 40.7128, lng: -74.0060 },
      }),
      createMatchAtomic({
        user1Uid: userE,
        user2Uid: userD,
        activity: 'lunch',
        durationMinutes: 60,
        user1Coords: { lat: 40.7128, lng: -74.0060 },
        user2Coords: { lat: 40.7128, lng: -74.0060 },
      }),
    ]);

    // Verify only one new match was created
    const newMatchCount = (result1.isNewMatch ? 1 : 0) + (result2.isNewMatch ? 1 : 0);
    assert(newMatchCount === 1, 'Exactly one new match should be created');
    log(testName, `✓ Only 1 new match created (result1.isNew=${result1.isNewMatch}, result2.isNew=${result2.isNewMatch})`);

    // Verify both return same matchId
    assert(result1.matchId === result2.matchId, 'Both results should reference the same match');
    log(testName, `✓ Both results reference same match: ${result1.matchId}`);

    // Verify only one guard exists
    const pairKey = getPairKey(userD, userE);
    const guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(guardDoc.exists, 'Guard should exist');
    assert(guardDoc.data()?.matchId === result1.matchId, 'Guard should reference the match');
    log(testName, '✓ Single guard exists and references correct match');

    console.log(`\n✅ ${testName} PASSED\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${testName} FAILED:`, error);
    return false;
  } finally {
    await cleanupTestData([userD, userE]);
  }
}

/**
 * Test 3: Guard Release on Completion
 */
async function test3_guardReleaseOnCompletion() {
  const testName = 'Test 3: Guard Release on Completion';
  console.log(`\n${'='.repeat(60)}`);
  console.log(testName);
  console.log('='.repeat(60));

  const userF = 'test_user_F_' + Date.now();
  const userG = 'test_user_G_' + Date.now();

  try {
    log(testName, 'Setting up test presences...');
    await createTestPresence(userF, 'study', 120);
    await createTestPresence(userG, 'study', 120);

    // Step 1: Create first match
    log(testName, 'Step 1: Creating first match...');
    const match1 = await createMatchAtomic({
      user1Uid: userF,
      user2Uid: userG,
      activity: 'study',
      durationMinutes: 120,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(match1.isNewMatch, 'First match should be new');
    log(testName, `✓ Created first match: ${match1.matchId}`);

    const pairKey = getPairKey(userF, userG);
    let guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(guardDoc.exists, 'Guard should exist after first match');
    log(testName, '✓ Guard exists');

    // Step 2: Complete the match
    log(testName, 'Step 2: Completing match...');
    await db.collection('matches').doc(match1.matchId).update({
      status: 'completed',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Step 3: Release guard
    log(testName, 'Step 3: Releasing guard...');
    await releaseMatchGuard(match1.matchId, userF, userG);

    guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(!guardDoc.exists, 'Guard should be released after completion');
    log(testName, '✓ Guard released');

    // Step 4: Reset presence to available
    log(testName, 'Step 4: Resetting presence...');
    await Promise.all([
      db.collection('presence').doc(userF).update({
        status: 'available',
        matchId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      db.collection('presence').doc(userG).update({
        status: 'available',
        matchId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    log(testName, '✓ Presence reset to available');

    // Step 5: Create second match (rematch should succeed)
    log(testName, 'Step 5: Creating rematch...');
    const match2 = await createMatchAtomic({
      user1Uid: userF,
      user2Uid: userG,
      activity: 'study',
      durationMinutes: 120,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(match2.isNewMatch, 'Rematch should be new');
    assert(match2.matchId !== match1.matchId, 'Rematch should have different ID');
    log(testName, `✓ Created rematch: ${match2.matchId}`);

    guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(guardDoc.exists, 'New guard should exist for rematch');
    assert(guardDoc.data()?.matchId === match2.matchId, 'Guard should reference new match');
    log(testName, '✓ New guard created for rematch');

    console.log(`\n✅ ${testName} PASSED\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${testName} FAILED:`, error);
    return false;
  } finally {
    await cleanupTestData([userF, userG]);
  }
}

/**
 * Test 4: Guard Release on Cancel
 */
async function test4_guardReleaseOnCancel() {
  const testName = 'Test 4: Guard Release on Cancel';
  console.log(`\n${'='.repeat(60)}`);
  console.log(testName);
  console.log('='.repeat(60));

  const userH = 'test_user_H_' + Date.now();
  const userI = 'test_user_I_' + Date.now();

  try {
    log(testName, 'Setting up test presences...');
    await createTestPresence(userH, 'gym', 90);
    await createTestPresence(userI, 'gym', 90);

    // Step 1: Create first match
    log(testName, 'Step 1: Creating first match...');
    const match1 = await createMatchAtomic({
      user1Uid: userH,
      user2Uid: userI,
      activity: 'gym',
      durationMinutes: 90,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(match1.isNewMatch, 'First match should be new');
    log(testName, `✓ Created first match: ${match1.matchId}`);

    const pairKey = getPairKey(userH, userI);
    let guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(guardDoc.exists, 'Guard should exist after first match');
    log(testName, '✓ Guard exists');

    // Step 2: Cancel the match
    log(testName, 'Step 2: Cancelling match...');
    await db.collection('matches').doc(match1.matchId).update({
      status: 'cancelled',
      cancelledBy: userH,
      cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Step 3: Release guard
    log(testName, 'Step 3: Releasing guard...');
    await releaseMatchGuard(match1.matchId, userH, userI);

    guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(!guardDoc.exists, 'Guard should be released after cancellation');
    log(testName, '✓ Guard released');

    // Step 4: Reset presence to available
    log(testName, 'Step 4: Resetting presence...');
    await Promise.all([
      db.collection('presence').doc(userH).update({
        status: 'available',
        matchId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
      db.collection('presence').doc(userI).update({
        status: 'available',
        matchId: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }),
    ]);
    log(testName, '✓ Presence reset to available');

    // Step 5: Create second match (rematch should succeed)
    log(testName, 'Step 5: Creating rematch...');
    const match2 = await createMatchAtomic({
      user1Uid: userH,
      user2Uid: userI,
      activity: 'gym',
      durationMinutes: 90,
      user1Coords: { lat: 40.7128, lng: -74.0060 },
      user2Coords: { lat: 40.7128, lng: -74.0060 },
    });

    assert(match2.isNewMatch, 'Rematch should be new');
    assert(match2.matchId !== match1.matchId, 'Rematch should have different ID');
    log(testName, `✓ Created rematch: ${match2.matchId}`);

    guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    assert(guardDoc.exists, 'New guard should exist for rematch');
    assert(guardDoc.data()?.matchId === match2.matchId, 'Guard should reference new match');
    log(testName, '✓ New guard created for rematch');

    console.log(`\n✅ ${testName} PASSED\n`);
    return true;
  } catch (error) {
    console.error(`\n❌ ${testName} FAILED:`, error);
    return false;
  } finally {
    await cleanupTestData([userH, userI]);
  }
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('U22 VERIFICATION TESTS');
  console.log('='.repeat(60));
  console.log('Testing critical race condition fixes...\n');

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
  };

  results.test1 = await test1_userLevelMutualExclusion();
  results.test2 = await test2_pairLevelGuard();
  results.test3 = await test3_guardReleaseOnCompletion();
  results.test4 = await test4_guardReleaseOnCancel();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Test 1 - User-Level Mutual Exclusion: ${results.test1 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Test 2 - Pair-Level Guard: ${results.test2 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Test 3 - Guard Release on Completion: ${results.test3 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Test 4 - Guard Release on Cancel: ${results.test4 ? '✅ PASSED' : '❌ FAILED'}`);

  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('🎉 ALL TESTS PASSED! U22 fixes verified.');
  } else {
    console.log('⚠️  SOME TESTS FAILED. Review errors above.');
  }
  console.log('='.repeat(60) + '\n');

  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});