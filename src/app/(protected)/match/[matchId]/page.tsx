'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  Flag,
  Ban,
  MessageCircle,
  MoreVertical,
  ChevronUp,
  ChevronDown,
  X,
} from 'lucide-react';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { LocationDecisionPanel } from '@/components/match/LocationDecisionPanel';
import { CancelReasonModal } from '@/components/match/CancelReasonModal';
import { ChatPanel } from '@/components/match/ChatPanel';

import { getFirebaseDb } from '@/lib/firebase/client';
import { matchCancel } from '@/lib/firebase/functions';
import { useMatch } from '@/lib/hooks/useMatch';
import { useLocationDecision } from '@/lib/hooks/useLocationDecision';
import { useChat } from '@/lib/hooks/useChat';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePresence } from '@/lib/hooks/usePresence';
import { useToast } from '@/hooks/use-toast';


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
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  // Chat hook
  const {
    messages,
    sendMessage,
    isSending,
    error: chatError,
    totalCount: chatTotalCount,
    isAtLimit: chatIsAtLimit,
  } = useChat(matchId);

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

  // If match becomes terminal via listener, redirect immediately
  useEffect(() => {
    if (!match?.status) return;
    const terminalStatuses = ['cancelled', 'completed', 'expired_pending_confirmation'];
    if (terminalStatuses.includes(match.status)) {
      if (match.status === 'cancelled') {
        console.log('Match status changed to cancelled in background, redirecting...');
        const reason = cancellationReason || 'cancelled';
        window.location.href = `/?cancelled=true&reason=${encodeURIComponent(reason)}`;
      } else {
        console.log(`Match status changed to ${match.status}, redirecting to homepage...`);
        window.location.href = '/';
      }
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
    <div className="max-w-md mx-auto flex flex-col" style={{ height: 'calc(100dvh - 5rem)' }}>
      {/* Compact Match Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500 to-purple-600 rounded-t-xl flex-shrink-0">
        <div className="flex items-center gap-3">
          <ProfileAvatar
            photoURL={otherUserProfile?.photoURL}
            displayName={otherUserProfile?.displayName}
            size="sm"
          />
          <div>
            <h2 className="text-sm font-semibold text-white">
              {otherUserProfile?.displayName || 'Your Buddy'}
            </h2>
            <p className="text-[10px] text-white/60">
              Matched {match.matchedAt?.toDate().toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Overflow menu with safety actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Profile info */}
            {otherUserProfile && otherUserProfile.interests.length > 0 && (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-xs text-gray-500 mb-1">Interests</p>
                  <div className="flex flex-wrap gap-1">
                    {otherUserProfile.interests.slice(0, 5).map((interest) => (
                      <Badge key={interest} variant="secondary" className="text-[10px]">
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            )}
            {/* Cancel match */}
            {match?.status !== 'completed' && (
              <DropdownMenuItem
                onClick={handleCancelClick}
                disabled={isCancelling}
                className="text-red-600 focus:text-red-600"
              >
                {isCancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                Cancel Match
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {/* Report */}
            <DropdownMenuItem onClick={() => setReportDialogOpen(true)}>
              <Flag className="h-4 w-4 mr-2" />
              Report
            </DropdownMenuItem>
            {/* Block */}
            <DropdownMenuItem
              onClick={handleBlock}
              disabled={isBlocking}
              className="text-red-600 focus:text-red-600"
            >
              {isBlocking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Ban className="h-4 w-4 mr-2" />}
              Block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* STEP 1: Location Decision + Chat Drawer */}
      {showLocationSelection && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto space-y-4 p-4">
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
          </div>

          {/* Chat Drawer Toggle */}
          <div className="flex-shrink-0">
            <button
              onClick={() => setChatDrawerOpen(!chatDrawerOpen)}
              className="w-full flex items-center justify-center gap-2 py-2 bg-violet-50 border-t border-violet-100 text-violet-600 text-sm font-medium hover:bg-violet-100 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Chat
              {messages.length > 0 && (
                <span className="bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {messages.length}
                </span>
              )}
              {chatDrawerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </button>

            {/* Collapsible Chat Drawer */}
            <AnimatePresence>
              {chatDrawerOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: '55vh', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="overflow-hidden border-t border-gray-200"
                >
                  <ChatPanel
                    messages={messages}
                    currentUserUid={user?.uid || ''}
                    otherUserName={otherUserProfile?.displayName || 'Buddy'}
                    onSendMessage={sendMessage}
                    isSending={isSending}
                    isAtLimit={chatIsAtLimit}
                    totalCount={chatTotalCount}
                    error={chatError}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* STEP 2: Full Chat View with Status Pills */}
      {!showLocationSelection && (
        <div className="flex-1 overflow-hidden rounded-b-xl border border-t-0 border-gray-200 bg-white">
          <ChatPanel
            messages={messages}
            currentUserUid={user?.uid || ''}
            otherUserName={otherUserProfile?.displayName || 'Buddy'}
            onSendMessage={sendMessage}
            isSending={isSending}
            isAtLimit={chatIsAtLimit}
            totalCount={chatTotalCount}
            error={chatError}
            confirmedPlaceName={match.confirmedPlaceName}
            confirmedPlaceAddress={match.confirmedPlaceAddress || undefined}
            myStatus={myStatus || undefined}
            isUpdatingStatus={isUpdating}
            onStatusUpdate={handleStatusUpdate}
          />
          {/* Feedback link after individual completion */}
          {myStatus === 'completed' && (
            <div className="px-3 py-2 bg-violet-50 border-t border-violet-100 text-center">
              <button
                onClick={() => router.push(`/feedback/${matchId}`)}
                className="text-xs text-violet-600 font-medium hover:underline"
              >
                <MessageCircle className="h-3 w-3 inline mr-1" />
                Leave Feedback
              </button>
            </div>
          )}
        </div>
      )}
      {/* Cancel Reason Modal */}
      <CancelReasonModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        onConfirmCancel={handleConfirmCancel}
        isCancelling={isCancelling}
      />

      {/* Report Dialog (triggered from overflow menu) */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
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
              onClick={() => { handleReport(); setReportDialogOpen(false); }}
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

      {/* Debug Info - development only */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 p-4 bg-gray-100 rounded-lg text-xs font-mono break-all flex-shrink-0">
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
      )}
    </div>
  );
}