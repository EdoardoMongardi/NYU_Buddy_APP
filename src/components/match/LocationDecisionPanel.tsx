'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Clock,
    Info,
    Check,
    Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { PlaceCard } from './PlaceCard';
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

interface LocationDecisionPanelProps {
    placeCandidates: PlaceCandidate[];
    myChoice: { placeId: string; placeRank: number } | null;
    otherChoice: { placeId: string; placeRank: number } | null;
    otherChosenCandidate: PlaceCandidate | null;
    otherUserName: string;
    formattedCountdown: string | null;
    isSettingChoice: boolean;
    onSelectPlace: (placeId: string, placeRank: number) => void;
    onGoWithTheirChoice: () => void;
    onCancel: () => void;
    isCancelling: boolean;
    isLoading?: boolean;
}

export function LocationDecisionPanel({
    placeCandidates,
    myChoice,
    otherChoice,
    otherChosenCandidate,
    otherUserName,
    formattedCountdown,
    isSettingChoice,
    onSelectPlace,
    onGoWithTheirChoice,
    onCancel,
    isCancelling,
    isLoading = false,
}: LocationDecisionPanelProps) {
    const [infoOpen, setInfoOpen] = useState(false);

    const bothChoseSame = myChoice && otherChoice && myChoice.placeId === otherChoice.placeId;
    const currentSelection = myChoice?.placeId;

    // Loading State
    if (isLoading && placeCandidates.length === 0) {
        return (
            <Card className="border-0 shadow-lg bg-gray-50">
                <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                    <p className="text-gray-500 font-medium">Finding the best place to meet...</p>
                </CardContent>
            </Card>
        );
    }

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
                                    Places are ranked by multiple factors considering both of you.
                                </p>
                            </DialogDescription>
                        </DialogHeader>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Candidates List (Swipeable) */}
            <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Swipe to see more options
                    </p>
                    <span className="text-xs text-gray-400">
                        {placeCandidates.length} spots
                    </span>
                </div>

                <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-4 px-1 -mx-4 sm:mx-0 sm:px-0 scrollbar-hide">
                    {/* Add padding start to account for negative margin on mobile */}
                    <div className="w-2 shrink-0 sm:hidden" />

                    {placeCandidates.map((place) => (
                        <div key={place.placeId} className="w-[85vw] sm:w-[350px] shrink-0 snap-center">
                            <PlaceCard
                                place={place}
                                isSelected={currentSelection === place.placeId}
                                isOtherChoice={otherChoice?.placeId === place.placeId}
                                isLoading={isSettingChoice && currentSelection !== place.placeId}
                                onSelect={() => onSelectPlace(place.placeId, place.rank)}
                            />
                            {/* Label for own selection */}
                            {currentSelection === place.placeId && (
                                <p className="text-center text-sm font-medium text-green-600 mt-2">
                                    You picked this
                                </p>
                            )}
                        </div>
                    ))}

                    <div className="w-2 shrink-0 sm:hidden" />
                </div>
            </div>

            {/* Their Choice Section */}
            <Card className={`border-0 shadow-md ${bothChoseSame ? 'bg-green-50 border-green-500' : 'bg-white'}`}>
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
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-gray-700 mb-2">
                                {otherUserName} picked:
                            </p>
                            {otherChosenCandidate ? (
                                <PlaceCard
                                    place={otherChosenCandidate}
                                    isSelected={false}
                                    isOtherChoice={true}
                                    isLoading={isSettingChoice}
                                    onSelect={onGoWithTheirChoice}
                                />
                            ) : (
                                <div className="p-4 bg-gray-100 rounded-lg text-sm text-gray-500">
                                    Unknown place selected (#{otherChoice.placeRank})
                                </div>
                            )}
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
