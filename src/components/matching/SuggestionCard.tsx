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

interface SuggestionCardProps {
  isAvailable: boolean;
  canSendMore: boolean;
}

// ── Swipe thresholds ──
const SWIPE_OFFSET_THRESHOLD = 120;  // px — slightly longer drag needed
const SWIPE_VELOCITY_THRESHOLD = 500; // px/s flick speed
const SWIPE_MIN_OFFSET = 30;         // minimum offset for velocity-only swipes

export default function SuggestionCard({ isAvailable, canSendMore }: SuggestionCardProps) {
  const { userProfile } = useAuth();
  const {
    suggestion,
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

  // ── Skip enter animation after swipe ──
  const afterSwipeRef = useRef(false);

  // Detect cycle reset: only on transition from false → true
  useEffect(() => {
    const isNew = cycleInfo?.isNewCycle ?? false;
    if (isNew && !prevIsNewCycleRef.current && hasSwipedRef.current && suggestion) {
      setShowCycleEnd(true);
    }
    prevIsNewCycleRef.current = isNew;
  }, [cycleInfo, suggestion]);

  // ── Swipe motion values ──
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-3, 0, 3]);

  // Background card derives from absolute drag distance
  const bgScale = useTransform(x, (v) => {
    const absV = Math.min(Math.abs(v), 250);
    return 0.96 + (absV / 250) * 0.04; // 0.96 → 1.0
  });
  const bgOpacity = useTransform(x, (v) => {
    const absV = Math.min(Math.abs(v), 250);
    return 0.4 + (absV / 250) * 0.6; // 0.4 → 1.0
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
    }
  }, [isAvailable]);

  // Reset afterSwipeRef after the new card has mounted
  useEffect(() => {
    if (afterSwipeRef.current) {
      afterSwipeRef.current = false;
    }
  }, [suggestion?.uid]);

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

      // Animate card exit — slightly longer for card-stack feel
      await animate(x, dir * 500, {
        duration: 0.28,
        ease: [0, 0, 0.2, 1],
      });

      // Reset position for next card
      x.set(0);

      // Browse next — instant from buffer
      await passSuggestion();

      setIsSwiping(false);
    } else {
      // Spring back to center
      animate(x, 0, {
        type: 'spring',
        bounce: 0.2,
        duration: 0.35,
      });
    }
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

  // ── Compute interests ──
  const commonInterests =
    suggestion && userProfile
      ? suggestion.interests.filter((i) => userProfile.interests.includes(i))
      : [];

  const nonCommonInterests =
    suggestion
      ? suggestion.interests.filter((i) => !commonInterests.includes(i))
      : [];

  // Walk time estimate (~80m/min walking speed)
  const walkMinutes = suggestion ? Math.max(1, Math.ceil(suggestion.distance / 80)) : 0;

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

  // ── Cycle-end interstitial ──
  if (showCycleEnd) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
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
            <Button onClick={() => setShowCycleEnd(false)} variant="outline" size="sm" className="rounded-xl text-[13px] touch-scale">
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Browse Again
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const skipAnimation = afterSwipeRef.current;

  // ── Main swipeable card with stack effect ──
  return (
    <div className="relative">
      {/* Background card — decorative "next card" peek visible on edges */}
      <motion.div
        className="absolute inset-x-0 top-1.5 bottom-1.5 mx-1 bg-white/70 rounded-2xl border border-gray-200/40"
        style={{ scale: bgScale, opacity: bgOpacity }}
      />

      {/* Active card — slightly inset so background edges peek through */}
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
        <Card className="border border-gray-200/60 shadow-card bg-white overflow-hidden flex flex-col rounded-2xl">
          <CardContent className="p-0 flex-1 flex flex-col">
            {/* ── Header — larger top section with bigger avatar ── */}
            <div className="bg-gray-50/80 px-4 py-4 relative border-b border-gray-100/80">
              {/* Cycle counter badge */}
              {cycleInfo && cycleInfo.total > 1 && (
                <div className={`absolute top-3 right-3 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  cycleInfo.current === cycleInfo.total
                    ? 'bg-amber-100/60 text-amber-600'
                    : 'bg-gray-200/60 text-gray-500'
                }`}>
                  {cycleInfo.current} / {cycleInfo.total}
                  {cycleInfo.current === cycleInfo.total && ' · Last'}
                </div>
              )}

              <div className="flex items-center space-x-3.5">
                <ProfileAvatar
                  photoURL={suggestion.photoURL}
                  displayName={suggestion.displayName}
                  size="lg"
                  className="border-[3px] border-white shadow-md ring-2 ring-violet-100/60"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[20px] font-bold text-gray-800 tracking-tight truncate">
                    {suggestion.displayName}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Coffee className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
                    <span className="text-[12px] text-gray-600 font-medium truncate">Wants to {suggestion.activity}</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1.5">
                    <div className="flex items-center text-[11px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <MapPin className="w-3 h-3 mr-0.5 text-violet-400" />
                      <span>{suggestion.distance}m</span>
                    </div>
                    <div className="flex items-center text-[11px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <Footprints className="w-3 h-3 mr-0.5 text-gray-400" />
                      <span>~{walkMinutes} min walk</span>
                    </div>
                    <div className="flex items-center text-[11px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <Clock className="w-3 h-3 mr-0.5 text-gray-400" />
                      <span>{suggestion.durationMinutes}m</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="px-4 py-3 flex-1 flex flex-col">
              {/* Explanation */}
              {suggestion.explanation && (
                <div className="mb-2.5 bg-violet-50/30 py-2 px-3 rounded-xl border border-violet-100/30">
                  <p className="text-[12px] text-gray-600 italic text-center leading-relaxed">
                    &ldquo;{suggestion.explanation}&rdquo;
                  </p>
                </div>
              )}

              {/* Common Interests — single line, max 3, +N on left */}
              {commonInterests.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1">
                    You both like
                  </p>
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    {commonInterests.length > 3 && (
                      <Badge variant="secondary" className="bg-violet-50 text-violet-400 border border-violet-100/40 px-1.5 py-0 text-[11px] shrink-0">
                        +{commonInterests.length - 3}
                      </Badge>
                    )}
                    {commonInterests.slice(0, 3).map((interest) => (
                      <Badge
                        key={interest}
                        variant="secondary"
                        className="bg-violet-50 text-violet-600 border border-violet-100/60 px-2 py-0 text-[11px] shrink-0 whitespace-nowrap"
                      >
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Non-common Interests — single line, max 3, +N on left */}
              {nonCommonInterests.length > 0 && (
                <div className="mb-2">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
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
              <div className="mt-auto pt-2.5 border-t border-gray-100/60">
                {canSendMore ? (
                  <Button
                    size="lg"
                    className="w-full h-[46px] bg-violet-600 hover:bg-violet-700 rounded-2xl shadow-[0_2px_12px_rgba(124,58,237,0.25)] transition-all text-[15px] font-semibold touch-scale"
                    onClick={handleInvite}
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
                  <div className="w-full h-[46px] bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 px-4 text-center">
                    <span className="text-xs font-medium text-gray-400">
                      Max 3 active invites
                    </span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
