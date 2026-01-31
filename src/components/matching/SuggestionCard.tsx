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
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="mx-auto mb-4 flex justify-center">
            <ProfileAvatar
              photoURL={userProfile?.photoURL}
              displayName={userProfile?.displayName}
              size="lg"
            />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Set your availability
          </h3>
          <p className="text-gray-500">
            Let others know you&apos;re free to find nearby buddies
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state (initial)
  if (loading && !suggestion) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-4" />
          <p className="text-gray-500">Finding nearby buddies...</p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <p className="text-red-500 mb-4">{error}</p>
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
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-violet-50 flex items-center justify-center">
            <UserX className="w-8 h-8 text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {cycleInfo?.isCycleEnd ? "That's everyone for now" : "No one nearby"}
          </h3>
          <p className="text-gray-500 mb-6">
            {searchMessage}
          </p>
          <Button onClick={() => fetchSuggestion('refresh')} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
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
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
        className="relative"
      >
        <Card className="border-0 shadow-xl bg-white overflow-hidden min-h-[400px] flex flex-col">
          <CardContent className="p-0 flex-1 flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white relative">
              {cycleInfo && cycleInfo.total > 1 && (
                <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5 text-xs text-white/90">
                  {cycleInfo.current} / {cycleInfo.total}
                </div>
              )}

              <div className="flex items-center space-x-4 mb-4 mt-2">
                <ProfileAvatar
                  photoURL={suggestion.photoURL}
                  displayName={suggestion.displayName}
                  size="lg"
                  className="border-4 border-white/20"
                />
                <div>
                  <h3 className="text-2xl font-bold">
                    {suggestion.displayName}
                  </h3>
                  <div className="flex items-center space-x-2 text-white/90 mt-1">
                    <div className="flex items-center text-xs bg-black/20 rounded px-1.5 py-0.5">
                      <MapPin className="w-3 h-3 mr-1" />
                      <span>{suggestion.distance}m</span>
                    </div>
                    <div className="flex items-center text-xs bg-black/20 rounded px-1.5 py-0.5">
                      <Clock className="w-3 h-3 mr-1" />
                      <span>{suggestion.durationMinutes}m</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2 bg-white/20 rounded-lg px-3 py-2 text-sm font-medium">
                <Coffee className="w-4 h-4" />
                <span>Wants to {suggestion.activity}</span>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 flex-1 flex flex-col">
              {/* Explanation */}
              {suggestion.explanation && (
                <div className="mb-4 bg-violet-50 p-3 rounded-lg border border-violet-100">
                  <p className="text-sm text-violet-700 italic text-center">
                    &quot;{suggestion.explanation}&quot;
                  </p>
                </div>
              )}

              {/* Common Interests */}
              {commonInterests.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    You both like
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {commonInterests.map((interest) => (
                      <Badge
                        key={interest}
                        variant="secondary"
                        className="bg-green-100 text-green-700 hover:bg-green-200 border-none px-2 py-1"
                      >
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* All Interests */}
              <div className="mb-6 flex-1">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Interests
                </p>
                <div className="flex flex-wrap gap-2">
                  {suggestion.interests.slice(0, 5).map((interest) => (
                    <Badge key={interest} variant="outline" className="text-zinc-600 border-zinc-200">
                      {interest}
                    </Badge>
                  ))}
                  {suggestion.interests.length > 5 && (
                    <Badge variant="outline" className="text-zinc-500 border-dashed">
                      +{suggestion.interests.length - 5}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-auto space-y-3">
                <div className="flex space-x-3">
                  <Button
                    variant="outline"
                    size="lg"
                    className="flex-1 h-14 border-2 border-gray-100 hover:border-zinc-200 hover:bg-zinc-50 rounded-xl"
                    onClick={handlePass}
                    disabled={isResponding}
                  >
                    <X className="h-6 w-6 text-gray-400" />
                  </Button>

                  {canSendMore ? (
                    <Button
                      size="lg"
                      className="flex-[2] h-14 bg-violet-600 hover:bg-violet-700 rounded-xl shadow-lg shadow-violet-200 transition-all text-base font-semibold"
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
                    <div className="flex-[2] h-14 bg-gray-100 rounded-xl flex items-center justify-center border-2 border-gray-100 px-4 text-center">
                      <span className="text-xs font-medium text-gray-500">
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