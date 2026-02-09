'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { getFirebaseDb } from '@/lib/firebase/client';
import {
  presenceStart,
  presenceEnd,
  matchCancel,
  updateMatchStatus,
  matchFetchAllPlaces,
  matchSetPlaceChoice,
  matchResolvePlaceIfNeeded,
} from '@/lib/firebase/functions';
import {
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  limit,
  getDocs,
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Phase 3 Rules Testing Page
 *
 * This page helps verify that Firestore security rules are correctly enforced
 * after Phase 3 hardening. All direct writes should fail with permission-denied,
 * while Cloud Functions should continue to work.
 *
 * ⚠️ USE ONLY IN STAGING/DEVELOPMENT - NOT PRODUCTION
 */
export default function DebugRulesPage() {
  const { user } = useAuth();
  const [log, setLog] = useState<string>('');

  function append(msg: string) {
    const timestamp = new Date().toLocaleTimeString();
    setLog((prev) => `[${timestamp}] ${msg}\n${prev}`);
  }

  function clearLog() {
    setLog('');
  }

  // ========================================================================
  // TEST 1: Direct Writes Should Fail (Rules Block)
  // ========================================================================

  async function testPresenceDirectWrite() {
    if (!user) {
      append('❌ Not authenticated');
      return;
    }

    append('🧪 TEST: Direct write to presence (should fail)');
    try {
      const presenceRef = doc(getFirebaseDb(), 'presence', user.uid);
      await setDoc(
        presenceRef,
        {
          status: 'matched',
          matchId: 'fake-match-id',
          hackedAt: serverTimestamp(),
        },
        { merge: true }
      );
      append('❌ UNEXPECTED: Presence write succeeded - RULES NOT ENFORCED!');
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append('✅ Expected: permission-denied');
      } else {
        append(`⚠️ Unexpected error: ${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchDirectUpdate() {
    const matchId = prompt('Enter a matchId you participate in (or any matchId to test):');
    if (!matchId) return;

    append(`🧪 TEST: Direct update to matches/${matchId} (should fail)`);
    try {
      const matchRef = doc(getFirebaseDb(), 'matches', matchId);
      await updateDoc(matchRef, {
        status: 'completed',
        hackedAt: serverTimestamp(),
      });
      append('❌ UNEXPECTED: Match update succeeded - RULES NOT ENFORCED!');
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append('✅ Expected: permission-denied');
      } else {
        append(`⚠️ Unexpected error: ${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchesGlobalRead() {
    append('🧪 TEST: List all matches (should only return matches where you are participant)');
    try {
      const q = query(collection(getFirebaseDb(), 'matches'), limit(10));
      const snap = await getDocs(q);
      append(`✅ Query succeeded, returned ${snap.size} matches`);

      if (snap.size === 0) {
        append('   ℹ️ No matches returned (either no matches exist, or rules block non-participant reads)');
      } else {
        snap.forEach((d) => {
          const data = d.data();
          const isParticipant = data.user1Uid === user?.uid || data.user2Uid === user?.uid;
          if (isParticipant) {
            append(`   ✅ matchId=${d.id} (you are participant)`);
          } else {
            append(`   ❌ matchId=${d.id} (you are NOT participant - RULES LEAK!)`);
          }
        });
      }
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append('✅ Expected: permission-denied (no global read access)');
      } else {
        append(`⚠️ Unexpected error: ${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testSessionHistoryWrite() {
    if (!user) {
      append('❌ Not authenticated');
      return;
    }

    append('🧪 TEST: Direct write to sessionHistory (should fail)');
    try {
      const sessionRef = doc(
        getFirebaseDb(),
        'sessionHistory',
        user.uid,
        'sessions',
        'test-session-id'
      );
      await setDoc(sessionRef, {
        hackedAt: serverTimestamp(),
      });
      append('❌ UNEXPECTED: sessionHistory write succeeded - RULES NOT ENFORCED!');
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append('✅ Expected: permission-denied');
      } else {
        append(`⚠️ Unexpected error: ${error?.code || error?.message || String(e)}`);
      }
    }
  }

  // ========================================================================
  // TEST 2: Cloud Functions Should Still Work
  // ========================================================================

  async function testPresenceStartFunction() {
    append('🧪 TEST: presenceStart via Cloud Function (should succeed)');
    try {
      const result = await presenceStart({
        activity: 'Coffee',
        durationMin: 30,
        lat: 40.7295, // NYU Washington Square
        lng: -73.9965,
      });
      append('✅ presenceStart succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      append(`❌ presenceStart failed: ${error?.code || error?.message || String(e)}`);
    }
  }

  async function testPresenceEndFunction() {
    append('🧪 TEST: presenceEnd via Cloud Function (should succeed)');
    try {
      const result = await presenceEnd();
      append('✅ presenceEnd succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      // If no presence exists, this might fail with a business logic error (not permission-denied)
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ presenceEnd: ${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchCancelFunction() {
    const matchId = prompt('Enter a matchId you participate in:');
    if (!matchId) return;

    append(`🧪 TEST: matchCancel via Cloud Function (should succeed)`);
    try {
      const result = await matchCancel({
        matchId,
        reason: 'Testing Phase 3 rules',
      });
      append('✅ matchCancel succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ matchCancel: \${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testUpdateMatchStatusFunction() {
    const matchId = prompt('Enter a matchId you participate in:');
    if (!matchId) return;

    append(`🧪 TEST: updateMatchStatus via Cloud Function (should succeed)`);
    try {
      const result = await updateMatchStatus({
        matchId,
        status: 'heading_there',
      });
      append('✅ updateMatchStatus succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ updateMatchStatus: \${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchFetchAllPlacesFunction() {
    const matchId = prompt('Enter a matchId you participate in:');
    if (!matchId) return;

    append(`🧪 TEST: matchFetchAllPlaces via Cloud Function (should succeed)`);
    try {
      const result = await matchFetchAllPlaces({ matchId });
      append('✅ matchFetchAllPlaces succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ matchFetchAllPlaces: \${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchSetPlaceChoiceFunction() {
    const matchId = prompt('Enter a matchId you participate in:');
    if (!matchId) return;
    const placeId = prompt('Enter a placeId to choose:') || 'test-place-id';

    append(`🧪 TEST: matchSetPlaceChoice via Cloud Function (should succeed)`);
    try {
      const result = await matchSetPlaceChoice({
        matchId,
        placeId,
        placeRank: 1,
        action: 'choose',
      });
      append('✅ matchSetPlaceChoice succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ matchSetPlaceChoice: \${error?.code || error?.message || String(e)}`);
      }
    }
  }

  async function testMatchResolvePlaceIfNeededFunction() {
    const matchId = prompt('Enter a matchId you participate in:');
    if (!matchId) return;

    append(`🧪 TEST: matchResolvePlaceIfNeeded via Cloud Function (should succeed)`);
    try {
      const result = await matchResolvePlaceIfNeeded({ matchId });
      append('✅ matchResolvePlaceIfNeeded succeeded: ' + JSON.stringify(result.data));
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error?.code === 'permission-denied') {
        append(`❌ UNEXPECTED: permission-denied (Cloud Function should use Admin SDK)`);
      } else {
        append(`ℹ️ matchResolvePlaceIfNeeded: \${error?.code || error?.message || String(e)}`);
      }
    }
  }

  // ========================================================================
  // Render
  // ========================================================================

  if (!user) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Debug: Rules Testing</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              ⚠️ You must be logged in to use this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Phase 3: Firestore Rules Testing</CardTitle>
          <p className="text-sm text-muted-foreground">
            ⚠️ Use this page only in staging/development. Tests will fail with permission-denied
            if rules are correctly enforced.
          </p>
          <p className="text-sm text-muted-foreground">
            Logged in as: <code className="bg-muted px-1 rounded">{user.email}</code>
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test 1: Direct Writes Should Fail ❌</CardTitle>
          <p className="text-sm text-muted-foreground">
            These operations should all return permission-denied after Phase 3 hardening.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={testPresenceDirectWrite} variant="outline">
            Test: Direct write to presence
          </Button>
          <Button onClick={testMatchDirectUpdate} variant="outline">
            Test: Direct update to matches
          </Button>
          <Button onClick={testMatchesGlobalRead} variant="outline">
            Test: Global read of matches
          </Button>
          <Button onClick={testSessionHistoryWrite} variant="outline">
            Test: Direct write to sessionHistory
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test 2: Cloud Functions Should Work ✅</CardTitle>
          <p className="text-sm text-muted-foreground">
            Cloud Functions use Admin SDK and should bypass rules.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={testPresenceStartFunction} variant="outline">
            Test: presenceStart (Cloud Function)
          </Button>
          <Button onClick={testPresenceEndFunction} variant="outline">
            Test: presenceEnd (Cloud Function)
          </Button>
          <Button onClick={testMatchCancelFunction} variant="outline">
            Test: matchCancel (Cloud Function)
          </Button>
          <Button onClick={testUpdateMatchStatusFunction} variant="outline">
            Test: updateMatchStatus (Cloud Function)
          </Button>
          <Button onClick={testMatchFetchAllPlacesFunction} variant="outline">
            Test: matchFetchAllPlaces (Cloud Function)
          </Button>
          <Button onClick={testMatchSetPlaceChoiceFunction} variant="outline">
            Test: matchSetPlaceChoice (Cloud Function)
          </Button>
          <Button onClick={testMatchResolvePlaceIfNeededFunction} variant="outline">
            Test: matchResolvePlaceIfNeeded (Cloud Function)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Test Log</CardTitle>
          <Button onClick={clearLog} variant="ghost" size="sm">
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-black text-green-400 p-4 rounded-lg text-xs overflow-x-auto h-96 overflow-y-auto">
            {log || '--- waiting for tests ---'}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-yellow-500">
        <CardHeader>
          <CardTitle>Expected Results</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            ✅ <strong>Test 1 (Direct Writes):</strong> All should fail with permission-denied
          </p>
          <p>
            ✅ <strong>Test 2 (Cloud Functions):</strong> All should succeed (unless business logic errors)
          </p>
          <p>
            ❌ <strong>If any direct write succeeds:</strong> Rules are NOT enforced - do NOT deploy to production
          </p>
          <p>
            ❌ <strong>If Cloud Functions fail with permission-denied:</strong> Something is broken (Admin SDK should bypass rules)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}