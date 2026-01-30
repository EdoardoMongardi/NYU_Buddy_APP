'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock,
    Info,
    ChevronLeft,
    ChevronRight,
    Check,
    Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { PlaceCandidate } from '@/lib/firebase/functions';
import { PlaceCard } from './PlaceCard';

interface LocationDecisionPanelProps {
    placeCandidates: PlaceCandidate[];
    visibleCandidates: PlaceCandidate[];
    myChoice: { placeId: string; placeRank: number } | null;
    otherChoice: { placeId: string; placeRank: number } | null;
    otherChosenCandidate: PlaceCandidate | null;
    otherUserName: string;
    formattedCountdown: string | null;
    canFindOthers: boolean;
    isSettingChoice: boolean;
    onSelectPlace: (placeId: string, placeRank: number) => void;
    onFindOthers: () => void;
    onGoWithTheirChoice: () => void;
    onCancel: () => void;
    isCancelling: boolean;
    windowIndex?: number;
}

export function LocationDecisionPanel({
    placeCandidates,
    visibleCandidates,
    myChoice,
    otherChoice,
    otherChosenCandidate,
    otherUserName,
    formattedCountdown,
    canFindOthers,
    isSettingChoice,
    onSelectPlace,
    onFindOthers,
    onGoWithTheirChoice,
    onCancel,
    isCancelling,
    windowIndex = 0,
}: LocationDecisionPanelProps) {
    const [infoOpen, setInfoOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    const bothChoseSame = myChoice && otherChoice && myChoice.placeId === otherChoice.placeId;
    const currentPlace = visibleCandidates[currentIndex];

    // Navigation handlers for carousel
    const goToPrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        } else if (canFindOthers) {
            // If at start of current window, go to previous window
            onFindOthers();
            setCurrentIndex(2); // Go to last item of new window
        }
    };

    const goToNext = () => {
        if (currentIndex < visibleCandidates.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else if (canFindOthers) {
            // If at end of current window, go to next window
            onFindOthers();
            setCurrentIndex(0); // Go to first item of new window
        }
    };

    // Empty state
    if (placeCandidates.length === 0) {
        return (
            <Card className="border-0 shadow-lg bg-orange-50">
                <CardHeader>
                    <CardTitle className="text-lg text-orange-800">No Spots Found</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-orange-700">
                        We couldn&apos;t find meetup spots within 5km for this activity.
                    </p>
                    <div className="space-y-2">
                        <Button
                            variant="outline"
                            className="w-full border-orange-300 text-orange-700 hover:bg-orange-100"
                            disabled
                        >
                            Switch Activity (coming soon)
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full border-red-200 text-red-600 hover:bg-red-50"
                            onClick={onCancel}
                            disabled={isCancelling}
                        >
                            {isCancelling && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            Cancel Match
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header with countdown */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-600" />
                    <span className="text-lg font-semibold">
                        {formattedCountdown || '--:--'}
                    </span>
                </div>
                <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Info className="w-4 h-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>How location selection works</DialogTitle>
                            <DialogDescription className="pt-2 space-y-2">
                                <p>
                                    <strong>Same pick?</strong> You&apos;re set!
                                </p>
                                <p>
                                    <strong>Different picks?</strong> The higher-ranked spot wins.
                                </p>
                                <p>
                                    <strong>No picks?</strong> We&apos;ll choose the top suggestion.
                                </p>
                                <p className="text-sm text-gray-500 pt-2">
                                    Places are ranked by distance from both of you.
                                </p>
                            </DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Place Carousel */}
            {currentPlace && (
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentPlace.placeId}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                    >
                        <PlaceCard
                            place={currentPlace}
                            isSelected={myChoice?.placeId === currentPlace.placeId}
                            isOtherChoice={otherChoice?.placeId === currentPlace.placeId}
                            isLoading={isSettingChoice}
                            onSelect={() => onSelectPlace(currentPlace.placeId, currentPlace.rank)}
                        />
                    </motion.div>
                </AnimatePresence>
            )}

            {/* Carousel Navigation */}
            <div className="flex items-center justify-between px-2">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={goToPrevious}
                    disabled={currentIndex === 0 && windowIndex === 0}
                    className="h-10 w-10"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Button>

                {/* Pagination dots */}
                <div className="flex items-center gap-1.5">
                    {visibleCandidates.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-2 h-2 rounded-full transition-all ${idx === currentIndex
                                ? 'bg-violet-600 w-4'
                                : 'bg-gray-300 hover:bg-gray-400'
                                }`}
                        />
                    ))}
                    {canFindOthers && (
                        <span className="text-xs text-gray-400 ml-2">
                            +{placeCandidates.length - visibleCandidates.length} more
                        </span>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="icon"
                    onClick={goToNext}
                    className="h-10 w-10"
                >
                    <ChevronRight className="w-5 h-5" />
                </Button>
            </div>

            {/* Their Choice Section */}
            <Card className={`border-0 shadow-md ${bothChoseSame ? 'bg-green-50 border-green-500' :
                otherChoice ? 'bg-orange-50 border-orange-300' :
                    'bg-gray-50'
                }`}>
                <CardContent className="p-4">
                    {!otherChoice ? (
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                            <p className="text-sm text-gray-500">
                                Waiting for {otherUserName} to choose...
                            </p>
                        </div>
                    ) : bothChoseSame ? (
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex items-center gap-3"
                        >
                            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                <Check className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <p className="font-semibold text-green-700">
                                    You both picked the same!
                                </p>
                                <p className="text-sm text-green-600">
                                    {otherChosenCandidate?.name}
                                </p>
                            </div>
                        </motion.div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm text-gray-500">{otherUserName} picked:</p>
                                    <p className="font-medium text-gray-900">
                                        {otherChosenCandidate?.name || 'Unknown place'}
                                    </p>
                                </div>
                                <span className="text-xs text-orange-600">
                                    #{otherChoice.placeRank}
                                </span>
                            </div>
                            <Button
                                onClick={onGoWithTheirChoice}
                                disabled={isSettingChoice}
                                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                            >
                                {isSettingChoice ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-1" />
                                        Go with their choice
                                    </>
                                )}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Cancel button */}
            <Button
                variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                onClick={onCancel}
                disabled={isCancelling}
            >
                {isCancelling && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Cancel Match
            </Button>
        </div>
    );
}
