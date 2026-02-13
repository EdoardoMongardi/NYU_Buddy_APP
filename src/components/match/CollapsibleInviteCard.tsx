'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { OutgoingOffer } from '@/lib/firebase/functions';
import Image from 'next/image';

interface CollapsibleInviteCardProps {
    offer: OutgoingOffer;
    isExpanded: boolean;
    onExpand: () => void;
    onCollapse: () => void;
    onCancel: () => void;
}

export function CollapsibleInviteCard({
    offer,
    isExpanded,
    onExpand,
    onCollapse,
    onCancel,
}: CollapsibleInviteCardProps) {
    const [timeLeft, setTimeLeft] = useState(offer.expiresInSeconds);
    const [isExpiring, setIsExpiring] = useState(false);
    const [hasExpired, setHasExpired] = useState(false);

    // Timer logic
    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const expiration = new Date(offer.expiresAt);
            const seconds = Math.max(0, Math.floor((expiration.getTime() - now.getTime()) / 1000));

            setTimeLeft(seconds);

            if (seconds <= 5 && seconds > 0) {
                setIsExpiring(true);
                if (!isExpanded) onExpand(); // Auto-expand when expiring
            } else if (seconds === 0) {
                setHasExpired(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [offer.expiresAt, isExpanded, onExpand, offer.expiresInSeconds]);

    // Initial auto-expand
    useEffect(() => {
        // Only auto-expand if it's very fresh (< 5s old)
        // We can check createdAt if we had it, but for now check if full duration is mostly intact
        if (offer.expiresInSeconds > 590) { // Assuming 10m TTL
            onExpand();
            const timer = setTimeout(onCollapse, 3000);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (hasExpired) {
        return (
            <motion.div
                layout
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="h-[52px] bg-red-50/60 border border-red-100/60 rounded-2xl flex items-center px-4"
            >
                <span className="text-red-400 font-medium text-[13px] flex items-center gap-2">
                    <AlertCircle size={14} />
                    Expired
                </span>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            style={{ borderRadius: 16 }}
            className={`relative overflow-hidden transition-colors ${isExpiring ? 'bg-orange-50/60 border-orange-200/60' : 'bg-white border-gray-200/60'
                } border shadow-card`}
            animate={{
                width: isExpanded ? '100%' : 'auto',
                height: isExpanded ? 'auto' : 52,
            }}
        >
            {/* Header / Collapsed view */}
            <div
                className="flex items-center px-3.5 py-2.5 gap-3 cursor-pointer touch-scale"
                onClick={() => isExpanded ? onCollapse() : onExpand()}
            >
                <div className="relative w-8 h-8 flex-shrink-0">
                    <Image
                        src={offer.toPhotoURL || '/placeholder-user.jpg'}
                        alt={offer.toDisplayName}
                        fill
                        className="rounded-full object-cover ring-1 ring-violet-100/40"
                    />
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold truncate text-gray-800">
                        {offer.toDisplayName}
                    </h3>
                    <div className="flex items-center gap-1.5">
                        {!isExpanded && (
                            <div className="flex gap-[3px] mt-0.5">
                                {[0, 1, 2].map(i => (
                                    <motion.div
                                        key={i}
                                        className="w-[3px] h-[3px] bg-violet-400 rounded-full"
                                        animate={{ opacity: [0.2, 1, 0.2] }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                    />
                                ))}
                            </div>
                        )}
                        {isExpanded && (
                            <span className={`text-[11px] font-medium mt-0.5 ${isExpiring ? 'text-orange-600' : 'text-gray-400'}`}>
                                {isExpiring ? 'Expires in ' : 'Waiting\u2026 '}{formatTime(timeLeft)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Timer pill (collapsed) */}
                {!isExpanded && (
                    <span className="text-[11px] font-medium text-gray-400 tabular-nums">
                        {formatTime(timeLeft)}
                    </span>
                )}

                {/* X button (expanded) */}
                <AnimatePresence>
                    {isExpanded && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onCancel();
                            }}
                            className="p-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-400 transition-colors touch-scale"
                        >
                            <X size={14} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Expanded cancel action */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3.5 pb-3 pt-0"
                    >
                        <button
                            onClick={(e) => { e.stopPropagation(); onCancel(); }}
                            className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 text-[12px] font-medium rounded-xl border border-gray-100 transition-colors touch-scale"
                        >
                            Cancel Invite
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progress bar at bottom */}
            <div className="absolute bottom-0 left-0 h-[2px] bg-gray-100/60 w-full">
                <motion.div
                    className={`h-full rounded-full ${isExpiring ? 'bg-orange-400' : 'bg-violet-400'}`}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: offer.expiresInSeconds, ease: "linear" }}
                />
            </div>
        </motion.div>
    );
}
