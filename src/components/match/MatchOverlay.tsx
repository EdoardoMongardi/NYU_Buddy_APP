'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatch } from '@/lib/hooks/useMatch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

interface MatchOverlayProps {
    matchId: string;
    currentUserId: string;
    onComplete: () => void;
}

export default function MatchOverlay({ matchId, onComplete }: MatchOverlayProps) {
    const { match, loading } = useMatch(matchId);
    const [visible, setVisible] = useState(true);

    // Auto-dismiss after delay (once loaded)
    useEffect(() => {
        if (!loading && match && visible) {
            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(onComplete, 500); // Wait for exit animation
            }, 2000); // Show for 2 seconds

            return () => clearTimeout(timer);
        }
    }, [loading, match, visible, onComplete]);

    if (!visible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="fixed bottom-24 left-4 right-4 z-50"
            >
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 rounded-2xl p-4 shadow-xl border border-white/20 text-white flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <div className="flex -space-x-3">
                            {/* Current User */}
                            <Avatar className="w-10 h-10 border-2 border-white">
                                <AvatarImage src={undefined} /> {/* We could pass current user photo */}
                                <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            {/* Other User (Generic if loading) */}
                            <Avatar className="w-10 h-10 border-2 border-white bg-indigo-200">
                                <AvatarFallback className="bg-indigo-500 text-white">?</AvatarFallback>
                            </Avatar>
                        </div>

                        <div>
                            <h3 className="font-bold text-lg leading-tight">It&apos;s a Match!</h3>
                            <p className="text-white/80 text-sm">Heading to location selection...</p>
                        </div>
                    </div>

                    <div className="animate-pulse">
                        <span className="text-2xl">🎉</span>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
