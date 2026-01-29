'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, MapPin, User, Coffee, Loader2, RefreshCw, UserX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import { useSuggestion } from '@/lib/hooks/useSuggestion';
import { useAuth } from '@/lib/hooks/useAuth';

interface SuggestionCardProps {
  isAvailable: boolean;
}

export default function SuggestionCard({ isAvailable }: SuggestionCardProps) {
  const router = useRouter();
  const { userProfile } = useAuth();
  const {
    suggestion,
    loading,
    error,
    noOneAvailable,
    searchMessage,
    fetchSuggestion,
    respond
  } = useSuggestion();
  const [isResponding, setIsResponding] = useState(false);
  const [matchCreated, setMatchCreated] = useState<string | null>(null);

  const handleFetch = () => {
    fetchSuggestion();
  };

  const handlePass = async () => {
    if (!suggestion) return;

    setIsResponding(true);
    try {
      await respond(suggestion.uid, 'pass');
      // Fetch next suggestion
      fetchSuggestion();
    } catch {
      // Error handled by hook
    } finally {
      setIsResponding(false);
    }
  };

  const handleAccept = async () => {
    if (!suggestion) return;

    setIsResponding(true);
    try {
      const result = await respond(suggestion.uid, 'accept');
      if (result.matchCreated && 'matchId' in result && result.matchId) {
        setMatchCreated(result.matchId);
        // Redirect to match page after animation
        setTimeout(() => {
          router.push(`/match/${result.matchId}`);
        }, 2000);
      } else if ('offerSent' in result && result.offerSent) {
        // Offer was sent, the home page will show the outgoing offer card
        // No need to fetch next suggestion
      } else {
        // Fetch next suggestion
        fetchSuggestion();
      }
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

  // Match created animation
  if (matchCreated) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center py-12"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center"
        >
          <Check className="w-12 h-12 text-white" />
        </motion.div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">It&apos;s a Match!</h2>
        <p className="text-gray-600">
          You and {suggestion?.displayName} both want to meet up
        </p>
      </motion.div>
    );
  }

  // Not available state
  if (!isAvailable) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <User className="w-8 h-8 text-gray-400" />
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

  // Loading state
  if (loading) {
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
          <Button onClick={handleFetch} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No one available state
  if (noOneAvailable) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
            <UserX className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            No one nearby right now
          </h3>
          <p className="text-gray-500 mb-6">
            {searchMessage || 'Try again in a few minutes when more people are available.'}
          </p>
          <Button onClick={handleFetch} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  // No suggestion yet, show find button
  if (!suggestion) {
    return (
      <Card className="border-0 shadow-lg bg-white/80 backdrop-blur">
        <CardContent className="pt-6 text-center py-12">
          <Button
            onClick={handleFetch}
            size="lg"
            className="bg-gradient-to-r from-violet-600 to-purple-600"
          >
            <User className="mr-2 h-5 w-5" />
            Find Nearby Buddy
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Suggestion card
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={suggestion.uid}
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -50 }}
      >
        <Card className="border-0 shadow-xl bg-white overflow-hidden">
          <CardContent className="p-0">
            {/* Header */}
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <User className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">
                      {suggestion.displayName}
                    </h3>
                    <div className="flex items-center space-x-1 text-white/80">
                      <MapPin className="w-3 h-3" />
                      <span className="text-sm">{suggestion.distance}m away</span>
                    </div>
                  </div>
                </div>
                {suggestion.score && (
                  <div className="text-right">
                    <div className="text-xs text-white/60">Match</div>
                    <div className="text-lg font-bold">{suggestion.score}%</div>
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-2 bg-white/20 rounded-lg px-3 py-2">
                <Coffee className="w-4 h-4" />
                <span>Wants to {suggestion.activity}</span>
              </div>

              {/* Explanation */}
              {suggestion.explanation && (
                <p className="mt-3 text-sm text-white/80 italic">
                  {suggestion.explanation}
                </p>
              )}
            </div>

            {/* Body */}
            <div className="p-6">
              {/* Common Interests */}
              {commonInterests.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm text-gray-500 mb-2">
                    You both like:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {commonInterests.map((interest) => (
                      <Badge
                        key={interest}
                        variant="secondary"
                        className="bg-violet-100 text-violet-700"
                      >
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* All Interests */}
              <div className="mb-6">
                <p className="text-sm text-gray-500 mb-2">Interests:</p>
                <div className="flex flex-wrap gap-2">
                  {suggestion.interests.slice(0, 5).map((interest) => (
                    <Badge key={interest} variant="outline">
                      {interest}
                    </Badge>
                  ))}
                  {suggestion.interests.length > 5 && (
                    <Badge variant="outline">
                      +{suggestion.interests.length - 5}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 h-14 border-2 border-gray-200 hover:border-red-300 hover:bg-red-50"
                  onClick={handlePass}
                  disabled={isResponding}
                >
                  {isResponding ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <X className="h-6 w-6 text-gray-400" />
                  )}
                </Button>
                <Button
                  size="lg"
                  className="flex-1 h-14 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                  onClick={handleAccept}
                  disabled={isResponding}
                >
                  {isResponding ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Check className="h-6 w-6" />
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}