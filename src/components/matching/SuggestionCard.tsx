'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion';
import { Send, MapPin, Coffee, Loader2, RefreshCw, UserX, Clock, Footprints } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

import { useCycleSuggestions } from '@/lib/hooks/useCycleSuggestions';
import { useAuth } from '@/lib/hooks/useAuth';
import type { CycleSuggestion } from '@/lib/firebase/functions';

interface SuggestionCardProps {
  isAvailable: boolean;
  canSendMore: boolean;
  isPWA?: boolean;
}

// ── Swipe thresholds ──
const SWIPE_OFFSET_THRESHOLD = 120;
const SWIPE_VELOCITY_THRESHOLD = 500;
const SWIPE_MIN_OFFSET = 30;

/* ─────────────────────────────────────────────────
 *  Card content renderer — shared between active
 *  and background (next) card so both show full
 *  content immediately.  Card is content-sized;
 *  NO h-full / flex-1 stretching.
 * ───────────────────────────────────────────────── */
function CardBody({
  s,
  commonInterests,
  nonCommonInterests,
  walkMinutes,
  cycleInfo,
  canSendMore,
  onInvite,
  isResponding,
  isSwiping,
  isPWA,
}: {
  s: CycleSuggestion;
  commonInterests: string[];
  nonCommonInterests: string[];
  walkMinutes: number;
  cycleInfo: { current: number; total: number } | null;
  canSendMore: boolean;
  onInvite?: () => void;
  isResponding: boolean;
  isSwiping: boolean;
  isPWA: boolean;
}) {
  return (
    <Card className="border border-gray-200/60 shadow-card bg-white overflow-hidden flex flex-col rounded-2xl">
      <CardContent className="p-0 flex flex-col">
        {/* ── Header ── */}
        <div className={`bg-gray-50/80 px-3.5 relative border-b border-gray-100/80 ${isPWA ? 'py-3' : 'py-2.5'}`}>
          {/* Cycle counter badge */}
          {cycleInfo && cycleInfo.total > 1 && (
            <div className={`absolute top-2 right-2.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              cycleInfo.current === cycleInfo.total
                ? 'bg-amber-100/60 text-amber-600'
                : 'bg-gray-200/60 text-gray-500'
            }`}>
              {cycleInfo.current}/{cycleInfo.total}
              {cycleInfo.current === cycleInfo.total && ' · Last'}
            </div>
          )}

          <div className="flex items-center space-x-3">
            <ProfileAvatar
              photoURL={s.photoURL}
              displayName={s.displayName}
              size="md"
              className="border-[3px] border-white shadow-md ring-2 ring-violet-100/60"
            />
            <div className="flex-1 min-w-0">
              <h3 className="text-[17px] font-bold text-gray-800 tracking-tight truncate">
                {s.displayName}
              </h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Coffee className="w-3 h-3 text-violet-500 flex-shrink-0" />
                <span className="text-[11px] text-gray-500 font-medium truncate">Wants to {s.activity}</span>
              </div>
              <div className="flex items-center flex-wrap gap-1 mt-1">
                <div className="flex items-center text-[10px] text-gray-500 bg-white/80 rounded-full px-1.5 py-0.5 border border-gray-100/60">
                  <MapPin className="w-2.5 h-2.5 mr-0.5 text-violet-400" />
                  <span>{s.distance}m</span>
                </div>
                <div className="flex items-center text-[10px] text-gray-500 bg-white/80 rounded-full px-1.5 py-0.5 border border-gray-100/60">
                  <Footprints className="w-2.5 h-2.5 mr-0.5 text-gray-400" />
                  <span>~{walkMinutes}min</span>
                </div>
                <div className="flex items-center text-[10px] text-gray-500 bg-white/80 rounded-full px-1.5 py-0.5 border border-gray-100/60">
                  <Clock className="w-2.5 h-2.5 mr-0.5 text-gray-400" />
                  <span>{s.durationMinutes}m</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={`px-4 flex flex-col ${isPWA ? 'py-3' : 'py-2.5'}`}>
          {/* Explanation */}
          {s.explanation && (
            <div className="mb-2 bg-violet-50/30 py-1.5 px-3 rounded-xl border border-violet-100/30">
              <p className="text-[11px] text-gray-600 italic text-center leading-relaxed">
                &ldquo;{s.explanation}&rdquo;
              </p>
            </div>
          )}

          {/* Common Interests */}
          {commonInterests.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-0.5">
                You both like
              </p>
              <div className="flex items-center gap-1.5 overflow-hidden">
                {commonInterests.length > 3 && (
                  <Badge variant="secondary" className="bg-violet-50 text-violet-400 border border-violet-100/40 px-1.5 py-0 text-[11px] shrink-0">
                    +{commonInterests.length - 3}
                  </Badge>
                )}
                {commonInterests.slice(0, 3).map((interest) => (
                  <Badge key={interest} variant="secondary" className="bg-violet-50 text-violet-600 border border-violet-100/60 px-2 py-0 text-[11px] shrink-0 whitespace-nowrap">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Non-common Interests */}
          {nonCommonInterests.length > 0 && (
            <div className="mb-1.5">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                Interests
              </p>
              <div className="flex items-center gap-1.5 overflow-hidden">
                {nonCommonInterests.length > 3 && (
                  <Badge variant="outline" className="text-gray-400 border-dashed px-1.5 py-0 text-[11px] shrink-0">
                    +{nonCommonInterests.length - 3}
                  </Badge>
                )}
                {nonCommonInterests.slice(0, 3).map((interest) => (
                  <Badge key={interest} variant="outline" className="text-gray-600 border-gray-200/80 text-[11px] px-2 py-0 shrink-0 whitespace-nowrap">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Action CTA */}
          <div className="pt-2 border-t border-gray-100/60">
            {onInvite ? (
              canSendMore ? (
                <Button
                  size="lg"
                  className="w-full h-[44px] bg-violet-600 hover:bg-violet-700 rounded-2xl shadow-[0_2px_12px_rgba(124,58,237,0.25)] transition-all text-[15px] font-semibold touch-scale"
                  onClick={onInvite}
                  disabled={isResponding || isSwiping}
                >
                  {isResponding ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Send className="h-5 w-5 mr-2" />
                  )}
                  Send Invite
                </Button>
              ) : (
                <div className="w-full h-[44px] bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 px-4 text-center">
                  <span className="text-xs font-medium text-gray-400">Max 3 active invites</span>
                </div>
              )
            ) : (
              /* Background card: show muted CTA placeholder */
              <div className="w-full h-[44px] bg-violet-50/40 rounded-2xl flex items-center justify-center border border-violet-100/40">
                <Send className="h-4 w-4 text-violet-300 mr-2" />
                <span className="text-[13px] font-medium text-violet-400">Send Invite</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SuggestionCard({ isAvailable, canSendMore, isPWA = false }: SuggestionCardProps) {
  const { userProfile } = useAuth();
  const {
    suggestion,
    buffer,
    cycleInfo,
    loading,
    error,
    searchMessage,
    fetchSuggestion,
    passSuggestion,
    sendInvite
  } = useCycleSuggestions();

  const [isResponding, setIsResponding] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);

  // ── Cycle end interstitial ──
  const [showCycleEnd, setShowCycleEnd] = useState(false);
  const hasSwipedRef = useRef(false);
  const prevIsNewCycleRef = useRef(false);

  // Track the uid that was showing when cycle-end was entered,
  // so we can avoid flashing it when "Browse Again" is clicked
  // before passSuggestion has completed.
  const cycleEndUidRef = useRef<string | null>(null);

  // ── Skip enter animation after swipe ──
  const afterSwipeRef = useRef(false);

  // Detect cycle reset: only on transition from false → true AND user has swiped
  useEffect(() => {
    const isNew = cycleInfo?.isNewCycle ?? false;
    if (isNew && !prevIsNewCycleRef.current && hasSwipedRef.current && suggestion) {
      setShowCycleEnd(true);
    }
    prevIsNewCycleRef.current = isNew;
  }, [cycleInfo, suggestion]);

  // Clear the cycle-end uid guard when suggestion changes to a different user
  useEffect(() => {
    if (suggestion && cycleEndUidRef.current && suggestion.uid !== cycleEndUidRef.current) {
      cycleEndUidRef.current = null;
    }
  }, [suggestion]);

  // ── Swipe motion values ──
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-3, 0, 3]);

  // Background card derives from absolute drag distance
  const bgScale = useTransform(x, (v) => {
    const absV = Math.min(Math.abs(v), 250);
    return 0.97 + (absV / 250) * 0.03;
  });
  const bgOpacity = useTransform(x, (v) => {
    const absV = Math.min(Math.abs(v), 250);
    return 0.5 + (absV / 250) * 0.5;
  });

  // Initial fetch when available
  useEffect(() => {
    if (isAvailable && !suggestion && !loading && !searchMessage) {
      fetchSuggestion();
    }
  }, [isAvailable, suggestion, loading, searchMessage, fetchSuggestion]);

  // Reset cycle-end state when availability changes
  useEffect(() => {
    if (!isAvailable) {
      setShowCycleEnd(false);
      hasSwipedRef.current = false;
      cycleEndUidRef.current = null;
    }
  }, [isAvailable]);

  // Reset afterSwipeRef after the new card has mounted
  useEffect(() => {
    if (afterSwipeRef.current) {
      afterSwipeRef.current = false;
    }
  }, [suggestion?.uid]);

  // ── Is this the last card in the cycle? ──
  const isLastCard = cycleInfo
    ? cycleInfo.current >= cycleInfo.total && buffer.length === 0
    : false;

  // Remaining cards after current one (for stack layers)
  const remainingCount = buffer.length;

  // The next suggestion to preview behind the active card
  const nextSuggestion = buffer.length > 0 ? buffer[0] : null;

  // ── Swipe handlers ──
  const handlePan = (_: PointerEvent, info: PanInfo) => {
    if (isResponding || isSwiping || loading) return;
    x.set(info.offset.x);
  };

  const handlePanEnd = async (_: PointerEvent, info: PanInfo) => {
    if (isResponding || isSwiping || loading) return;

    const absX = Math.abs(info.offset.x);
    const absVelocity = Math.abs(info.velocity.x);

    const shouldSwipe =
      absX > SWIPE_OFFSET_THRESHOLD ||
      (absVelocity > SWIPE_VELOCITY_THRESHOLD && absX > SWIPE_MIN_OFFSET);

    if (shouldSwipe) {
      const dir = info.offset.x > 0 ? 1 : -1;
      setIsSwiping(true);
      hasSwipedRef.current = true;
      afterSwipeRef.current = true;

      // Animate card exit
      await animate(x, dir * 500, {
        duration: 0.28,
        ease: [0, 0, 0.2, 1],
      });

      x.set(0);

      // If this is the last card, go straight to cycle-end (no network wait)
      if (isLastCard) {
        // Remember which uid was showing so we don't flash it on "Browse Again"
        cycleEndUidRef.current = suggestion?.uid ?? null;
        setShowCycleEnd(true);
        // Fire pass in background — will update suggestion when done
        passSuggestion();
        setIsSwiping(false);
      } else {
        await passSuggestion();
        setIsSwiping(false);
      }
    } else {
      animate(x, 0, {
        type: 'spring',
        bounce: 0.2,
        duration: 0.35,
      });
    }
  };

  // ── Browse Again handler ──
  const handleBrowseAgain = () => {
    setShowCycleEnd(false);
    hasSwipedRef.current = false;
    prevIsNewCycleRef.current = true;
    // cycleEndUidRef stays set — used to guard against flashing the old card
  };

  // ── Invite handler ──
  const handleInvite = async () => {
    if (!suggestion || isResponding) return;
    setIsResponding(true);
    try {
      await sendInvite();
    } catch {
      // Error handled by hook
    } finally {
      setIsResponding(false);
    }
  };

  // ── Compute interests for current suggestion ──
  const commonInterests =
    suggestion && userProfile
      ? suggestion.interests.filter((i) => userProfile.interests.includes(i))
      : [];

  const nonCommonInterests =
    suggestion
      ? suggestion.interests.filter((i) => !commonInterests.includes(i))
      : [];

  const walkMinutes = suggestion ? Math.max(1, Math.ceil(suggestion.distance / 80)) : 0;

  // ── Compute interests for next suggestion (background card) ──
  const nextCommonInterests =
    nextSuggestion && userProfile
      ? nextSuggestion.interests.filter((i) => userProfile.interests.includes(i))
      : [];

  const nextNonCommonInterests =
    nextSuggestion
      ? nextSuggestion.interests.filter((i) => !nextCommonInterests.includes(i))
      : [];

  const nextWalkMinutes = nextSuggestion ? Math.max(1, Math.ceil(nextSuggestion.distance / 80)) : 0;

  // ── Static states ──
  if (!isAvailable) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-6 text-center py-8">
          <div className="mx-auto mb-3 flex justify-center">
            <ProfileAvatar photoURL={userProfile?.photoURL} displayName={userProfile?.displayName} size="md" />
          </div>
          <h3 className="text-[16px] font-semibold text-gray-800 mb-1">Set your availability</h3>
          <p className="text-[13px] text-gray-400">Let others know you&apos;re free to find nearby buddies</p>
        </CardContent>
      </Card>
    );
  }

  if (loading && !suggestion) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-6 text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-[13px] text-gray-400">Finding nearby buddies...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-6 text-center py-8">
          <p className="text-red-500 text-[13px] mb-3">{error}</p>
          <Button onClick={() => fetchSuggestion('refresh')} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!suggestion && searchMessage) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-5 text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100/60 flex items-center justify-center">
            <UserX className="w-6 h-6 text-gray-300" />
          </div>
          <h3 className="text-[16px] font-semibold text-gray-800 mb-1">No one nearby</h3>
          <p className="text-[13px] text-gray-400 mb-4">{searchMessage}</p>
          <Button onClick={() => fetchSuggestion('refresh')} variant="outline" size="sm" className="rounded-xl text-[13px]">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh List
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!suggestion) return null;

  // ── Guard: if "Browse Again" was clicked but passSuggestion hasn't
  //    delivered the new first card yet, show loading instead of the stale card ──
  if (
    !showCycleEnd &&
    cycleEndUidRef.current &&
    suggestion.uid === cycleEndUidRef.current
  ) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-6 text-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-[13px] text-gray-400">Loading buddies...</p>
        </CardContent>
      </Card>
    );
  }

  // ── Cycle-end interstitial ──
  if (showCycleEnd) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      >
        <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
          <CardContent className="py-10 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-violet-50 flex items-center justify-center">
              <RefreshCw className="w-6 h-6 text-violet-400" />
            </div>
            <h3 className="text-[17px] font-semibold text-gray-800 mb-2">That&apos;s everyone nearby</h3>
            <p className="text-[13px] text-gray-400 mb-6 px-4 leading-relaxed">
              {cycleInfo?.total === 1 ? '1 person is available right now.' : `${cycleInfo?.total || 0} people are available right now.`}
              {' '}New buddies will appear when they set availability.
            </p>
            <Button onClick={handleBrowseAgain} variant="outline" size="sm" className="rounded-xl text-[13px] touch-scale">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Browse Again
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const skipAnimation = afterSwipeRef.current;

  // Stack layers: 2+ remaining → 2 layers, 1 → 1 layer, 0 → none
  const stackLayers = remainingCount >= 2 ? 2 : remainingCount === 1 ? 1 : 0;

  // ── Main swipeable card with stack effect ──
  return (
    <div className="relative">
      {/* ── Stack edge layers — offset to the RIGHT to peek behind card ── */}
      {stackLayers >= 2 && (
        <div className="absolute top-[3px] bottom-[3px] left-1.5 right-0 rounded-2xl bg-gray-100/60 border border-gray-200/30" />
      )}
      {stackLayers >= 1 && (
        <div className="absolute top-[1.5px] bottom-[1.5px] left-1.5 right-[2px] rounded-2xl bg-gray-50/70 border border-gray-200/40" />
      )}

      {/* ── Background card — shows FULL next card content ── */}
      <motion.div
        className="absolute top-0 bottom-0 left-1.5 right-1 rounded-2xl overflow-hidden"
        style={{ scale: bgScale, opacity: bgOpacity }}
      >
        {nextSuggestion ? (
          <CardBody
            s={nextSuggestion}
            commonInterests={nextCommonInterests}
            nonCommonInterests={nextNonCommonInterests}
            walkMinutes={nextWalkMinutes}
            cycleInfo={cycleInfo ? { ...cycleInfo, current: cycleInfo.current + 1 } : null}
            canSendMore={canSendMore}
            isResponding={false}
            isSwiping={false}
            isPWA={isPWA}
          />
        ) : isLastCard ? (
          <Card className="border border-gray-200/60 shadow-card bg-white overflow-hidden rounded-2xl">
            <CardContent className="py-10 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-violet-50 flex items-center justify-center">
                  <RefreshCw className="w-5 h-5 text-violet-400" />
                </div>
                <p className="text-[14px] font-semibold text-gray-700">That&apos;s everyone nearby</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="h-full bg-white rounded-2xl border border-gray-200/40" />
        )}
      </motion.div>

      {/* ── Active card — content-sized, not stretched ── */}
      <motion.div
        key={suggestion.uid}
        initial={skipAnimation ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={skipAnimation ? { duration: 0 } : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        style={{ x, rotate, touchAction: 'none' }}
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        className="relative z-10 mx-1.5"
      >
        <CardBody
          s={suggestion}
          commonInterests={commonInterests}
          nonCommonInterests={nonCommonInterests}
          walkMinutes={walkMinutes}
          cycleInfo={cycleInfo}
          canSendMore={canSendMore}
          onInvite={handleInvite}
          isResponding={isResponding}
          isSwiping={isSwiping}
          isPWA={isPWA}
        />
      </motion.div>
    </div>
  );
}
