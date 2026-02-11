'use client';

import { useState } from 'react';
import { PlaceCandidate } from '@/lib/firebase/functions';
import { LocationDecisionPanel } from '@/components/match/LocationDecisionPanel';
import { ChatPanel } from '@/components/match/ChatPanel';
import { ChatMessage } from '@/lib/hooks/useChat';
import { Timestamp } from 'firebase/firestore';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';

// Mock Data
const MOCK_CANDIDATES: PlaceCandidate[] = [
    {
        placeId: 'p1',
        name: 'Think Coffee',
        address: '248 Mercer St, New York, NY',
        lat: 40.729,
        lng: -73.996,
        distance: 120,
        rank: 1,
        tags: ['Coffee', 'Study', 'Quiet'],
        priceRange: '$5-$15',
        photoUrl: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=400&q=80'
    },
    {
        placeId: 'p2',
        name: 'Bobst Library',
        address: '70 Washington Square S, New York, NY',
        lat: 40.729,
        lng: -73.997,
        distance: 350,
        rank: 2,
        tags: ['Library', 'Silent'],
        priceRange: 'Free',
    },
    {
        placeId: 'p3',
        name: 'Kaffe 1668',
        address: '275 Greenwich St, New York, NY',
        lat: 40.715,
        lng: -74.011,
        distance: 850,
        rank: 3,
        tags: ['Coffee', 'Cozy'],
        priceRange: '$10-$20',
    }
];

const MOCK_MESSAGES: ChatMessage[] = [
    {
        id: 'm1',
        senderUid: 'other-user',
        content: 'Hi! Are you near campus?',
        createdAt: Timestamp.now(),
        type: 'text'
    },
    {
        id: 'm2',
        senderUid: 'current-user',
        content: 'Yes, just leaving Bobst now.',
        createdAt: Timestamp.now(),
        type: 'text'
    },
    {
        id: 'm3',
        senderUid: 'other-user',
        content: 'Great, Think Coffee works for me!',
        createdAt: Timestamp.now(),
        type: 'text'
    }
];

export default function PreviewChatUIPage() {
    const [activeStep, setActiveStep] = useState<'step1' | 'step2'>('step1');
    const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
    const [myChoice, setMyChoice] = useState<{ placeId: string; placeRank: number } | null>(null);
    const [messages, setMessages] = useState(MOCK_MESSAGES);
    const [inputValue, setInputValue] = useState('');

    // Step 2 specific state
    const [myStatus, setMyStatus] = useState<string>('heading_there');
    const [statusMessages, setStatusMessages] = useState<ChatMessage[]>([]);

    const handleSendMessage = async (content: string) => {
        const newMsg: ChatMessage = {
            id: Math.random().toString(),
            senderUid: 'current-user',
            content,
            createdAt: Timestamp.now(),
            type: 'text'
        };
        setMessages([...messages, newMsg]);
    };

    const handleStatusUpdate = (status: 'heading_there' | 'arrived' | 'completed') => {
        setMyStatus(status);
        const mockStatusMsg: ChatMessage = {
            id: Math.random().toString(),
            senderUid: 'current-user',
            content: status === 'heading_there' ? 'is on the way 🚶' :
                status === 'arrived' ? 'has arrived 📍' :
                    'marked the meetup as complete ✅',
            createdAt: Timestamp.now(),
            type: 'status'
        };
        setMessages([...messages, mockStatusMsg]);
    };

    return (
        <div className="min-h-screen bg-gray-100 p-4 font-sans">
            <div className="max-w-md mx-auto bg-white rounded-xl shadow-xl overflow-hidden flex flex-col h-[800px]">
                {/* Header with toggle */}
                <div className="bg-violet-600 p-4 text-white flex justify-between items-center shrink-0">
                    <h1 className="font-bold">UI Preview: {activeStep === 'step1' ? 'Location Decision' : 'Status Updates'}</h1>
                    <button
                        onClick={() => setActiveStep(activeStep === 'step1' ? 'step2' : 'step1')}
                        className="text-xs bg-white text-violet-600 px-2 py-1 rounded shadow"
                    >
                        Switch to {activeStep === 'step1' ? 'Step 2' : 'Step 1'}
                    </button>
                </div>

                {/* STEP 1: Location Decision + Drawer */}
                {activeStep === 'step1' && (
                    <div className="flex-1 overflow-y-auto relative bg-violet-50">
                        <div className="space-y-3 p-3 pb-2">
                            <LocationDecisionPanel
                                placeCandidates={MOCK_CANDIDATES}
                                myChoice={myChoice}
                                otherChoice={null}
                                otherChosenCandidate={null}
                                otherUserName="Alice"
                                formattedCountdown="08:45"
                                isSettingChoice={false}
                                onSelectPlace={(id, rank) => setMyChoice({ placeId: id, placeRank: rank })}
                                onGoWithTheirChoice={() => { }}
                                onCancel={() => { }}
                                isCancelling={false}
                                isLoading={false}
                            />
                        </div>


                        {/* Chat Drawer Toggle - Fixed Bottom Sheet */}
                        <motion.div
                            className="fixed bottom-0 left-0 right-0 z-40 flex flex-col border-t border-gray-200 bg-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
                            initial={false}
                            animate={{ height: chatDrawerOpen ? (isKeyboardOpen ? '45vh' : '65vh') : 'auto' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        >
                            <div
                                style={{ paddingBottom: chatDrawerOpen ? '0' : 'calc(24px + env(safe-area-inset-bottom, 0px))' }}
                            >
                                <button
                                    onClick={() => setChatDrawerOpen(!chatDrawerOpen)}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 bg-white text-violet-600 text-base font-semibold hover:bg-gray-50 transition-colors"
                                >
                                    <MessageCircle className="h-4 w-4" />
                                    Chat
                                    {messages.length > 0 && (
                                        <span className="bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                                            {messages.length}
                                        </span>
                                    )}
                                    {chatDrawerOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
                                </button>
                            </div>

                            <AnimatePresence>
                                {chatDrawerOpen && (
                                    <div className="flex-1 flex flex-col overflow-hidden min-h-0 pb-[env(safe-area-inset-bottom,20px)]">
                                        <ChatPanel
                                            messages={messages}
                                            currentUserUid="current-user"
                                            otherUserName="Alice"
                                            currentUserPhotoURL={null}
                                            otherUserPhotoURL={null}
                                            onSendMessage={handleSendMessage}
                                            isSending={false}
                                            isAtLimit={false}
                                            totalCount={messages.length * 10}
                                            error={null}
                                            onInputFocus={() => setIsKeyboardOpen(true)}
                                            onInputBlur={() => setIsKeyboardOpen(false)}
                                        />
                                    </div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </div>
                )}

                {/* STEP 2: Full Chat + Status */}
                {activeStep === 'step2' && (
                    <div className="flex-1 overflow-hidden flex flex-col bg-white">
                        <ChatPanel
                            messages={messages}
                            currentUserUid="current-user"
                            otherUserName="Alice"
                            currentUserPhotoURL={null}
                            otherUserPhotoURL={null}
                            onSendMessage={handleSendMessage}
                            isSending={false}
                            isAtLimit={false}
                            totalCount={messages.length * 10}
                            error={null}
                            // Status Props
                            myStatus={myStatus}
                            isUpdatingStatus={false}
                            onStatusUpdate={handleStatusUpdate}
                            confirmedPlaceName="Think Coffee"
                            confirmedPlaceAddress="248 Mercer St, New York, NY"
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
