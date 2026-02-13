'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, MapPin, Coffee, Loader2, RefreshCw, UserX, Clock } from 'lucide-react';

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

  // Initial fetch when available
  useEffect(() => {
    if (isAvailable && !suggestion && !loading && !searchMessage) {
      fetchSuggestion();
    }
  }, [isAvailable, suggestion, loading, searchMessage, fetchSuggestion]);

  const handlePass = async () => {
    if (!suggestion) return;
    setIsResponding(true);
    try {
      await passSuggestion();
    } finally {
      setIsResponding(false);
    }
  };

  const handleInvite = async () => {
    if (!suggestion) return;
    setIsResponding(true);
    try {
      await sendInvite();
      // Match redirection logic handled by HomePage match listener
    } catch {
      // Error handled by hook
    } finally {
      setIsResponding(false);
    }
  };

  // Find common interests
  const commonInterests =
    suggestion && userProfile
      ? suggestion.interests.filter((i) => userProfile.interests.includes(i))
      : [];

  // Not available state
  if (!isAvailable) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-6 text-center py-8">
          <div className="mx-auto mb-3 flex justify-center">
            <ProfileAvatar
              photoURL={userProfile?.photoURL}
              displayName={userProfile?.displayName}
              size="md"
            />
          </div>
          <h3 className="text-[16px] font-semibold text-gray-800 mb-1">
            Set your availability
          </h3>
          <p className="text-[13px] text-gray-400">
            Let others know you&apos;re free to find nearby buddies
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state (initial)
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

  // Error state
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

  // No one available state (or cycle end)
  if (!suggestion && searchMessage) {
    return (
      <Card className="border border-gray-200/60 shadow-card bg-white rounded-2xl">
        <CardContent className="pt-5 text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100/60 flex items-center justify-center">
            <UserX className="w-6 h-6 text-gray-300" />
          </div>
          <h3 className="text-[16px] font-semibold text-gray-800 mb-1">
            {cycleInfo?.isCycleEnd ? "That's everyone for now" : "No one nearby"}
          </h3>
          <p className="text-[13px] text-gray-400 mb-4">
            {searchMessage}
          </p>
          <Button onClick={() => fetchSuggestion('refresh')} variant="outline" size="sm" className="rounded-xl text-[13px]">
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh List
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!suggestion) return null;

  // Suggestion card
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={suggestion.uid}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <Card className="border border-gray-200/60 shadow-card bg-white overflow-hidden flex flex-col rounded-2xl">
          <CardContent className="p-0 flex-1 flex flex-col">
            {/* Header — compact: avatar + info + activity in one zone */}
            <div className="bg-gray-50/80 px-4 py-4 relative border-b border-gray-100/80">
              {cycleInfo && cycleInfo.total > 1 && (
                <div className="absolute top-3 right-3 bg-gray-200/60 rounded-full px-2.5 py-0.5 text-[11px] text-gray-500 font-medium">
                  {cycleInfo.current} / {cycleInfo.total}
                </div>
              )}

              <div className="flex items-center space-x-3">
                <ProfileAvatar
                  photoURL={suggestion.photoURL}
                  displayName={suggestion.displayName}
                  size="md"
                  className="border-[3px] border-white shadow-md ring-2 ring-violet-100/60"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-[18px] font-bold text-gray-800 tracking-tight truncate">
                    {suggestion.displayName}
                  </h3>
                  <div className="flex items-center flex-wrap gap-1.5 mt-1">
                    <div className="flex items-center text-[11px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <MapPin className="w-3 h-3 mr-0.5 text-violet-400" />
                      <span>{suggestion.distance}m</span>
                    </div>
                    <div className="flex items-center text-[11px] text-gray-500 bg-white/80 rounded-full px-2 py-0.5 border border-gray-100/60">
                      <Clock className="w-3 h-3 mr-0.5 text-gray-400" />
                      <span>{suggestion.durationMinutes}m</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Coffee className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-[12px] text-gray-600 font-medium">Wants to {suggestion.activity}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body — tighter spacing */}
            <div className="px-4 py-3.5 flex-1 flex flex-col">
              {/* Explanation */}
              {suggestion.explanation && (
                <div className="mb-3 bg-violet-50/30 py-2.5 px-3 rounded-xl border border-violet-100/30">
                  <p className="text-[12px] text-gray-600 italic text-center leading-relaxed">
                    &ldquo;{suggestion.explanation}&rdquo;
                  </p>
                </div>
              )}

              {/* Common Interests */}
              {commonInterests.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-1.5">
                    You both like
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {commonInterests.slice(0, 4).map((interest) => (
                      <Badge
                        key={interest}
                        variant="secondary"
                        className="bg-violet-50 text-violet-600 border border-violet-100/60 px-2 py-0.5 text-[12px]"
                      >
                        {interest}
                      </Badge>
                    ))}
                    {commonInterests.length > 4 && (
                      <Badge variant="secondary" className="bg-violet-50 text-violet-400 border border-violet-100/40 px-2 py-0.5 text-[12px]">
                        +{commonInterests.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* All Interests */}
              <div className="mb-3">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                  Interests
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestion.interests.slice(0, 4).map((interest) => (
                    <Badge key={interest} variant="outline" className="text-gray-600 border-gray-200/80 text-[12px] px-2 py-0.5">
                      {interest}
                    </Badge>
                  ))}
                  {suggestion.interests.length > 4 && (
                    <Badge variant="outline" className="text-gray-400 border-dashed text-[12px] px-2 py-0.5">
                      +{suggestion.interests.length - 4}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-auto pt-3 border-t border-gray-100/60">
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 h-[48px] border border-gray-200 hover:bg-gray-50 rounded-2xl touch-scale"
                    onClick={handlePass}
                    disabled={isResponding}
                  >
                    <X className="h-5 w-5 text-gray-400" />
                  </Button>

                  {canSendMore ? (
                    <Button
                      size="lg"
                      className="flex-[2] h-[48px] bg-violet-600 hover:bg-violet-700 rounded-2xl shadow-[0_2px_12px_rgba(124,58,237,0.25)] transition-all text-[15px] font-semibold touch-scale"
                      onClick={handleInvite}
                      disabled={isResponding}
                    >
                      {isResponding ? (
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                      ) : (
                        <Send className="h-5 w-5 mr-2" />
                      )}
                      Send Invite
                    </Button>
                  ) : (
                    <div className="flex-[2] h-[48px] bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 px-4 text-center">
                      <span className="text-xs font-medium text-gray-400">
                        Max 3 active invites
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}