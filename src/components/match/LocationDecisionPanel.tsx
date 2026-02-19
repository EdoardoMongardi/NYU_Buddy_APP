'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Clock,
    Info,
    Check,
    Loader2,
    MapPin,
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

    // My chosen candidate
    const myChosenCandidate = myChoice
        ? placeCandidates.find((p) => p.placeId === myChoice.placeId) || null
        : null;

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
        <div className="space-y-2">
            {/* Header with countdown + info */}
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

            {/* Both chose same — success banner */}
            {bothChoseSame && (
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-200"
                >
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                        <Check className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-green-700">
                            You both picked the same!
                        </p>
                        <p className="text-xs text-green-600 truncate">
                            {otherChosenCandidate?.name}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Side-by-side choice grid */}
            <div className="grid grid-cols-2 gap-2">
                {/* LEFT: My Choice */}
                <div>
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 px-1">
                        Your pick
                    </p>
                    {myChosenCandidate ? (
                        <div className="relative">
                            <PlaceCard
                                place={myChosenCandidate}
                                isSelected={true}
                                isOtherChoice={false}
                                isLoading={false}
                                onSelect={() => { }} // Already selected
                                compact
                            />
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl p-2 min-h-[60px]">
                            <MapPin className="w-5 h-5 text-gray-300 mb-1" />
                            <p className="text-[10px] text-gray-400 text-center leading-tight">
                                Swipe below<br />to pick
                            </p>
                        </div>
                    )}
                </div>

                {/* RIGHT: Their Choice */}
                <div>
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-1 px-1">
                        {otherUserName.split(' ')[0]}&apos;s pick
                    </p>
                    {otherChoice ? (
                        otherChosenCandidate ? (
                            <div className="relative">
                                <PlaceCard
                                    place={otherChosenCandidate}
                                    isSelected={false}
                                    isOtherChoice={true}
                                    isLoading={isSettingChoice}
                                    onSelect={onGoWithTheirChoice}
                                    compact
                                />
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center bg-gray-50 border border-gray-200 rounded-xl p-2 min-h-[60px]">
                                <p className="text-xs text-gray-500 text-center">
                                    Picked #{otherChoice.placeRank}
                                </p>
                            </div>
                        )
                    ) : (
                        <div className="flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl p-2 min-h-[60px]">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-300 mb-1" />
                            <p className="text-[10px] text-gray-400 text-center">
                                Waiting...
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Candidates Swipe Row */}
            <div>
                <div className="flex items-center justify-between px-1 mb-1">
                    <p className="text-xs text-gray-500">
                        Swipe to see options
                    </p>
                    <span className="text-[10px] text-gray-400">
                        {placeCandidates.length} spots
                    </span>
                </div>

                <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 pb-2 px-1 -mx-1 scrollbar-hide">
                    {placeCandidates.map((place) => (
                        <div key={place.placeId} className="w-[70vw] sm:w-[280px] shrink-0 snap-center">
                            <PlaceCard
                                place={place}
                                isSelected={currentSelection === place.placeId}
                                isOtherChoice={otherChoice?.placeId === place.placeId}
                                isLoading={isSettingChoice && currentSelection !== place.placeId}
                                onSelect={() => onSelectPlace(place.placeId, place.rank)}
                            />
                            {currentSelection === place.placeId && (
                                <p className="text-center text-[10px] font-medium text-green-600 mt-1">
                                    ✓ Your pick
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
