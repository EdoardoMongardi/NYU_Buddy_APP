/**
 * U22: Race Condition Emulator Test
 *
 * This test reproduces the race conditions identified in U22 and verifies that
 * the atomic match creation with pair-level guard prevents duplicate matches.
 *
 * Test Scenarios:
 * 1. Concurrent Opposite Accepts: Two users accepting each other's offers simultaneously
 * 2. Simultaneous Mutual Invites: Both users sending offers at the same time
 *
 * Expected Behavior:
 * - Only ONE guard document created per pair
 * - Only ONE active match document created per pair
 * - Both users end up in the same match (no duplicates)
 *
 * Run with:
 * ```bash
 * npm run test:u22
 * ```
 */

import * as admin from 'firebase-admin';
import { createMatchAtomic, getPairKey } from '../src/matches/createMatchAtomic';

// Initialize Firebase Admin SDK for emulator
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'nyu-buddy',
  });
}

// Point to emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

const db = admin.firestore();

// Test user IDs
const USER_A = 'test-user-a';
const USER_B = 'test-user-b';
const ACTIVITY = 'Coffee';
const DURATION = 30;

/**
 * Setup: Create test user presence documents
 */
async function setupTestUsers(): Promise<void> {
  console.log('📝 Setting up test users...');

  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 3600000); // 1 hour

  await Promise.all([
    db.collection('presence').doc(USER_A).set({
      uid: USER_A,
      status: 'available',
      activity: ACTIVITY,
      durationMinutes: DURATION,
      lat: 40.7299,
      lng: -73.9972,
      sessionId: 'test-session-a',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
    db.collection('presence').doc(USER_B).set({
      uid: USER_B,
      status: 'available',
      activity: ACTIVITY,
      durationMinutes: DURATION,
      lat: 40.7300,
      lng: -73.9973,
      sessionId: 'test-session-b',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }),
  ]);

  console.log('✅ Test users created');
}

/**
 * Cleanup: Remove test data
 */
async function cleanup(): Promise<void> {
  console.log('🧹 Cleaning up test data...');

  const batch = db.batch();

  // Delete test users' presence
  batch.delete(db.collection('presence').doc(USER_A));
  batch.delete(db.collection('presence').doc(USER_B));

  // Delete any matches
  const matchesSnap = await db.collection('matches')
    .where('user1Uid', 'in', [USER_A, USER_B])
    .get();
  matchesSnap.docs.forEach(doc => batch.delete(doc.ref));

  // Delete guard doc
  const pairKey = getPairKey(USER_A, USER_B);
  batch.delete(db.collection('activeMatchesByPair').doc(pairKey));

  // Delete any offers
  const offersSnap = await db.collection('offers')
    .where('fromUid', 'in', [USER_A, USER_B])
    .get();
  offersSnap.docs.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
  console.log('✅ Cleanup complete');
}

/**
 * Test 1: Concurrent Match Creation (Simulates race R1 + R2)
 *
 * Scenario: Both users try to create a match at exactly the same time
 * Expected: Only ONE match created, both get same matchId
 */
async function testConcurrentMatchCreation(): Promise<void> {
  console.log('\n🧪 TEST 1: Concurrent Match Creation');
  console.log('━'.repeat(60));

  await setupTestUsers();

  try {
    // Simulate both users trying to create match simultaneously
    const [result1, result2] = await Promise.all([
      createMatchAtomic({
        user1Uid: USER_A,
        user2Uid: USER_B,
        activity: ACTIVITY,
        durationMinutes: DURATION,
        user1Coords: { lat: 40.7299, lng: -73.9972 },
        user2Coords: { lat: 40.7300, lng: -73.9973 },
      }),
      createMatchAtomic({
        user1Uid: USER_A,
        user2Uid: USER_B,
        activity: ACTIVITY,
        durationMinutes: DURATION,
        user1Coords: { lat: 40.7299, lng: -73.9972 },
        user2Coords: { lat: 40.7300, lng: -73.9973 },
      }),
    ]);

    console.log(`\n📊 Results:`);
    console.log(`  Request 1: matchId=${result1.matchId.substring(0, 8)}..., isNew=${result1.isNewMatch}`);
    console.log(`  Request 2: matchId=${result2.matchId.substring(0, 8)}..., isNew=${result2.isNewMatch}`);

    // Verify both got same match ID
    if (result1.matchId !== result2.matchId) {
      throw new Error(`❌ FAIL: Different match IDs returned! ${result1.matchId} !== ${result2.matchId}`);
    }
    console.log(`  ✅ Both requests returned same matchId`);

    // Verify only one is marked as "new"
    const newCount = [result1.isNewMatch, result2.isNewMatch].filter(Boolean).length;
    if (newCount !== 1) {
      throw new Error(`❌ FAIL: Expected exactly 1 isNewMatch=true, got ${newCount}`);
    }
    console.log(`  ✅ Exactly one request created new match`);

    // Verify only ONE match document exists
    const matchesSnap = await db.collection('matches')
      .where('user1Uid', 'in', [USER_A, USER_B])
      .get();
    if (matchesSnap.size !== 1) {
      throw new Error(`❌ FAIL: Expected 1 match document, found ${matchesSnap.size}`);
    }
    console.log(`  ✅ Only 1 match document in Firestore`);

    // Verify only ONE guard document exists
    const pairKey = getPairKey(USER_A, USER_B);
    const guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    if (!guardDoc.exists) {
      throw new Error(`❌ FAIL: Guard document not found`);
    }
    const guardData = guardDoc.data()!;
    if (guardData.matchId !== result1.matchId) {
      throw new Error(`❌ FAIL: Guard matchId mismatch: ${guardData.matchId} !== ${result1.matchId}`);
    }
    console.log(`  ✅ Guard document exists and points to correct match`);

    // Verify both users' presence updated
    const [presenceA, presenceB] = await Promise.all([
      db.collection('presence').doc(USER_A).get(),
      db.collection('presence').doc(USER_B).get(),
    ]);
    if (presenceA.data()?.matchId !== result1.matchId || presenceB.data()?.matchId !== result1.matchId) {
      throw new Error(`❌ FAIL: Presence documents not updated correctly`);
    }
    if (presenceA.data()?.status !== 'matched' || presenceB.data()?.status !== 'matched') {
      throw new Error(`❌ FAIL: Presence status not set to 'matched'`);
    }
    console.log(`  ✅ Both users' presence updated to 'matched'`);

    console.log(`\n✅ TEST 1 PASSED: Race condition prevented!`);

  } finally {
    await cleanup();
  }
}

/**
 * Test 2: Concurrent Opposite Accepts (Simulates race R1)
 *
 * Scenario:
 * - User A sends offer to User B
 * - User B sends offer to User A
 * - Both accept at the same time
 * Expected: Only ONE match created
 */
async function testConcurrentOppositeAccepts(): Promise<void> {
  console.log('\n🧪 TEST 2: Concurrent Opposite Accepts');
  console.log('━'.repeat(60));

  await setupTestUsers();

  try {
    // Create opposite offers
    const now = admin.firestore.Timestamp.now();
    const [offerAtoB, offerBtoA] = await Promise.all([
      db.collection('offers').add({
        fromUid: USER_A,
        toUid: USER_B,
        activity: ACTIVITY,
        durationMin: DURATION,
        status: 'pending',
        createdAt: now,
      }),
      db.collection('offers').add({
        fromUid: USER_B,
        toUid: USER_A,
        activity: ACTIVITY,
        durationMin: DURATION,
        status: 'pending',
        createdAt: now,
      }),
    ]);

    console.log(`\n📨 Created opposite offers:`);
    console.log(`  A→B: ${offerAtoB.id.substring(0, 8)}...`);
    console.log(`  B→A: ${offerBtoA.id.substring(0, 8)}...`);

    // Simulate both users accepting simultaneously
    // In real code, this would go through offerRespond Cloud Function
    // Here we directly call createMatchAtomic to test the guard mechanism
    const [matchResult1, matchResult2] = await Promise.all([
      createMatchAtomic({
        user1Uid: USER_A,
        user2Uid: USER_B,
        activity: ACTIVITY,
        durationMinutes: DURATION,
        user1Coords: { lat: 40.7299, lng: -73.9972 },
        user2Coords: { lat: 40.7300, lng: -73.9973 },
        triggeringOfferId: offerAtoB.id,
      }),
      createMatchAtomic({
        user1Uid: USER_B,
        user2Uid: USER_A,
        activity: ACTIVITY,
        durationMinutes: DURATION,
        user1Coords: { lat: 40.7300, lng: -73.9973 },
        user2Coords: { lat: 40.7299, lng: -73.9972 },
        triggeringOfferId: offerBtoA.id,
      }),
    ]);

    console.log(`\n📊 Match Creation Results:`);
    console.log(`  Accept A→B: matchId=${matchResult1.matchId.substring(0, 8)}..., isNew=${matchResult1.isNewMatch}`);
    console.log(`  Accept B→A: matchId=${matchResult2.matchId.substring(0, 8)}..., isNew=${matchResult2.isNewMatch}`);

    // Assertions
    if (matchResult1.matchId !== matchResult2.matchId) {
      throw new Error(`❌ FAIL: Different matches created! ${matchResult1.matchId} !== ${matchResult2.matchId}`);
    }
    console.log(`  ✅ Both accepts resulted in same match`);

    const matchesSnap = await db.collection('matches')
      .where('user1Uid', 'in', [USER_A, USER_B])
      .get();
    if (matchesSnap.size !== 1) {
      throw new Error(`❌ FAIL: Expected 1 match, found ${matchesSnap.size}`);
    }
    console.log(`  ✅ Only 1 match document exists`);

    const pairKey = getPairKey(USER_A, USER_B);
    const guardDoc = await db.collection('activeMatchesByPair').doc(pairKey).get();
    if (!guardDoc.exists) {
      throw new Error(`❌ FAIL: Guard not found`);
    }
    console.log(`  ✅ Guard document exists`);

    console.log(`\n✅ TEST 2 PASSED: Concurrent opposite accepts handled correctly!`);

  } finally {
    await cleanup();
  }
}

/**
 * Test 3: Guard Persistence Across Failures
 *
 * Scenario: Verify guard remains after match creation to block subsequent attempts
 */
async function testGuardPersistence(): Promise<void> {
  console.log('\n🧪 TEST 3: Guard Persistence');
  console.log('━'.repeat(60));

  await setupTestUsers();

  try {
    // Create first match
    const result1 = await createMatchAtomic({
      user1Uid: USER_A,
      user2Uid: USER_B,
      activity: ACTIVITY,
      durationMinutes: DURATION,
      user1Coords: { lat: 40.7299, lng: -73.9972 },
      user2Coords: { lat: 40.7300, lng: -73.9973 },
    });

    console.log(`\n📊 First match created: ${result1.matchId.substring(0, 8)}...`);

    // Try to create another match (should return existing)
    const result2 = await createMatchAtomic({
      user1Uid: USER_A,
      user2Uid: USER_B,
      activity: ACTIVITY,
      durationMinutes: DURATION,
      user1Coords: { lat: 40.7299, lng: -73.9972 },
      user2Coords: { lat: 40.7300, lng: -73.9973 },
    });

    console.log(`\n📊 Second attempt result: ${result2.matchId.substring(0, 8)}..., isNew=${result2.isNewMatch}`);

    if (result2.isNewMatch) {
      throw new Error(`❌ FAIL: Second attempt created new match instead of returning existing`);
    }
    if (result1.matchId !== result2.matchId) {
      throw new Error(`❌ FAIL: Different match IDs returned`);
    }
    console.log(`  ✅ Second attempt returned existing match (idempotent)`);

    // Verify still only one match
    const matchesSnap = await db.collection('matches')
      .where('user1Uid', 'in', [USER_A, USER_B])
      .get();
    if (matchesSnap.size !== 1) {
      throw new Error(`❌ FAIL: Expected 1 match, found ${matchesSnap.size}`);
    }
    console.log(`  ✅ Still only 1 match document`);

    console.log(`\n✅ TEST 3 PASSED: Guard persists and prevents duplicate matches!`);

  } finally {
    await cleanup();
  }
}

/**
 * Main test runner
 */
async function runTests(): Promise<void> {
  console.log('🚀 Starting U22 Race Condition Tests');
  console.log('=' .repeat(60));
  console.log(`Testing against emulator: ${process.env.FIRESTORE_EMULATOR_HOST}`);

  try {
    await testConcurrentMatchCreation();
    await testConcurrentOppositeAccepts();
    await testGuardPersistence();

    console.log('\n' + '='.repeat(60));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('💥 TEST FAILED');
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);