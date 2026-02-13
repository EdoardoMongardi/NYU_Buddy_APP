'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
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
import { CompleteConfirmDialog } from '@/components/match/CompleteConfirmDialog';
import { ChatPanel } from '@/components/match/ChatPanel';

import { getFirebaseDb } from '@/lib/firebase/client';
import { matchCancel } from '@/lib/firebase/functions';
import { useMatch } from '@/lib/hooks/useMatch';
import { useLocationDecision } from '@/lib/hooks/useLocationDecision';
import { useChat } from '@/lib/hooks/useChat';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePresence } from '@/lib/hooks/usePresence';
import { useVisualViewport } from '@/lib/hooks/useVisualViewport';
import { useLockBodyScroll } from '@/lib/hooks/useLockBodyScroll';
import { useWhiteThemeColor } from '@/lib/hooks/useWhiteThemeColor';
import { useToast } from '@/hooks/use-toast';


export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const { user, userProfile } = useAuth();
  usePresence(); // keep for side-effect (registers user presence)
  const { toast } = useToast();
  const matchId = params.matchId as string;

  // ── Visual viewport keyboard management ──
  const isKbOpen = useVisualViewport();
  useLockBodyScroll();
  useWhiteThemeColor();

  const {
    match,
    otherUserProfile,
    loading,
    error,
    updateStatus,
    myStatus,
    cancellationReason,
  } = useMatch(matchId);

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
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  const {
    messages,
    sendMessage,
    isSending,
    error: chatError,
    totalCount: chatTotalCount,
    isAtLimit: chatIsAtLimit,
  } = useChat(matchId);

  // ── Drawer animation bookkeeping ──
  const [contentMounted, setContentMounted] = useState(false);

  useEffect(() => {
    if (chatDrawerOpen) setContentMounted(true);
  }, [chatDrawerOpen]);

  const handleDrawerAnimComplete = () => {
    if (!chatDrawerOpen) setContentMounted(false);
  };

  // Measure the toggle-handle height for precise collapsed animation.
  const toggleRef = useRef<HTMLDivElement>(null);
  const [collapsedH, setCollapsedH] = useState(80);
  useEffect(() => {
    const measure = () => {
      if (toggleRef.current) setCollapsedH(toggleRef.current.offsetHeight);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Pick animation speed:
  //   drawer toggle     → 0.8s
  //   keyboard change   → 0.28s
  //   keyboard change while drawer is still mid-toggle → 0 (instant)
  const prevDrawerOpen = useRef(chatDrawerOpen);
  const drawerToggled = prevDrawerOpen.current !== chatDrawerOpen;
  prevDrawerOpen.current = chatDrawerOpen;
  const drawerToggledAtRef = useRef(0);
  if (drawerToggled) drawerToggledAtRef.current = Date.now();
  const recentlyToggled = Date.now() - drawerToggledAtRef.current < 600;
  const animDuration = drawerToggled ? 0.6 : recentlyToggled ? 0 : 0.28;

  // ── Handlers ──

  const handleStatusUpdate = async (
    status: 'heading_there' | 'arrived'
  ) => {
    setIsUpdating(true);
    try {
      await updateStatus(status);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCompleteClick = () => setCompleteDialogOpen(true);

  const handleConfirmComplete = async () => {
    setIsUpdating(true);
    try {
      await updateStatus('completed');
      router.push(`/feedback/${matchId}`);
    } finally {
      setIsUpdating(false);
      setCompleteDialogOpen(false);
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
    const confirmed = window.confirm(
      `Are you sure you want to block ${otherUserProfile?.displayName || 'this user'}?\n\nThey will no longer appear in your future searches, and this match will end immediately.`
    );
    if (!confirmed) return;

    setIsBlocking(true);
    try {
      const blockRef = doc(getFirebaseDb(), 'blocks', user.uid, 'blocked', otherUid);
      const blockDoc = await getDoc(blockRef);
      if (!blockDoc.exists()) {
        await setDoc(blockRef, { blockedAt: serverTimestamp() });
      }
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

  // Terminal match status → redirect.
  useEffect(() => {
    if (!match?.status) return;
    const terminalStatuses = ['cancelled', 'completed', 'expired_pending_confirmation'];
    if (terminalStatuses.includes(match.status)) {
      if (match.status === 'cancelled') {
        const reason = cancellationReason || 'cancelled';
        window.location.href = `/?cancelled=true&reason=${encodeURIComponent(reason)}`;
      } else {
        window.location.href = '/';
      }
    }
  }, [match?.status, cancellationReason]);

  const handleCancelClick = () => setCancelModalOpen(true);

  const handleConfirmCancel = async (reason: string, details?: string) => {
    if (!matchId) return;
    setIsCancelling(true);
    try {
      const finalReason = details ? `${reason}: ${details}` : reason;
      await matchCancel({ matchId, reason: finalReason });
      router.push('/');
    } catch (err) {
      console.error('Cancel Match Error:', err);
      const message = err instanceof Error ? err.message : 'Failed to cancel match';
      if (message.toLowerCase().includes('cancelled') || message.includes('400')) {
        window.location.href = '/?cancelled=true';
        return;
      }
      alert(message);
    } finally {
      setCancelModalOpen(false);
    }
  };

  const handleToggleDrawer = () => {
    if (chatDrawerOpen) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    setChatDrawerOpen(!chatDrawerOpen);
  };

  // 2-Step View Logic
  const showLocationSelection = !match?.confirmedPlaceName;

  // Drawer height: 100% when keyboard open, 65% when closed, collapsed when drawer closed.
  const drawerHeight = chatDrawerOpen
    ? (isKbOpen ? '100%' : '65%')
    : collapsedH;

  // ── Render ──

  return (
    <div
      className="fixed inset-x-0 mx-auto w-full max-w-lg flex flex-col bg-white overflow-hidden z-50
                 sm:rounded-xl sm:shadow-2xl sm:border sm:border-gray-200"
      style={{
        top: 'var(--vv-offset-top, 0px)',
        height: 'var(--vvh, 100dvh)',
        transitionProperty: 'height',
        transitionDuration: 'var(--vvh-duration, 0ms)',
        transitionTimingFunction: 'ease-out',
      }}
    >
      {/* ── Loading / Error ── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      )}

      {!loading && (error || !match) && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-500 mb-4">{error || 'Match not found'}</p>
            <Button onClick={() => router.push('/')}>Go Home</Button>
          </div>
        </div>
      )}

      {/* ── Main content (only when data is loaded) ── */}
      {!loading && match && (
        <>
          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
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

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/20 h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
                <DropdownMenuItem onClick={() => setReportDialogOpen(true)}>
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
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

          {/* ── STEP 1: Location Decision + Chat Drawer ── */}
          {showLocationSelection && (
            <div className="flex-1 flex flex-col overflow-hidden relative">
              <div
                className="flex-1 overflow-y-auto p-3 pb-16 bg-violet-50"
                style={{ overscrollBehavior: 'contain' }}
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
              </div>

              {/* ── Chat Drawer ── */}
              <motion.div
                className="absolute bottom-0 left-0 right-0 z-40 flex flex-col
                           overflow-hidden border-t border-gray-200 bg-white
                           shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
                initial={false}
                animate={{ height: drawerHeight }}
                onAnimationComplete={handleDrawerAnimComplete}
                transition={{
                  type: 'tween',
                  duration: animDuration,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
              >
                {/* Toggle handle — measured for collapsed height */}
                <div
                  ref={toggleRef}
                  className="flex-shrink-0"
                  style={{
                    paddingBottom: chatDrawerOpen
                      ? '0'
                      : 'var(--safe-bottom, env(safe-area-inset-bottom, 0px))',
                  }}
                >
                  <button
                    onClick={handleToggleDrawer}
                    className={`w-full flex items-center justify-center gap-2
                      bg-white text-violet-600 font-semibold
                      hover:bg-gray-50
                      ${isKbOpen && chatDrawerOpen ? 'py-2 text-sm' : 'py-5 text-base'}`}
                    style={{ transition: 'padding 0.28s ease-out, color 0.15s, background-color 0.15s' }}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Chat
                    {messages.length > 0 && (
                      <span className="bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                        {messages.length}
                      </span>
                    )}
                    {chatDrawerOpen
                      ? <ChevronDown className="h-3 w-3" />
                      : <ChevronUp className="h-3 w-3" />}
                  </button>
                </div>

                {/* Content stays mounted during close so it slides away */}
                {contentMounted && (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <ChatPanel
                      messages={messages}
                      currentUserUid={user?.uid || ''}
                      otherUserName={otherUserProfile?.displayName || 'Buddy'}
                      currentUserPhotoURL={userProfile?.photoURL}
                      otherUserPhotoURL={otherUserProfile?.photoURL}
                      onSendMessage={sendMessage}
                      isSending={isSending}
                      isAtLimit={chatIsAtLimit}
                      totalCount={chatTotalCount}
                      error={chatError}
                      compact={isKbOpen}
                    />
                  </div>
                )}
              </motion.div>
            </div>
          )}

          {/* ── STEP 2: Full Chat View ── */}
          {!showLocationSelection && (
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  messages={messages}
                  currentUserUid={user?.uid || ''}
                  otherUserName={otherUserProfile?.displayName || 'Buddy'}
                  currentUserPhotoURL={userProfile?.photoURL}
                  otherUserPhotoURL={otherUserProfile?.photoURL}
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
                  onCompleteClick={handleCompleteClick}
                  compact={isKbOpen}
                />
              </div>
              {/* Feedback link after completion */}
              {myStatus === 'completed' && (
                <div className="flex-shrink-0 px-3 py-2 bg-violet-50 border-t border-violet-100 text-center">
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
        </>
      )}

      {/* ── Modals (use portals, render on top) ── */}
      <CancelReasonModal
        open={cancelModalOpen}
        onOpenChange={setCancelModalOpen}
        onConfirmCancel={handleConfirmCancel}
        isCancelling={isCancelling}
      />

      <CompleteConfirmDialog
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onConfirm={handleConfirmComplete}
        isLoading={isUpdating}
      />

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
    </div>
  );
}
