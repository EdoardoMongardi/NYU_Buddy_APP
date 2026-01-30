'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MapPin,
    Coffee,
    Clock,
    Info,
    ChevronRight,
    Check,
    Loader2,
    RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
}: LocationDecisionPanelProps) {
    const [infoOpen, setInfoOpen] = useState(false);

    const bothChoseSame = myChoice && otherChoice && myChoice.placeId === otherChoice.placeId;
    const myChosenCandidate = myChoice
        ? placeCandidates.find(c => c.placeId === myChoice.placeId)
        : null;

    // Check if my choice is in the visible window
    const myChoiceInWindow = myChoice && visibleCandidates.some(c => c.placeId === myChoice.placeId);

    return (
        <div className="space-y-4">
            {/* Header with countdown */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-violet-600" />
                    <span className="text-lg font-semibold">
                        Time left: {formattedCountdown || '--:--'}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Info className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>How it works</DialogTitle>
                                <DialogDescription className="pt-2 space-y-2">
                                    <p>
                                        If you both pick the same spot, you&apos;re set! Otherwise, the
                                        higher-ranked spot wins. If no one picks, we&apos;ll choose the
                                        top suggestion.
                                    </p>
                                    <p className="text-sm text-gray-500">
                                        Places are ranked by distance from both of you.
                                    </p>
                                </DialogDescription>
                            </DialogHeader>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Dual Panel Layout */}
            <div className="grid grid-cols-2 gap-3">
                {/* Left Panel: Pick a spot */}
                <Card className="border-0 shadow-lg">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-violet-600" />
                            Pick a spot
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {/* Show pinned selection if not in window */}
                        {myChosenCandidate && !myChoiceInWindow && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="p-2 bg-violet-50 border-2 border-violet-500 rounded-lg"
                            >
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                                        <Check className="w-4 h-4 text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 truncate">
                                            {myChosenCandidate.name}
                                        </p>
                                        <p className="text-xs text-violet-600">Your selection</p>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Visible candidates */}
                        <AnimatePresence mode="popLayout">
                            {visibleCandidates.map((place) => {
                                const isSelected = myChoice?.placeId === place.placeId;
                                const isOtherChoice = otherChoice?.placeId === place.placeId;

                                return (
                                    <motion.button
                                        key={place.placeId}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0, scale: isSelected ? 0.98 : 1 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        onClick={() => onSelectPlace(place.placeId, place.rank)}
                                        disabled={isSettingChoice}
                                        className={`w-full p-2 rounded-lg text-left transition-all ${isSelected
                                                ? 'bg-violet-50 border-2 border-violet-500 shadow-sm'
                                                : 'bg-gray-50 border border-gray-200 hover:border-violet-300'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSelected ? 'bg-violet-100' : 'bg-gray-100'
                                                }`}>
                                                <Coffee className={`w-4 h-4 ${isSelected ? 'text-violet-600' : 'text-gray-500'}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 truncate">
                                                    {place.name}
                                                </p>
                                                <div className="flex items-center gap-1">
                                                    <Badge variant="outline" className="text-xs py-0 h-5">
                                                        #{place.rank}
                                                    </Badge>
                                                    <span className="text-xs text-gray-500">{place.distance}m</span>
                                                    {isOtherChoice && !isSelected && (
                                                        <Badge className="text-xs py-0 h-5 bg-orange-100 text-orange-700 border-0">
                                                            Their pick
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <Check className="w-4 h-4 text-violet-600 flex-shrink-0" />
                                            )}
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </AnimatePresence>

                        {/* Find Others button */}
                        {canFindOthers && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onFindOthers}
                                className="w-full text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                            >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                Find others
                            </Button>
                        )}
                    </CardContent>
                </Card>

                {/* Right Panel: Their choice */}
                <Card className={`border-0 shadow-lg ${bothChoseSame ? 'border-2 border-green-500 bg-green-50' :
                        otherChoice ? 'border-2 border-orange-300 bg-orange-50' :
                            'bg-gray-50'
                    }`}>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Their choice</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {!otherChoice ? (
                            <div className="text-center py-6">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
                                <p className="text-sm text-gray-500">
                                    {otherUserName} is choosing...
                                </p>
                            </div>
                        ) : bothChoseSame ? (
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-center py-4"
                            >
                                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                                    <Check className="w-6 h-6 text-green-600" />
                                </div>
                                <p className="font-semibold text-green-700">
                                    Congrats! {otherChosenCandidate?.name} it is!
                                </p>
                            </motion.div>
                        ) : (
                            <div className="space-y-3">
                                <div className="p-2 bg-white rounded-lg border border-orange-200">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                                            <Coffee className="w-4 h-4 text-orange-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">
                                                {otherChosenCandidate?.name || 'Unknown place'}
                                            </p>
                                            <p className="text-xs text-orange-600">
                                                #{otherChoice.placeRank} • {otherChosenCandidate?.distance}m
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Go with their choice button */}
                                <Button
                                    onClick={onGoWithTheirChoice}
                                    disabled={isSettingChoice}
                                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                                >
                                    {isSettingChoice ? (
                                        <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                    ) : (
                                        <ChevronRight className="w-4 h-4 mr-1" />
                                    )}
                                    Go with their choice
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Selection status */}
            {myChoice && !bothChoseSame && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center text-sm text-violet-600"
                >
                    You selected <strong>{myChosenCandidate?.name}</strong>. Waiting for {otherUserName}...
                </motion.div>
            )}

            {/* Cancel button */}
            <div className="pt-2">
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
        </div>
    );
}
