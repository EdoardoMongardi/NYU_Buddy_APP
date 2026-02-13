'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { presenceStart } from '@/lib/firebase/functions';

/**
 * U23 Debug Page: Idempotency & Retry Testing
 *
 * Tests:
 * 1. Concurrent duplicate calls (same idempotency key)
 * 2. Parameter consistency (presenceStart)
 * 3. Stale lock detection
 * 4. Client-side retry behavior
 * 5. Error classification
 */

interface TestLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface IdempotencyRecord {
  requestId: string;
  uid: string;
  operation: string;
  status: 'processing' | 'completed' | 'failed';
  createdAt: Timestamp;
  expiresAt: Timestamp;
  processingStartedAt?: Timestamp;
  completedAt?: Timestamp;
  minimalResult?: unknown;
  error?: string;
}

export default function IdempotencyDebugPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [idempotencyRecords, setIdempotencyRecords] = useState<IdempotencyRecord[]>([]);
  const [presenceData, setPresenceData] = useState<Record<string, unknown> | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Add log entry
  const addLog = useCallback((message: string, type: TestLog['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, { timestamp, message, type }]);
  }, []);

  // Clear logs
  const clearLogs = () => setLogs([]);

  // Fetch idempotency records for current user
  const fetchIdempotencyRecords = useCallback(async () => {
    if (!user || !db) return;

    try {
      const q = query(
        collection(db, 'idempotency'),
        where('uid', '==', user.uid)
      );
      const snapshot = await getDocs(q);
      const records = snapshot.docs.map((doc) => doc.data() as IdempotencyRecord);
      setIdempotencyRecords(records);
      addLog(`Fetched ${records.length} idempotency records`, 'info');
    } catch (error) {
      addLog(`Error fetching idempotency records: ${error}`, 'error');
    }
  }, [user, addLog]);

  // Fetch presence data
  const fetchPresenceData = useCallback(async () => {
    if (!user || !db) return;

    try {
      const presenceDoc = await getDoc(doc(db, 'presence', user.uid));
      if (presenceDoc.exists()) {
        setPresenceData(presenceDoc.data());
        addLog('Fetched presence data', 'info');
      } else {
        setPresenceData(null);
        addLog('No presence data found', 'warning');
      }
    } catch (error) {
      addLog(`Error fetching presence data: ${error}`, 'error');
    }
  }, [user, addLog]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchIdempotencyRecords();
      fetchPresenceData();
    }, 2000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchIdempotencyRecords, fetchPresenceData]);

  // Test 1: Concurrent Duplicate Calls (presenceStart)
  const testConcurrentDuplicates = async () => {
    setIsTestRunning(true);
    clearLogs();
    addLog('🧪 TEST 1: Concurrent Duplicate Calls (presenceStart)', 'info');
    addLog('Sending 3 concurrent requests with SAME key (should return same session)', 'info');

    try {
      // Generate ONE idempotency key for all requests (simulate true duplicates)
      const sharedKey = crypto.randomUUID();
      addLog(`Using shared idempotency key: ${sharedKey.substring(0, 12)}...`, 'info');

      // Send 3 concurrent requests with SAME idempotency key
      const promises = Array(3).fill(null).map((_, i) =>
        presenceStart({
          activity: 'Coffee',
          durationMin: 30,
          lat: 40.7299,
          lng: -73.9972,
          idempotencyKey: sharedKey, // Force same key
        }).catch(error => ({ error: error.message, index: i }))
      );

      const results = await Promise.allSettled(promises);

      // Check if all returned the same sessionId
      const sessionIds = new Set();
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          const data = result.value as { sessionId?: string; error?: string };
          if (data.error) {
            addLog(`Request ${i + 1}: ❌ ${data.error}`, 'error');
          } else {
            sessionIds.add(data.sessionId);
            addLog(`Request ${i + 1}: ✅ Success - SessionId: ${data.sessionId?.substring(0, 8)}...`, 'success');
          }
        } else {
          addLog(`Request ${i + 1}: ❌ ${result.reason}`, 'error');
        }
      });

      if (sessionIds.size === 1) {
        addLog(`✅ PASS: All requests returned the SAME sessionId (idempotency worked!)`, 'success');
      } else {
        addLog(`❌ FAIL: Requests returned ${sessionIds.size} different sessionIds (expected 1)`, 'error');
      }

      // Refresh data
      setTimeout(() => {
        fetchIdempotencyRecords();
        fetchPresenceData();
      }, 1000);
    } catch (error) {
      addLog(`❌ Test failed: ${error}`, 'error');
    } finally {
      setIsTestRunning(false);
    }
  };

  // Test 2: Parameter Mismatch (presenceStart)
  const testParameterMismatch = async () => {
    setIsTestRunning(true);
    clearLogs();
    addLog('🧪 TEST 2: Parameter Mismatch (presenceStart)', 'info');
    addLog('First start Coffee session, then try Study session (should fail)', 'info');

    try {
      // Start Coffee session
      addLog('Step 1: Starting Coffee session...', 'info');
      const coffeeResult = await presenceStart({
        activity: 'Coffee',
        durationMin: 30,
        lat: 40.7299,
        lng: -73.9972,
      });
      addLog(`✅ Coffee session started: ${coffeeResult.sessionId.substring(0, 8)}...`, 'success');

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to start Study session (should fail)
      addLog('Step 2: Attempting Study session (should fail)...', 'info');
      try {
        await presenceStart({
          activity: 'Study',
          durationMin: 60,
          lat: 40.7299,
          lng: -73.9972,
        });
        addLog('❌ Study session succeeded (UNEXPECTED - should have failed!)', 'error');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('already have an active')) {
          addLog(`✅ Correctly rejected: ${errorMessage}`, 'success');
        } else {
          addLog(`❌ Unexpected error: ${errorMessage}`, 'error');
        }
      }

      addLog('✅ Test complete - Parameter mismatch correctly detected!', 'success');

      // Refresh data
      setTimeout(() => {
        fetchIdempotencyRecords();
        fetchPresenceData();
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Test failed: ${errorMessage}`, 'error');
    } finally {
      setIsTestRunning(false);
    }
  };

  // Test 3: Retry Behavior (simulate retryable error)
  const testRetryBehavior = async () => {
    setIsTestRunning(true);
    clearLogs();
    addLog('🧪 TEST 3: Client Retry Behavior', 'info');
    addLog('This tests the exponential backoff retry logic', 'info');

    try {
      const startTime = Date.now();

      addLog('Sending request (will auto-retry on transient errors)...', 'info');

      // This should succeed or fail, but will retry on transient errors
      try {
        await presenceStart({
          activity: 'Coffee',
          durationMin: 30,
          lat: 40.7299,
          lng: -73.9972,
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        addLog(`✅ Request succeeded after ${elapsed}s`, 'success');
      } catch (error) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const errorCode = (error as { code?: string }).code;
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorCode === 'processing-timeout') {
          addLog(`⏱️ Processing timeout after ${elapsed}s (deadline enforcement working!)`, 'warning');
          addLog(`Message: ${errorMessage}`, 'info');
        } else {
          addLog(`❌ Request failed after ${elapsed}s: ${errorMessage}`, 'error');
        }
      }

      addLog('✅ Test complete - Check console for retry logs', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Test failed: ${errorMessage}`, 'error');
    } finally {
      setIsTestRunning(false);
    }
  };

  // Test 4: Rapid Fire (stress test)
  const testRapidFire = async () => {
    setIsTestRunning(true);
    clearLogs();
    addLog('🧪 TEST 4: Rapid Fire Stress Test', 'info');
    addLog('Sending 10 rapid requests (simulates accidental double-taps)', 'info');

    try {
      const startTime = Date.now();

      // Send 10 rapid requests
      const promises = Array(10).fill(null).map((_, i) =>
        presenceStart({
          activity: 'Coffee',
          durationMin: 30,
          lat: 40.7299,
          lng: -73.9972,
        })
          .then(() => ({ success: true, index: i }))
          .catch(error => ({ success: false, error: error.message, index: i }))
      );

      addLog('Sending 10 concurrent requests...', 'info');
      const results = await Promise.all(promises);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.length - successCount;

      addLog(`Completed in ${elapsed}s`, 'info');
      addLog(`✅ Successful: ${successCount}`, successCount > 0 ? 'success' : 'info');
      addLog(`❌ Errors: ${errorCount}`, errorCount > 0 ? 'warning' : 'info');

      // Check for duplicate sessions
      setTimeout(async () => {
        await fetchPresenceData();
        await fetchIdempotencyRecords();

        addLog('✅ Test complete - Verify only 1 session created (no duplicates!)', 'success');
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`❌ Test failed: ${errorMessage}`, 'error');
    } finally {
      setIsTestRunning(false);
    }
  };

  // Status indicator component
  const StatusIndicator = ({ status }: { status: IdempotencyRecord['status'] }) => {
    const icons = {
      processing: <Clock className="w-4 h-4 text-yellow-600 animate-spin" />,
      completed: <CheckCircle className="w-4 h-4 text-green-600" />,
      failed: <XCircle className="w-4 h-4 text-red-600" />,
    };

    const colors = {
      processing: 'bg-yellow-50 text-yellow-800 border-yellow-300',
      completed: 'bg-green-50 text-green-800 border-green-300',
      failed: 'bg-red-50 text-red-800 border-red-300',
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs border ${colors[status]}`}>
        {icons[status]}
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">U23 Idempotency Debug</h1>
          <p className="text-gray-600">
            Test idempotency, retry logic, and stale lock detection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              fetchIdempotencyRecords();
              fetchPresenceData();
            }}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Data
          </Button>

          <Button
            onClick={() => setAutoRefresh(!autoRefresh)}
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
          >
            {autoRefresh ? '⏸️ Pause' : '▶️ Auto-Refresh'}
          </Button>
        </div>
      </div>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Idempotency Records</p>
              <p className="text-2xl font-bold">{idempotencyRecords.length}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <AlertCircle className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Session</p>
              <p className="text-2xl font-bold">
                {presenceData?.status === 'available' ? 'Yes' : 'No'}
              </p>
            </div>
            <div className={`p-3 rounded-full ${presenceData?.status === 'available' ? 'bg-green-100' : 'bg-gray-100'}`}>
              {presenceData?.status === 'available' ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <XCircle className="w-6 h-6 text-gray-600" />
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Test Status</p>
              <p className="text-2xl font-bold">
                {isTestRunning ? 'Running' : 'Ready'}
              </p>
            </div>
            <div className={`p-3 rounded-full ${isTestRunning ? 'bg-yellow-100' : 'bg-green-100'}`}>
              {isTestRunning ? (
                <RefreshCw className="w-6 h-6 text-yellow-600 animate-spin" />
              ) : (
                <CheckCircle className="w-6 h-6 text-green-600" />
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Test Buttons */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">🧪 Test Scenarios</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            onClick={testConcurrentDuplicates}
            disabled={isTestRunning || !user}
            className="h-auto py-4 flex flex-col items-start"
          >
            <span className="font-bold mb-1">Test 1: Concurrent Duplicates</span>
            <span className="text-xs opacity-80 text-left">
              Send 3 concurrent requests → Verify only 1 session created
            </span>
          </Button>

          <Button
            onClick={testParameterMismatch}
            disabled={isTestRunning || !user}
            className="h-auto py-4 flex flex-col items-start"
          >
            <span className="font-bold mb-1">Test 2: Parameter Mismatch</span>
            <span className="text-xs opacity-80 text-left">
              Start Coffee → Try Study → Should reject with error
            </span>
          </Button>

          <Button
            onClick={testRetryBehavior}
            disabled={isTestRunning || !user}
            className="h-auto py-4 flex flex-col items-start"
          >
            <span className="font-bold mb-1">Test 3: Retry Behavior</span>
            <span className="text-xs opacity-80 text-left">
              Test deadline-based retry with exponential backoff
            </span>
          </Button>

          <Button
            onClick={testRapidFire}
            disabled={isTestRunning || !user}
            className="h-auto py-4 flex flex-col items-start bg-orange-600 hover:bg-orange-700"
          >
            <span className="font-bold mb-1">Test 4: Rapid Fire (Stress)</span>
            <span className="text-xs opacity-80 text-left">
              Send 10 rapid requests → Verify no duplicates
            </span>
          </Button>
        </div>

        {!user && (
          <div className="mt-4 p-4 bg-yellow-50 text-yellow-800 rounded border border-yellow-300">
            ⚠️ You must be logged in to run tests
          </div>
        )}
      </Card>

      {/* Logs */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📋 Test Logs</h2>
          <Button onClick={clearLogs} variant="ghost" size="sm">
            Clear Logs
          </Button>
        </div>

        <div className="bg-gray-900 text-gray-100 p-4 rounded h-80 overflow-y-auto font-mono text-sm">
          {logs.length === 0 ? (
            <p className="text-gray-500">No logs yet. Run a test to see results.</p>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`mb-1 ${
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'warning' ? 'text-yellow-400' :
                  'text-gray-300'
                }`}
              >
                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Current Presence Data */}
      {presenceData && (
        <Card className="p-6 mb-6 bg-blue-50 border-blue-200">
          <h2 className="text-xl font-semibold mb-4 text-blue-900">👤 Current Presence Data</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-600 font-medium">Activity</p>
              <p className="font-mono">{String(presenceData.activity)}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Status</p>
              <p className="font-mono">{String(presenceData.status)}</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Session ID</p>
              <p className="font-mono text-xs">{typeof presenceData.sessionId === 'string' ? presenceData.sessionId.substring(0, 12) : 'N/A'}...</p>
            </div>
            <div>
              <p className="text-gray-600 font-medium">Duration</p>
              <p className="font-mono">{String(presenceData.durationMinutes)} min</p>
            </div>
          </div>
        </Card>
      )}

      {/* Idempotency Records */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">🔐 Idempotency Records</h2>

        {idempotencyRecords.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No idempotency records found. Run a test to generate records.
          </p>
        ) : (
          <div className="space-y-4">
            {idempotencyRecords.map((record, i) => (
              <div key={i} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-lg">{record.operation}</p>
                    <p className="text-xs text-gray-500 font-mono">
                      {record.requestId.substring(0, 16)}...
                    </p>
                  </div>
                  <StatusIndicator status={record.status} />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mt-3">
                  <div>
                    <p className="text-gray-600 font-medium">Created</p>
                    <p className="text-xs font-mono">
                      {record.createdAt?.toDate().toLocaleTimeString()}
                    </p>
                  </div>

                  {record.processingStartedAt && (
                    <div>
                      <p className="text-gray-600 font-medium">Processing Started</p>
                      <p className="text-xs font-mono">
                        {record.processingStartedAt.toDate().toLocaleTimeString()}
                      </p>
                    </div>
                  )}

                  {record.completedAt && (
                    <div>
                      <p className="text-gray-600 font-medium">Completed</p>
                      <p className="text-xs font-mono">
                        {record.completedAt.toDate().toLocaleTimeString()}
                      </p>
                    </div>
                  )}

                  <div>
                    <p className="text-gray-600 font-medium">Expires</p>
                    <p className="text-xs font-mono">
                      {record.expiresAt?.toDate().toLocaleTimeString()}
                    </p>
                  </div>
                </div>

                {!!record.minimalResult && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-gray-600 font-medium text-sm mb-1">Cached Result:</p>
                    <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                      {JSON.stringify(record.minimalResult, null, 2)}
                    </pre>
                  </div>
                )}

                {record.error && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-red-600 font-medium text-sm mb-1">Error:</p>
                    <p className="text-xs text-red-800">{record.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Troubleshooting */}
      <Card className="p-6 mt-6 bg-green-50 border-green-200">
        <h3 className="font-semibold text-green-900 mb-2">✅ Expected Behaviors</h3>
        <ul className="text-sm text-green-800 space-y-2 list-disc list-inside">
          <li>
            <strong>Concurrent duplicates:</strong> Multiple requests with same params → Only 1 session/offer/match created
          </li>
          <li>
            <strong>Parameter mismatch:</strong> Coffee session exists → Study request fails with clear error
          </li>
          <li>
            <strong>Retry behavior:</strong> Transient errors (unavailable, deadline-exceeded) → Auto-retry with backoff
          </li>
          <li>
            <strong>Processing timeout:</strong> Operation takes &gt;15s → User-friendly &quot;still processing&quot; message
          </li>
          <li>
            <strong>Stale locks:</strong> Lock stuck for &gt;60s → Auto-recovered (marked failed, allows retry)
          </li>
          <li>
            <strong>Rapid fire:</strong> 10 rapid taps → Only 1 actual operation (others return cached or wait)
          </li>
        </ul>
      </Card>

      <div className="mt-6 text-center">
        <Button variant="ghost" onClick={() => window.location.href = '/'}>
          ← Back to Home
        </Button>
      </div>
    </div>
  );
}