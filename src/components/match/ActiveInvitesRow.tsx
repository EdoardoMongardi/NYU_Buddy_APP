'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OutgoingOffer } from '@/lib/firebase/functions';
import { CollapsibleInviteCard } from './CollapsibleInviteCard';

interface ActiveInvitesRowProps {
    offers: OutgoingOffer[];
    onCancel: (offerId: string) => void;
}

export function ActiveInvitesRow({ offers, onCancel }: ActiveInvitesRowProps) {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    if (!offers || offers.length === 0) return null;

    return (
        <div className="w-full mb-2">
            <div className="flex items-center justify-between px-0.5 mb-1">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Active Invites
                </h4>
                <span className="text-[10px] font-medium text-gray-300">
                    {offers.length}/3
                </span>
            </div>

            {/* Horizontal row — 3 chips side by side */}
            <div className="flex gap-1.5">
                <AnimatePresence initial={false}>
                    {offers.map((offer) => (
                        <CollapsibleInviteCard
                            key={offer.offerId}
                            offer={offer}
                            isExpanded={expandedId === offer.offerId}
                            onExpand={() => setExpandedId(offer.offerId)}
                            onCollapse={() => setExpandedId(null)}
                            onCancel={() => onCancel(offer.offerId)}
                        />
                    ))}
                </AnimatePresence>
            </div>

            {/* Cancel action — shows below the row when one is expanded */}
            <AnimatePresence>
                {expandedId && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                    >
                        <button
                            onClick={() => {
                                onCancel(expandedId);
                                setExpandedId(null);
                            }}
                            className="w-full mt-1.5 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 text-[12px] font-medium rounded-xl border border-gray-100 transition-colors touch-scale"
                        >
                            Cancel Invite
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
