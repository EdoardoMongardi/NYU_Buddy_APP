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
                className="h-[60px] bg-red-50 border border-red-100 rounded-xl flex items-center px-4"
            >
                <span className="text-red-500 font-medium text-sm flex items-center gap-2">
                    <AlertCircle size={16} />
                    Expired
                </span>
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            style={{ borderRadius: 12 }}
            className={`relative overflow-hidden transition-colors ${isExpiring ? 'bg-orange-50 border-orange-200' : 'bg-white border-zinc-100'
                } border shadow-sm`}
            animate={{
                width: isExpanded ? '100%' : 'auto',
                height: isExpanded ? 'auto' : 60,
            }}
        >
            {/* Header / Collapsed view */}
            <div
                className="flex items-center p-3 gap-3 cursor-pointer"
                onClick={() => isExpanded ? onCollapse() : onExpand()}
            >
                <div className="relative w-9 h-9 flex-shrink-0">
                    <Image
                        src={offer.toPhotoURL || '/placeholder-user.jpg'}
                        alt={offer.toDisplayName}
                        fill
                        className="rounded-full object-cover"
                    />
                </div>

                <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate text-zinc-900">
                        {offer.toDisplayName}
                    </h3>
                    <div className="flex items-center gap-1.5">
                        {!isExpanded && (
                            // Simple radar dots animation for sending/waiting
                            <div className="flex gap-0.5 mt-1">
                                {[0, 1, 2].map(i => (
                                    <motion.div
                                        key={i}
                                        className="w-1 h-1 bg-violet-400 rounded-full"
                                        animate={{ opacity: [0.3, 1, 0.3] }}
                                        transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                                    />
                                ))}
                            </div>
                        )}
                        {isExpanded && (
                            <span className={`text-xs font-medium ${isExpiring ? 'text-orange-600' : 'text-zinc-500'}`}>
                                {isExpiring ? 'Expires in ' : 'Waiting... '}{formatTime(timeLeft)}
                            </span>
                        )}
                    </div>
                </div>

                {/* Action Button (only visible when expanded) */}
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
                            className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-colors"
                        >
                            <X size={16} />
                        </motion.button>
                    )}
                </AnimatePresence>
            </div>

            {/* Expanded Actions / Details */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-3 pb-3 pt-0"
                    >
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                                className="w-full py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 text-xs font-medium rounded-lg transition-colors"
                            >
                                Cancel Invite
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Progress bar at bottom */}
            <div className="absolute bottom-0 left-0 h-0.5 bg-zinc-100 w-full">
                <motion.div
                    className={`h-full ${isExpiring ? 'bg-orange-500' : 'bg-violet-500'}`}
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: offer.expiresInSeconds, ease: "linear" }}
                />
            </div>
        </motion.div>
    );
}
