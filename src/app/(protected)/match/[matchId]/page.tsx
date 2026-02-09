'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  MapPin,
  Navigation,
  Check,
  Loader2,
  Flag,
  Ban,
  MessageCircle,
  Coffee,
} from 'lucide-react';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LocationDecisionPanel } from '@/components/match/LocationDecisionPanel';
import { CancelReasonModal } from '@/components/match/CancelReasonModal';

import { getFirebaseDb } from '@/lib/firebase/client';
import { matchCancel } from '@/lib/firebase/functions';
import { useMatch } from '@/lib/hooks/useMatch';
import { useLocationDecision } from '@/lib/hooks/useLocationDecision';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePresence } from '@/lib/hooks/usePresence';
import { useToast } from '@/hooks/use-toast';

const STATUS_STEPS = [
  { key: 'pending', label: 'Matched', icon: Check },
  { key: 'heading_there', label: 'On the way', icon: Navigation },
  { key: 'arrived', label: 'Arrived', icon: MapPin },
  { key: 'completed', label: 'Complete', icon: Coffee },
];

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { presence: myPresence } = usePresence();
  const { toast } = useToast();
  const matchId = params.matchId as string;

  const {
    match,
    otherUserProfile,
    loading,
    error,
    updateStatus,
    myStatus,
    cancellationReason, // Phase 2.2-C: Normalized cancellation reason
  } = useMatch(matchId);

  // PRD v2.4: Location Decision Hook
  const {
    placeCandidates,
    myChoice,
    otherChoice,
    otherChosenCandidate,
    formattedCountdown,
    isSettingChoice,
    handleSetChoice,
    handleGoWithTheirChoice,
  } = useLocationDecision(matchId);

  const [isUpdating, setIsUpdating] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const handleStatusUpdate = async (
    status: 'heading_there' | 'arrived' | 'completed'
  ) => {
    setIsUpdating(true);
    try {
      await updateStatus(status);
      if (status === 'completed') {
        // Redirect to feedback page
        router.push(`/feedback/${matchId}`);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReport = async () => {
    if (!match || !user || !reportReason.trim()) return;

    setIsReporting(true);
    try {
      const otherUid =
        match.user1Uid === user.uid ? match.user2Uid : match.user1Uid;

      await setDoc(doc(getFirebaseDb(), 'reports', `${matchId}_${user.uid}`), {
        reportedBy: user.uid,
        reportedUser: otherUid,
        matchId,
        reason: reportReason.trim(),
        createdAt: serverTimestamp(),
      });

      setReportReason('');
      alert('Report submitted. Thank you for keeping NYU Buddy safe.');
    } catch {
      alert('Failed to submit report. Please try again.');
    } finally {
      setIsReporting(false);
    }
  };

  const handleBlock = async () => {
    if (!match || !user || !matchId) return;

    const otherUid =
      match.user1Uid === user.uid ? match.user2Uid : match.user1Uid;

    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to block ${otherUserProfile?.displayName || 'this user'}?\n\nThey will no longer appear in your future searches, and this match will end immediately.`
    );

    if (!confirmed) return;

    setIsBlocking(true);
    try {
      console.log('[handleBlock] Starting block process for otherUid:', otherUid);
      console.log('[handleBlock] Current user.uid:', user.uid);

      // 1. Create the block document FIRST (before cancel triggers redirect)
      const blockRef = doc(getFirebaseDb(), 'blocks', user.uid, 'blocked', otherUid);
      console.log('[handleBlock] Block ref path:', blockRef.path);

      const blockDoc = await getDoc(blockRef);
      console.log('[handleBlock] Existing block doc exists:', blockDoc.exists());

      if (!blockDoc.exists()) {
        console.log('[handleBlock] Creating new block document...');
        await setDoc(blockRef, {
          blockedAt: serverTimestamp(),
        });
        console.log('[handleBlock] Block document CREATED successfully for', otherUid);
      } else {
        console.log('[handleBlock] Block already exists, skipping create');
      }

      // 2. THEN cancel the match (this triggers the redirect via listener)
      console.log('[handleBlock] Calling matchCancel...');
      await matchCancel({ matchId, reason: 'blocked' });

      toast({
        title: 'User blocked',
        description: `${otherUserProfile?.displayName || 'This user'} won't appear in your suggestions anymore.`,
      });
      router.push('/');
    } catch (err) {
      console.error('Failed to block user:', err);
      toast({
        title: 'Error',
        description: 'Failed to block user. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsBlocking(false);
    }
  };

  // If match becomes cancelled via listener, redirect immediately
  useEffect(() => {
    if (match?.status === 'cancelled') {
      console.log('Match status changed to cancelled in background, redirecting...');
      const reason = cancellationReason || 'cancelled';
      window.location.href = `/?cancelled=true&reason=${encodeURIComponent(reason)}`;
    }
  }, [match?.status, cancellationReason]);

  const handleCancelClick = () => {
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async (reason: string, details?: string) => {
    if (!matchId) return;

    setIsCancelling(true);
    try {
      // Pass reason and details (if "other", combine them or just pass reason)
      const finalReason = details ? `${reason}: ${details}` : reason;
      await matchCancel({ matchId, reason: finalReason });
      router.push('/');
    } catch (err) {
      console.error('Cancel Match Error:', err);
      const message = err instanceof Error ? err.message : 'Failed to cancel match';

      // If match is already cancelled (400 Bad Request often returns this), treat as success
      if (message.toLowerCase().includes('cancelled') || message.includes('400')) {
        console.log('Match already cancelled, forcing redirect...');
        window.location.href = '/?cancelled=true';
        return;
      }
      alert(message);
    } finally {
      setCancelModalOpen(false);
      // setIsCancelling(false); // Don't reset if we might be redirecting to avoid flicker
    }
  };

  const currentStatusIndex = STATUS_STEPS.findIndex(
    (s) => s.key === match?.status
  );

  // 2-Step View Logic
  const showLocationSelection = !match?.confirmedPlaceName;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error || !match) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <p className="text-red-500 mb-4">{error || 'Match not found'}</p>
        <Button onClick={() => router.push('/')}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* Match Header - Always Visible */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-0 shadow-lg overflow-hidden">
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white">
            <div className="flex items-center space-x-4">
              <ProfileAvatar
                photoURL={otherUserProfile?.photoURL}
                displayName={otherUserProfile?.displayName}
                size="lg"
              />
              <div>
                <h2 className="text-xl font-bold">
                  {otherUserProfile?.displayName || 'Your Buddy'}
                </h2>
                <p className="text-white/80 text-sm">
                  Matched {match.matchedAt?.toDate().toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          <CardContent className="p-6">
            {/* Interests */}
            {otherUserProfile && otherUserProfile.interests.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-500 mb-2">Interests:</p>
                <div className="flex flex-wrap gap-2">
                  {otherUserProfile.interests.slice(0, 5).map((interest) => (
                    <Badge key={interest} variant="secondary">
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* STEP 1: PRD v2.4 Location Decision View */}
      {showLocationSelection && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <LocationDecisionPanel
            placeCandidates={placeCandidates}
            myChoice={myChoice}
            otherChoice={otherChoice}
            otherChosenCandidate={otherChosenCandidate ?? null}
            otherUserName={otherUserProfile?.displayName || 'Your buddy'}
            formattedCountdown={formattedCountdown}
            isSettingChoice={isSettingChoice}
            onSelectPlace={handleSetChoice}
            onGoWithTheirChoice={handleGoWithTheirChoice}
            onCancel={handleCancelClick}
            isCancelling={isCancelling}
            isLoading={placeCandidates.length === 0}
          />
        </motion.div>
      )}

      {/* Cancel Reason Modal */}
      <CancelReasonModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        onConfirmCancel={handleConfirmCancel}
        isCancelling={isCancelling}
      />

      {/* STEP 2: Meetup Status View */}
      {!showLocationSelection && (
        <>
          {/* Confirmed Place Display */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="border-0 shadow-lg border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-600" />
                  Meeting Location
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start space-x-3 p-3 bg-white rounded-lg">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                    <MapPin className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{match.confirmedPlaceName}</p>
                    <p className="text-sm text-gray-500 truncate">
                      {match.confirmedPlaceAddress}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Status Progress */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Meetup Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between mb-6">
                  {STATUS_STEPS.map((step, index) => {
                    const Icon = step.icon;
                    const isActive = index <= currentStatusIndex;
                    const isCurrent = step.key === match.status;

                    return (
                      <div
                        key={step.key}
                        className="flex flex-col items-center space-y-2"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isActive
                            ? 'bg-violet-600 text-white'
                            : 'bg-gray-100 text-gray-400'
                            } ${isCurrent ? 'ring-2 ring-violet-300 ring-offset-2' : ''}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span
                          className={`text-xs ${isActive ? 'text-violet-600 font-medium' : 'text-gray-400'
                            }`}
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Status Update Buttons */}
                <div className="space-y-3">
                  {myStatus === 'pending' && (
                    <Button
                      className="w-full bg-gradient-to-r from-violet-600 to-purple-600"
                      onClick={() => handleStatusUpdate('heading_there')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Navigation className="mr-2 h-4 w-4" />
                          I&apos;m on my way
                        </>
                      )}
                    </Button>
                  )}

                  {myStatus === 'heading_there' && (
                    <Button
                      className="w-full bg-gradient-to-r from-violet-600 to-purple-600"
                      onClick={() => handleStatusUpdate('arrived')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <MapPin className="mr-2 h-4 w-4" />
                          I&apos;ve arrived
                        </>
                      )}
                    </Button>
                  )}

                  {myStatus === 'arrived' && (
                    <Button
                      className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                      onClick={() => handleStatusUpdate('completed')}
                      disabled={isUpdating}
                    >
                      {isUpdating ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Complete Meetup
                        </>
                      )}
                    </Button>
                  )}

                  {myStatus === 'completed' && (
                    <Button
                      className="w-full"
                      variant="outline"
                      onClick={() => router.push(`/feedback/${matchId}`)}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Leave Feedback
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Safety Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                {/* Cancel Button (Step 2) */}
                {match.status !== 'completed' && (
                  <div className="mb-4">
                    <Button
                      variant="outline"
                      className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                      onClick={handleCancelClick}
                      disabled={isCancelling}
                    >
                      {isCancelling ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Cancel Match
                    </Button>
                    <p className="text-xs text-gray-500 text-center mt-2">
                      Cancelling now will affect your reliability score
                    </p>
                  </div>
                )}
                <Separator className="mb-4" />
                <div className="flex space-x-3">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="flex-1">
                        <Flag className="mr-2 h-4 w-4" />
                        Report
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Report User</DialogTitle>
                        <DialogDescription>
                          Help us keep NYU Buddy safe. Describe the issue.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Reason</Label>
                          <Textarea
                            value={reportReason}
                            onChange={(e) => setReportReason(e.target.value)}
                            placeholder="Describe the issue..."
                            rows={4}
                          />
                        </div>
                        <Button
                          onClick={handleReport}
                          disabled={!reportReason.trim() || isReporting}
                          className="w-full"
                        >
                          {isReporting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Submit Report'
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={handleBlock}
                    disabled={isBlocking}
                  >
                    {isBlocking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Ban className="mr-2 h-4 w-4" />
                        Block
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}
      {/* Debug Info */}
      <div className="mt-8 p-4 bg-gray-100 rounded-lg text-xs font-mono break-all">
        <h4 className="font-bold mb-2">Debug Info</h4>
        <p>My Stored Location (from DB): {myPresence ? `${myPresence.lat.toFixed(5)}, ${myPresence.lng.toFixed(5)}` : 'Loading...'}</p>
        <div className="mt-2">
          <strong>Recommended Places:</strong>
          {placeCandidates.map((p: { placeId: string; name: string; distance: number; lat: number; lng: number }) => (
            <div key={p.placeId} className="ml-2 mt-1">
              - {p.name}: {p.distance}m  (Loc: {p.lat?.toFixed(5)}, {p.lng?.toFixed(5)})
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}