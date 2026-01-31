'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMatch } from '@/lib/hooks/useMatch';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseDb } from '@/lib/firebase/client';

interface MatchOverlayProps {
    matchId: string;
    currentUserId: string;
    currentUserPhoto?: string | null;
    onComplete: () => void;
}

export default function MatchOverlay({ matchId, currentUserId, currentUserPhoto, onComplete }: MatchOverlayProps) {
    const { match } = useMatch(matchId); // loading state ignored for timer to prevent flash
    const [visible, setVisible] = useState(true);
    const [otherUserPhoto, setOtherUserPhoto] = useState<string | null>(null);

    // Fetch other user's photo once match is loaded
    useEffect(() => {
        if (match) {
            const otherUid = match.user1Uid === currentUserId ? match.user2Uid : match.user1Uid;
            if (otherUid) {
                getDoc(doc(getFirebaseDb(), 'users', otherUid))
                    .then((snap) => {
                        if (snap.exists()) {
                            setOtherUserPhoto(snap.data().photoURL || null);
                        }
                    })
                    .catch((err) => console.error('Error fetching other user photo:', err));
            }
        }
    }, [match, currentUserId]);

    // Auto-dismiss logic - Unconditional timer to prevent flash
    useEffect(() => {
        const timer = setTimeout(() => {
            setVisible(false);
            // Wait for exit animation then complete
            setTimeout(onComplete, 500);
        }, 3000); // 3 seconds constraint

        return () => clearTimeout(timer);
    }, [onComplete]);

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
                                <AvatarImage src={currentUserPhoto || undefined} />
                                <AvatarFallback><User className="w-5 h-5" /></AvatarFallback>
                            </Avatar>
                            {/* Other User */}
                            <Avatar className="w-10 h-10 border-2 border-white bg-indigo-200">
                                <AvatarImage src={otherUserPhoto || undefined} />
                                <AvatarFallback className="bg-indigo-500 text-white">?</AvatarFallback>
                            </Avatar>
                        </div>

                        <div>
                            <h3 className="font-bold text-lg leading-tight">It&apos;s a Match!</h3>
                            <p className="text-white/80 text-sm">You both invited each other. Heading to location selection...</p>
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
