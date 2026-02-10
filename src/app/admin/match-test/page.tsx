'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';
import { adminForceExpireMatch, matchConfirmMeeting } from '@/lib/firebase/functions';
import { useAuth } from '@/lib/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

interface MatchData {
  status: string;
  user1Uid: string;
  user2Uid: string;
  statusByUser?: Record<string, string>;
  pendingConfirmationUids?: string[];
  meetingConfirmation?: Record<string, string>;
  outcome?: string;
  activity?: string;
  confirmedPlaceName?: string;
  confirmationRequestedAt?: { toDate: () => Date };
  resolvedAt?: { toDate: () => Date };
  matchedAt?: { toDate: () => Date };
  updatedAt?: { toDate: () => Date };
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    expired_pending_confirmation: 'bg-amber-100 text-amber-800',
  };
  const color = colors[status] || 'bg-blue-100 text-blue-800';
  return (
    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function formatTimestamp(ts: { toDate: () => Date } | undefined): string {
  if (!ts) return '—';
  try {
    return ts.toDate().toLocaleString();
  } catch {
    return String(ts);
  }
}

export default function MatchTestPage() {
  const { user } = useAuth();
  const [matchId, setMatchId] = useState('');
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState('');

  function append(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setLog((prev) => `[${ts}] ${msg}\n${prev}`);
  }

  // Real-time listener on match document
  useEffect(() => {
    if (!activeMatchId) {
      setMatch(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(getFirebaseDb(), 'matches', activeMatchId),
      (snap) => {
        if (snap.exists()) {
          setMatch(snap.data() as MatchData);
        } else {
          setMatch(null);
          append('Match document does not exist');
        }
      },
      (err) => {
        append(`Listener error: ${err.message}`);
      }
    );

    return () => unsubscribe();
  }, [activeMatchId]);

  const handleLoad = useCallback(() => {
    const id = matchId.trim();
    if (!id) return;
    setActiveMatchId(id);
    append(`Loaded match: ${id}`);
  }, [matchId]);

  const handleForceExpire = useCallback(async (simulateCompletedUids?: string[]) => {
    if (!activeMatchId) return;
    setLoading(true);

    const label = simulateCompletedUids?.length
      ? `Case B (simulating completed: ${simulateCompletedUids.join(', ')})`
      : 'Case C (neither completed)';

    append(`Force expiring match — ${label}...`);

    try {
      const result = await adminForceExpireMatch({
        matchId: activeMatchId,
        simulateCompletedUids,
      });
      const data = result.data;
      append(
        `SUCCESS: ${data.message}\n` +
        `  Status: ${data.matchStatus}\n` +
        `  Raw match status (before): ${data.rawMatchStatus}\n` +
        `  Raw statusByUser (before): ${JSON.stringify(data.rawStatusByUser)}\n` +
        `  Simulated UIDs: [${data.simulatedUids.join(', ')}]\n` +
        `  Pending UIDs: [${data.pendingUids.join(', ')}]\n` +
        `  User1: ${data.user1Uid}\n` +
        `  User2: ${data.user2Uid}`
      );
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      append(`FAILED: ${error?.code || ''} ${error?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [activeMatchId]);

  const handleConfirm = useCallback(async (response: 'met' | 'not_met' | 'dismissed') => {
    if (!activeMatchId) return;
    setLoading(true);
    append(`Confirming meeting: "${response}"...`);

    try {
      const result = await matchConfirmMeeting({
        matchId: activeMatchId,
        response,
      });
      const data = result.data;
      append(
        `SUCCESS: resolved=${data.resolved}` +
        (data.finalStatus ? ` finalStatus=${data.finalStatus}` : '') +
        (data.outcome ? ` outcome=${data.outcome}` : '')
      );
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      append(`FAILED: ${error?.code || ''} ${error?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [activeMatchId]);

  if (!user) {
    return (
      <div className="py-8">
        <Card>
          <CardHeader><CardTitle>Match Confirmation Test</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">You must be logged in.</p></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Match Confirmation Test</CardTitle>
          <p className="text-sm text-muted-foreground">
            Force-expire active matches and test the &quot;Did you meet?&quot; confirmation flow
            without waiting 2 hours.
          </p>
          <p className="text-sm text-muted-foreground">
            Logged in as: <code className="bg-muted px-1 rounded">{user.email}</code> ({user.uid})
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="Enter match ID..."
              className="flex-1 px-3 py-2 border rounded-md text-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            />
            <Button onClick={handleLoad} variant="outline" size="sm">
              Load Match
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Real-time Match Viewer */}
      {activeMatchId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Match State
              {match && <StatusBadge status={match.status} />}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono">{activeMatchId}</p>
          </CardHeader>
          <CardContent>
            {!match ? (
              <p className="text-muted-foreground text-sm">Match not found or loading...</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground">User 1:</span>{' '}
                    <code className="text-xs">{match.user1Uid}</code>
                    {match.user1Uid === user.uid && (
                      <span className="ml-1 text-xs text-violet-600">(you)</span>
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">User 2:</span>{' '}
                    <code className="text-xs">{match.user2Uid}</code>
                    {match.user2Uid === user.uid && (
                      <span className="ml-1 text-xs text-violet-600">(you)</span>
                    )}
                  </div>
                </div>

                {match.activity && (
                  <div>
                    <span className="text-muted-foreground">Activity:</span> {match.activity}
                  </div>
                )}

                {match.confirmedPlaceName && (
                  <div>
                    <span className="text-muted-foreground">Place:</span> {match.confirmedPlaceName}
                  </div>
                )}

                <div>
                  <span className="text-muted-foreground">statusByUser:</span>
                  <pre className="bg-muted p-2 rounded text-xs mt-1">
                    {JSON.stringify(match.statusByUser || {}, null, 2)}
                  </pre>
                </div>

                {match.pendingConfirmationUids && (
                  <div>
                    <span className="text-muted-foreground">Pending Confirmation UIDs:</span>
                    <pre className="bg-muted p-2 rounded text-xs mt-1">
                      {JSON.stringify(match.pendingConfirmationUids, null, 2)}
                    </pre>
                  </div>
                )}

                {match.meetingConfirmation && Object.keys(match.meetingConfirmation).length > 0 && (
                  <div>
                    <span className="text-muted-foreground">Meeting Confirmation:</span>
                    <pre className="bg-muted p-2 rounded text-xs mt-1">
                      {JSON.stringify(match.meetingConfirmation, null, 2)}
                    </pre>
                  </div>
                )}

                {match.outcome && (
                  <div>
                    <span className="text-muted-foreground">Outcome:</span>{' '}
                    <span className="font-medium">{match.outcome}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Matched: {formatTimestamp(match.matchedAt)}</div>
                  <div>Updated: {formatTimestamp(match.updatedAt)}</div>
                  <div>Confirmation Requested: {formatTimestamp(match.confirmationRequestedAt)}</div>
                  <div>Resolved: {formatTimestamp(match.resolvedAt)}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Force Expire Controls */}
      {activeMatchId && match && (
        <Card>
          <CardHeader>
            <CardTitle>Force Expire Controls</CardTitle>
            <p className="text-sm text-muted-foreground">
              Transition this match to expired_pending_confirmation (skips 2h wait)
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              onClick={() => handleForceExpire()}
              disabled={loading}
              variant="outline"
              className="w-full justify-start"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Force Expire — Case C (neither completed)
            </Button>
            <Button
              onClick={() => handleForceExpire([match.user1Uid])}
              disabled={loading}
              variant="outline"
              className="w-full justify-start"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Force Expire — Case B (User 1 completed)
            </Button>
            <Button
              onClick={() => handleForceExpire([match.user2Uid])}
              disabled={loading}
              variant="outline"
              className="w-full justify-start"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Force Expire — Case B (User 2 completed)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirm Meeting Controls */}
      {activeMatchId && match && match.status === 'expired_pending_confirmation' && (
        <Card>
          <CardHeader>
            <CardTitle>Confirm Meeting (as current user)</CardTitle>
            <p className="text-sm text-muted-foreground">
              Respond to &quot;Did you meet?&quot; as {user.uid}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={() => handleConfirm('met')}
                disabled={loading}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                Met
              </Button>
              <Button
                onClick={() => handleConfirm('not_met')}
                disabled={loading}
                variant="outline"
                className="flex-1"
              >
                Not Met
              </Button>
              <Button
                onClick={() => handleConfirm('dismissed')}
                disabled={loading}
                variant="ghost"
                className="flex-1"
              >
                Dismissed
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Panel */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Log</CardTitle>
          <Button onClick={() => setLog('')} variant="ghost" size="sm">
            Clear
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="bg-black text-green-400 p-4 rounded-lg text-xs overflow-x-auto h-64 overflow-y-auto whitespace-pre-wrap">
            {log || '--- waiting for actions ---'}
          </pre>
        </CardContent>
      </Card>

      {/* Quick Reference */}
      <Card className="border-violet-200">
        <CardHeader>
          <CardTitle>Resolution Table</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">User A</th>
                <th className="text-left py-1">User B</th>
                <th className="text-left py-1">Status</th>
                <th className="text-left py-1">Outcome</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr><td>met</td><td>met</td><td className="text-green-700">completed</td><td>both_confirmed</td></tr>
              <tr><td>met</td><td>not_met</td><td className="text-red-700">cancelled</td><td>disputed</td></tr>
              <tr><td>met</td><td>dismissed</td><td className="text-red-700">cancelled</td><td>unconfirmed</td></tr>
              <tr><td>not_met</td><td>not_met</td><td className="text-red-700">cancelled</td><td>both_not_met</td></tr>
              <tr><td>not_met</td><td>dismissed</td><td className="text-red-700">cancelled</td><td>unconfirmed</td></tr>
              <tr><td>dismissed</td><td>dismissed</td><td className="text-red-700">cancelled</td><td>unconfirmed</td></tr>
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
