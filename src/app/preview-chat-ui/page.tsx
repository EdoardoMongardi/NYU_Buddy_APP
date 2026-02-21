'use client';

import { useState, useRef, useEffect } from 'react';
import { PlaceCandidate } from '@/lib/firebase/functions';
import { LocationDecisionPanel } from '@/components/match/LocationDecisionPanel';
import { StatusQuickActions } from '@/components/match/StatusQuickActions';
import { ChatMessage } from '@/lib/hooks/useChat';
import { Timestamp } from 'firebase/firestore';
import { motion } from 'framer-motion';
import {
    ChevronDown, ChevronUp, MessageCircle, Send, MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

// ─── Visual Viewport Hook ───────────────────────────────────────────

function useVisualViewport(): boolean {
    const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;

        const root = document.documentElement;

        let rafId: number | null = null;
        let animStartTime = 0;
        let maxHeight = vv.height;

        // ── Open transition (CSS-based, suppresses rAF writes) ──
        let suppressVvhUntil = 0;

        const startOpenTransition = (targetH: number, safeBtm: string) => {
            closePhase = 'off';                       // cancel any close anim
            closeGuard = false;
            root.style.setProperty('--vvh-duration', '280ms');
            root.style.setProperty('--vvh', `${targetH}px`);
            root.style.setProperty('--safe-bottom', safeBtm);
            suppressVvhUntil = Date.now() + 320;
        };

        const endOpenTransition = () => {
            root.style.setProperty('--vvh-duration', '0ms');
            suppressVvhUntil = 0;
        };

        // ── Close animation (JS-driven, NO CSS transition) ──────
        //
        // Phase lifecycle:
        //   'off'  → not animating
        //   'main' → ease-out interpolation toward maxHeight
        //   'hold' → sitting at target, waiting for real viewport
        //
        // When the viewport finally reports its settled height, we
        // snap instantly to it (no correction animation) because a
        // direction-reversal micro-ease was perceived as a "glitch".
        //
        // --vvh-duration stays at 0ms throughout — every frame is a
        // direct style write, so there is no CSS transition that
        // could overshoot or bounce.
        //
        // isKeyboardOpen is set to FALSE at the start (in onFocusOut)
        // so that the Framer Motion drawer animation begins at the
        // same time.  closeGuard prevents normal tracking from
        // flipping isKeyboardOpen back to TRUE while the viewport
        // still shows the keyboard-open height.
        const CLOSE_MAIN_MS = 280;   // matches iOS keyboard slide
        const CLOSE_HOLD_MAX = 500;   // safety timeout for hold

        let closePhase: 'off' | 'main' | 'hold' = 'off';
        let closeStart = 0;    // phase start time
        let closeFromH = 0;    // interpolation start height
        let closeToH = 0;    // interpolation target height
        let closeKbOpenH = 0;   // original keyboard-open vv.height
        let closeGuard = false; // prevent flipping isKeyboardOpen

        const easeOutCubic = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

        // ── per-frame update ──

        const update = () => {
            window.scrollTo(0, 0);

            const height = vv.height;
            const offsetTop = vv.offsetTop;

            if (height > maxHeight) maxHeight = height;
            const kbOpen = maxHeight - height > 100;

            root.style.setProperty('--vv-offset-top', `${offsetTop}px`);

            // --- Open-transition suppression ---
            if (Date.now() < suppressVvhUntil) {
                const target = parseFloat(root.style.getPropertyValue('--vvh'));
                if (!isNaN(target) && Math.abs(height - target) < 10) {
                    endOpenTransition();
                    root.style.setProperty('--vvh', `${height}px`);
                    root.style.setProperty(
                        '--safe-bottom',
                        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
                    );
                    setIsKeyboardOpen(kbOpen);
                }
                return;
            }
            if (suppressVvhUntil > 0) endOpenTransition();

            // --- Close animation (JS-driven) ---
            if (closePhase !== 'off') {
                const now = Date.now();
                const elapsed = now - closeStart;

                // Has the real viewport moved away from the keyboard-
                // open height?  This means the keyboard has finished
                // closing (or is very close).
                const viewportMoved = Math.abs(height - closeKbOpenH) > 50;

                // ·· MAIN phase: ease-out toward maxHeight ··
                if (closePhase === 'main') {
                    if (viewportMoved) {
                        // Viewport settled — snap to real height and
                        // end the animation.  No correction animation;
                        // a 1-frame snap of ≤40px is less perceptible
                        // than a 60ms direction-reversal "glitch".
                        closePhase = 'off';
                        closeGuard = false;
                        // fall through to normal tracking
                    } else if (elapsed < CLOSE_MAIN_MS) {
                        const t = elapsed / CLOSE_MAIN_MS;
                        const h = closeFromH + (closeToH - closeFromH) * easeOutCubic(t);
                        root.style.setProperty('--vvh', `${h}px`);
                        return;
                    } else {
                        // Main animation finished → hold at target
                        closePhase = 'hold';
                        closeStart = now;
                        root.style.setProperty('--vvh', `${closeToH}px`);
                        return;
                    }
                }

                // ·· HOLD phase: wait for viewport to catch up ··
                if (closePhase === 'hold') {
                    if (viewportMoved) {
                        // Snap instantly to real viewport height.
                        closePhase = 'off';
                        closeGuard = false;
                        // fall through to normal tracking
                    } else if (elapsed > CLOSE_HOLD_MAX) {
                        closePhase = 'off'; // timeout
                        closeGuard = false;
                    } else {
                        root.style.setProperty('--vvh', `${closeToH}px`);
                        return;
                    }
                }
            }

            // --- Normal frame-by-frame tracking ---
            root.style.setProperty('--vvh', `${height}px`);
            root.style.setProperty(
                '--safe-bottom',
                kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
            );

            // closeGuard: during the close sequence the real viewport
            // still reports the keyboard-open height for a while.
            // Don't flip isKeyboardOpen back to true — wait for the
            // viewport to confirm keyboard is actually closed.
            if (closeGuard) {
                if (!kbOpen) {
                    closeGuard = false;
                    setIsKeyboardOpen(false);
                }
                // else: skip — don't flip back to true
            } else {
                setIsKeyboardOpen(kbOpen);
            }
        };

        const smoothTrack = () => {
            update();
            const dur = closePhase !== 'off' ? 1000 : 500;
            if (Date.now() - animStartTime < dur) {
                rafId = requestAnimationFrame(smoothTrack);
            }
        };

        // ── event handlers ──

        const onResize = () => {
            const height = vv.height;
            if (height > maxHeight) maxHeight = height;

            // Cancel close animation if keyboard re-opens.
            if (closePhase !== 'off' && height < closeKbOpenH - 20) {
                closePhase = 'off';
                closeGuard = false;
            }

            // CSS transition only for keyboard OPEN (height decrease).
            if (Date.now() >= suppressVvhUntil && closePhase === 'off') {
                const cur = parseFloat(root.style.getPropertyValue('--vvh') || `${maxHeight}`);
                const delta = cur - height;
                if (delta > 80) {
                    const kbOpen = maxHeight - height > 100;
                    startOpenTransition(
                        height,
                        kbOpen ? '0px' : 'env(safe-area-inset-bottom, 0px)',
                    );
                    setIsKeyboardOpen(kbOpen);
                }
            }

            animStartTime = Date.now();
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(smoothTrack);
        };

        // focusout fires the instant the user presses "Done" —
        // *before* the keyboard begins its close animation.
        // We start a JS-driven ease-out toward maxHeight so the
        // input bar moves in sync with the keyboard slide.
        //
        // isKeyboardOpen is set to false HERE (at t=0) so that
        // the Framer Motion drawer animation and all compact-
        // dependent layout changes start at the same time as the
        // container height animation, keeping the drawer button,
        // green strip, and input bar moving as one unit.
        const onFocusOut = (e: FocusEvent) => {
            const target = e.target;
            const related = e.relatedTarget;
            if (
                (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) &&
                !(related instanceof HTMLTextAreaElement || related instanceof HTMLInputElement)
            ) {
                if (maxHeight - vv.height > 100) {
                    closePhase = 'main';
                    closeStart = Date.now();
                    closeFromH = vv.height;
                    closeToH = maxHeight;
                    closeKbOpenH = vv.height;
                    closeGuard = true;
                    // Flip keyboard state immediately so React
                    // re-renders and Framer Motion animations start
                    // in the same frame as the JS height animation.
                    setIsKeyboardOpen(false);
                    // Pre-set safe-bottom so the padding transition
                    // starts at the same time as the height animation.
                    root.style.setProperty(
                        '--safe-bottom', 'env(safe-area-inset-bottom, 0px)',
                    );
                    animStartTime = Date.now();
                    if (rafId) cancelAnimationFrame(rafId);
                    rafId = requestAnimationFrame(smoothTrack);
                }
            }
        };

        update();
        vv.addEventListener('resize', onResize);
        vv.addEventListener('scroll', update);
        document.addEventListener('focusout', onFocusOut);

        return () => {
            vv.removeEventListener('resize', onResize);
            vv.removeEventListener('scroll', update);
            document.removeEventListener('focusout', onFocusOut);
            if (rafId) cancelAnimationFrame(rafId);
            root.style.removeProperty('--vvh');
            root.style.removeProperty('--vv-offset-top');
            root.style.removeProperty('--safe-bottom');
            root.style.removeProperty('--vvh-duration');
        };
    }, []);

    return isKeyboardOpen;
}

// ─── Body scroll lock ───────────────────────────────────────────────

function useLockBodyScroll() {
    useEffect(() => {
        const html = document.documentElement.style;
        const body = document.body.style;

        // Save previous values for cleanup
        const prev = {
            htmlOverflow: html.overflow,
            htmlOverscroll: html.overscrollBehavior,
            bodyOverflow: body.overflow,
            bodyPosition: body.position,
            bodyWidth: body.width,
            bodyHeight: body.height,
            bodyTop: body.top,
            bodyLeft: body.left,
            bodyOverscroll: body.overscrollBehavior,
        };

        // Layer 3: full scroll jail.  position:fixed on body prevents
        // iOS Safari from scrolling the layout viewport when the
        // keyboard opens, which keeps visualViewport.offsetTop ≈ 0.
        html.overflow = 'hidden';
        html.overscrollBehavior = 'none';
        body.overflow = 'hidden';
        body.position = 'fixed';
        body.width = '100%';
        body.height = '100%';
        body.top = '0';
        body.left = '0';
        body.overscrollBehavior = 'none';

        return () => {
            html.overflow = prev.htmlOverflow;
            html.overscrollBehavior = prev.htmlOverscroll;
            body.overflow = prev.bodyOverflow;
            body.position = prev.bodyPosition;
            body.width = prev.bodyWidth;
            body.height = prev.bodyHeight;
            body.top = prev.bodyTop;
            body.left = prev.bodyLeft;
            body.overscrollBehavior = prev.bodyOverscroll;
        };
    }, []);
}

// ─── Safari bottom-bar color ────────────────────────────────────────

function useWhiteThemeColor() {
    useEffect(() => {
        const existing = document.querySelector('meta[name="theme-color"]');
        const prev = existing?.getAttribute('content') ?? null;

        if (existing) {
            existing.setAttribute('content', '#ffffff');
        } else {
            const meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            meta.setAttribute('content', '#ffffff');
            document.head.appendChild(meta);
        }

        return () => {
            const tag = document.querySelector('meta[name="theme-color"]');
            if (prev && tag) tag.setAttribute('content', prev);
            else tag?.remove();
        };
    }, []);
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(timestamp: Timestamp | null): string {
    if (!timestamp) return '';
    try {
        return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

function shouldShowTimestamp(current: ChatMessage, previous: ChatMessage | null): boolean {
    if (!previous) return true;
    if (!current.createdAt || !previous.createdAt) return false;
    try {
        return current.createdAt.toMillis() - previous.createdAt.toMillis() > 5 * 60 * 1000;
    } catch {
        return false;
    }
}

const FIRST_PERSON_STATUS: Record<string, string> = {
    'is on the way 🚶': 'are on the way 🚶',
    'has arrived 📍': 'have arrived 📍',
    'marked the meetup as complete ✅': 'marked the meetup as complete ✅',
};

// ─── Mock Data ──────────────────────────────────────────────────────

const MOCK_CANDIDATES: PlaceCandidate[] = [
    {
        placeId: 'p1', name: 'Think Coffee',
        address: '248 Mercer St, New York, NY',
        lat: 40.729, lng: -73.996, distance: 120, rank: 1,
        tags: ['Coffee', 'Study', 'Quiet'], priceRange: '$5-$15',
        photoUrl: 'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&w=400&q=80',
    },
    {
        placeId: 'p2', name: 'Bobst Library',
        address: '70 Washington Square S, New York, NY',
        lat: 40.729, lng: -73.997, distance: 350, rank: 2,
        tags: ['Library', 'Silent'], priceRange: 'Free',
    },
    {
        placeId: 'p3', name: 'Kaffe 1668',
        address: '275 Greenwich St, New York, NY',
        lat: 40.715, lng: -74.011, distance: 850, rank: 3,
        tags: ['Coffee', 'Cozy'], priceRange: '$10-$20',
    },
];

const makeMockMessages = (): ChatMessage[] => [
    { id: 'm1', senderUid: 'other-user', content: 'Hi! Are you near campus?', createdAt: Timestamp.now(), type: 'text' },
    { id: 'm2', senderUid: 'current-user', content: 'Yes, just leaving Bobst now.', createdAt: Timestamp.now(), type: 'text' },
    { id: 'm3', senderUid: 'other-user', content: 'Great, Think Coffee works for me!', createdAt: Timestamp.now(), type: 'text' },
];

// ─── Inline Chat Panel V2 ──────────────────────────────────────────

interface InlineChatPanelProps {
    messages: ChatMessage[];
    currentUserUid: string;
    otherUserName: string;
    onSendMessage: (content: string) => Promise<void>;
    isSending: boolean;
    isAtLimit: boolean;
    totalCount: number;
    error: string | null;
    confirmedPlaceName?: string;
    confirmedPlaceAddress?: string;
    myStatus?: string;
    isUpdatingStatus?: boolean;
    onStatusUpdate?: (status: 'heading_there' | 'arrived' | 'completed') => void;
    compact?: boolean;
}

function InlineChatPanel({
    messages, currentUserUid, otherUserName,
    onSendMessage, isSending, isAtLimit, totalCount, error,
    confirmedPlaceName, confirmedPlaceAddress,
    myStatus, isUpdatingStatus, onStatusUpdate,
    compact = false,
}: InlineChatPanelProps) {
    const [inputValue, setInputValue] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const wasAtBottomRef = useRef(true);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages.length]);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (!container) return;

        const checkAtBottom = () => {
            const { scrollTop, scrollHeight, clientHeight } = container;
            wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        };

        container.addEventListener('scroll', checkAtBottom, { passive: true });

        const observer = new ResizeObserver(() => {
            if (wasAtBottomRef.current) {
                requestAnimationFrame(() => {
                    if (messagesContainerRef.current) {
                        messagesContainerRef.current.scrollTop =
                            messagesContainerRef.current.scrollHeight;
                    }
                });
            }
        });
        observer.observe(container);

        return () => {
            container.removeEventListener('scroll', checkAtBottom);
            observer.disconnect();
        };
    }, []);

    const handleInputFocus = () => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
    };

    const handleSend = async () => {
        if (!inputValue.trim() || isSending || isAtLimit) return;
        const content = inputValue;
        setInputValue('');
        await onSendMessage(content);
        // Only re-focus when the keyboard is already open so the
        // user can keep typing.  When the keyboard is closed (user
        // pressed "Done" then tapped Send), don't reopen it.
        if (compact) {
            inputRef.current?.focus();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const charCount = inputValue.trim().length;
    const showCharCount = charCount > 400;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {confirmedPlaceName && (
                <div
                    className="flex items-center gap-2 px-3 bg-green-50 border-b border-green-100 flex-shrink-0"
                    style={{
                        paddingTop: compact ? '4px' : '6px',
                        paddingBottom: compact ? '4px' : '6px',
                        transition: 'padding 0.28s ease-out',
                    }}
                >
                    <div className="w-5 h-5 rounded bg-green-100 flex items-center justify-center flex-shrink-0">
                        <MapPin className="w-3 h-3 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium text-green-800 truncate">{confirmedPlaceName}</p>
                        {confirmedPlaceAddress && (
                            <div
                                style={{
                                    maxHeight: compact ? '0px' : '20px',
                                    opacity: compact ? 0 : 1,
                                    overflow: 'hidden',
                                    transition: 'max-height 0.28s ease-out, opacity 0.28s ease-out',
                                }}
                            >
                                <p className="text-[10px] text-green-600 truncate">{confirmedPlaceAddress}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto px-3 py-2 space-y-1 min-h-0"
                style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
            >
                {messages.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-gray-400">Say hi to {otherUserName}! 👋</p>
                    </div>
                )}

                {messages.map((msg, index) => {
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const showTime = shouldShowTimestamp(msg, prevMsg);
                    const isMine = msg.senderUid === currentUserUid;

                    return (
                        <div key={msg.id}>
                            {showTime && msg.createdAt && (
                                <div className="flex justify-center my-1.5">
                                    <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">
                                        {formatTime(msg.createdAt)}
                                    </span>
                                </div>
                            )}

                            {msg.type === 'status' ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex justify-center my-1.5"
                                >
                                    <span className={`text-xs px-3 py-1 rounded-full ${isMine ? 'bg-violet-50 text-violet-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                        {isMine ? 'You' : otherUserName.split(' ')[0]}{' '}
                                        {isMine ? (FIRST_PERSON_STATUS[msg.content] || msg.content) : msg.content}
                                    </span>
                                </motion.div>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex items-end gap-1.5 ${isMine ? 'justify-end' : 'justify-start'}`}
                                >
                                    {!isMine && (
                                        <div className="flex-shrink-0 mb-0.5">
                                            <ProfileAvatar photoURL={null} displayName={otherUserName} size="xs" />
                                        </div>
                                    )}
                                    <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${isMine
                                        ? 'bg-violet-600 text-white rounded-br-md'
                                        : 'bg-gray-100 text-gray-900 rounded-bl-md'
                                        }`}>
                                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                                    </div>
                                    {isMine && (
                                        <div className="flex-shrink-0 mb-0.5">
                                            <ProfileAvatar photoURL={null} displayName="You" size="xs" />
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {error && (
                <div className="px-3 py-1 bg-red-50 border-t border-red-100 flex-shrink-0">
                    <p className="text-xs text-red-600">{error}</p>
                </div>
            )}

            {myStatus && onStatusUpdate && (
                <div className="flex-shrink-0">
                    <StatusQuickActions
                        myStatus={myStatus}
                        isUpdating={isUpdatingStatus || false}
                        onStatusUpdate={onStatusUpdate}
                    />
                </div>
            )}

            <div
                className="flex-shrink-0 border-t border-gray-100 bg-white"
                style={{
                    // Controlled entirely by the --safe-bottom CSS variable
                    // (set to '0px' when keyboard is open, safe-area value
                    // when closed).  This keeps the padding change in sync
                    // with the height transition — both are triggered at
                    // t=0 in startTransition() rather than waiting for the
                    // React state update at t=320ms which caused a visible
                    // 34px bounce on Safari.
                    paddingBottom: 'var(--safe-bottom, env(safe-area-inset-bottom, 0px))',
                    transition: 'padding-bottom 200ms ease-out',
                }}
            >
                <div
                    className="mx-auto max-w-md px-2"
                    style={{
                        paddingTop: compact ? '2px' : '6px',
                        paddingBottom: compact ? '2px' : '6px',
                        transition: 'padding 0.28s ease-out',
                    }}
                >
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onFocus={handleInputFocus}
                            onTouchEnd={(e) => {
                                // Layer 1: prevent iOS auto-scroll on initial focus.
                                // When the keyboard is closed, intercept the tap,
                                // prevent the browser's default scroll-to-input
                                // behavior, and focus manually with preventScroll.
                                if (!compact) {
                                    e.preventDefault();
                                    inputRef.current?.focus({ preventScroll: true });
                                }
                            }}
                            placeholder={isAtLimit ? 'Message limit reached' : 'Type a message...'}
                            disabled={isAtLimit}
                            rows={1}
                            className="flex-1 resize-none border border-violet-200 rounded-2xl px-3 py-2 text-sm
                                focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-transparent
                                disabled:bg-gray-50 disabled:text-gray-400
                                max-h-20 overflow-y-auto bg-white"
                            style={{ minHeight: '36px', fontSize: '16px' }}
                        />
                        <Button
                            size="icon"
                            className="rounded-full h-9 w-9 bg-violet-600 hover:bg-violet-700 flex-shrink-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={handleSend}
                            disabled={!inputValue.trim() || isSending || isAtLimit}
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>

                    {!compact && (
                        <div className="flex justify-between px-1">
                            {showCharCount && (
                                <span className={`text-[10px] ${charCount > 500 ? 'text-red-500' : 'text-gray-400'}`}>
                                    {charCount}/500
                                </span>
                            )}
                            <span className="text-[10px] text-gray-300 ml-auto">
                                {totalCount}/400
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Page ───────────────────────────────────────────────────────────

export default function PreviewChatUIPage() {
    const isKbOpen = useVisualViewport();
    useLockBodyScroll();
    useWhiteThemeColor();

    const [activeStep, setActiveStep] = useState<'step1' | 'step2'>('step2');
    const [chatDrawerOpen, setChatDrawerOpen] = useState(false);
    const [myChoice, setMyChoice] = useState<{ placeId: string; placeRank: number } | null>(null);
    const [messages, setMessages] = useState(makeMockMessages);
    const [myStatus, setMyStatus] = useState<string>('heading_there');

    // ── Drawer animation bookkeeping ──
    // Content stays mounted during the close animation so it slides
    // away with the drawer (no flash).  We unmount it only after
    // Framer Motion reports the height animation is done.
    const [contentMounted, setContentMounted] = useState(false);

    useEffect(() => {
        if (chatDrawerOpen) setContentMounted(true);
    }, [chatDrawerOpen]);

    const handleDrawerAnimComplete = () => {
        if (!chatDrawerOpen) setContentMounted(false);
    };

    // Measure the toggle-handle height so we can animate to an exact
    // collapsed pixel value (CSS can't transition to/from "auto").
    const toggleRef = useRef<HTMLDivElement>(null);
    const [collapsedH, setCollapsedH] = useState(80);
    useEffect(() => {
        const measure = () => {
            if (toggleRef.current) setCollapsedH(toggleRef.current.offsetHeight);
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    // Detect *what changed* to pick the right animation speed.
    // Drawer toggle → 0.3 s smooth tween.
    // Keyboard open/close → 0 s (instant) so the button + content
    //   move together as one piece via the CSS --vvh resize.
    const prevDrawerOpen = useRef(chatDrawerOpen);
    const drawerToggled = prevDrawerOpen.current !== chatDrawerOpen;
    prevDrawerOpen.current = chatDrawerOpen;

    // 0.8 s for user drawer toggle, 0.28 s for keyboard open/close
    // (matches the iOS keyboard slide duration).
    const animDuration = drawerToggled ? 0.8 : 0.28;

    // ── Handlers ──
    const handleSendMessage = async (content: string) => {
        setMessages(prev => [...prev, {
            id: Math.random().toString(),
            senderUid: 'current-user',
            content,
            createdAt: Timestamp.now(),
            type: 'text',
        }]);
    };

    const handleStatusUpdate = (status: 'heading_there' | 'arrived' | 'completed') => {
        setMyStatus(status);
        setMessages(prev => [...prev, {
            id: Math.random().toString(),
            senderUid: 'current-user',
            content: status === 'heading_there' ? 'is on the way 🚶' :
                status === 'arrived' ? 'has arrived 📍' : 'marked the meetup as complete ✅',
            createdAt: Timestamp.now(),
            type: 'status',
        }]);
    };

    const handleToggleDrawer = () => {
        if (chatDrawerOpen) {
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
        }
        setChatDrawerOpen(!chatDrawerOpen);
    };

    // ── Target height for the drawer ──
    const drawerHeight = chatDrawerOpen
        ? (isKbOpen ? '100%' : '65%')
        : collapsedH;

    return (
        <div
            className="fixed inset-x-0 flex flex-col bg-white overflow-hidden"
            style={{
                top: 'var(--vv-offset-top, 0px)',
                height: 'var(--vvh, 100dvh)',
                transitionProperty: 'height',
                transitionDuration: 'var(--vvh-duration, 0ms)',
                transitionTimingFunction: 'ease-out',
            }}
        >
            {/* ── Header ── */}
            <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
                <h1 className="text-sm font-semibold text-white">
                    {activeStep === 'step1' ? 'Location Decision' : 'Chat + Status'}
                </h1>
                <button
                    onClick={() => {
                        setActiveStep(s => s === 'step1' ? 'step2' : 'step1');
                        setChatDrawerOpen(false);
                        setContentMounted(false);
                        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
                    }}
                    className="text-[11px] bg-white/20 text-white px-2.5 py-1 rounded-full backdrop-blur-sm"
                >
                    Switch to {activeStep === 'step1' ? 'Step 2' : 'Step 1'}
                </button>
            </div>

            {/* ── STEP 1 ── */}
            {activeStep === 'step1' && (
                <div className="flex-1 flex flex-col overflow-hidden relative">
                    <div
                        className="flex-1 overflow-y-auto p-3 pb-16 bg-violet-50"
                        style={{ overscrollBehavior: 'contain' }}
                    >
                        <LocationDecisionPanel
                            placeCandidates={MOCK_CANDIDATES}
                            myChoice={myChoice}
                            otherChoice={null}
                            otherChosenCandidate={null}
                            otherUserName="Alice"
                            formattedCountdown="08:45"
                            isSettingChoice={false}
                            onSelectPlace={(id, rank) => setMyChoice({ placeId: id, placeRank: rank })}
                            onSelectCustomPlace={() => { }}
                            onGoWithTheirChoice={() => { }}
                            onCancel={() => { }}
                            isCancelling={false}
                            isLoading={false}
                        />
                    </div>

                    {/* ── Chat Drawer ──────────────────────────────────
                         Uses a measured collapsed height (not "auto") so
                         Framer Motion can smoothly interpolate open/close.
                         Content stays mounted during close so it clips
                         away with the drawer rather than vanishing first.
                         Keyboard transitions are instant (duration 0) so
                         button + messages travel as a single rigid piece
                         driven by the CSS --vvh container resize.
                         ─────────────────────────────────────────────── */}
                    <motion.div
                        className="absolute bottom-0 left-0 right-0 z-40 flex flex-col
                                   overflow-hidden border-t border-gray-200 bg-white
                                   shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]"
                        initial={false}
                        animate={{ height: drawerHeight }}
                        onAnimationComplete={handleDrawerAnimComplete}
                        transition={{
                            type: 'tween',
                            duration: animDuration,
                            ease: [0.25, 0.1, 0.25, 1],
                        }}
                    >
                        {/* Toggle handle — measured for collapsed height */}
                        <div
                            ref={toggleRef}
                            className="flex-shrink-0"
                            style={{
                                paddingBottom: chatDrawerOpen
                                    ? '0'
                                    : 'var(--safe-bottom, env(safe-area-inset-bottom, 0px))',
                            }}
                        >
                            <button
                                onClick={handleToggleDrawer}
                                className={`w-full flex items-center justify-center gap-2
                                    bg-white text-violet-600 font-semibold
                                    hover:bg-gray-50
                                    ${isKbOpen && chatDrawerOpen ? 'py-2 text-sm' : 'py-5 text-base'}`}
                                style={{ transition: 'padding 0.28s ease-out, color 0.15s, background-color 0.15s' }}
                            >
                                <MessageCircle className="h-4 w-4" />
                                Chat
                                {messages.length > 0 && (
                                    <span className="bg-violet-600 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                                        {messages.length}
                                    </span>
                                )}
                                {chatDrawerOpen
                                    ? <ChevronDown className="h-3 w-3" />
                                    : <ChevronUp className="h-3 w-3" />}
                            </button>
                        </div>

                        {/* Content — mounted during open AND during the
                            close animation so it visually slides away
                            instead of vanishing first.  Unmounted only
                            after onAnimationComplete fires. */}
                        {contentMounted && (
                            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                                <InlineChatPanel
                                    messages={messages}
                                    currentUserUid="current-user"
                                    otherUserName="Alice"
                                    onSendMessage={handleSendMessage}
                                    isSending={false}
                                    isAtLimit={false}
                                    totalCount={messages.length * 10}
                                    error={null}
                                    compact={isKbOpen}
                                />
                            </div>
                        )}
                    </motion.div>
                </div>
            )}

            {/* ── STEP 2 ── */}
            {activeStep === 'step2' && (
                <div className="flex-1 overflow-hidden bg-white">
                    <InlineChatPanel
                        messages={messages}
                        currentUserUid="current-user"
                        otherUserName="Alice"
                        onSendMessage={handleSendMessage}
                        isSending={false}
                        isAtLimit={false}
                        totalCount={messages.length * 10}
                        error={null}
                        confirmedPlaceName="Think Coffee"
                        confirmedPlaceAddress="248 Mercer St, New York, NY"
                        myStatus={myStatus}
                        isUpdatingStatus={false}
                        onStatusUpdate={handleStatusUpdate}
                        compact={isKbOpen}
                    />
                </div>
            )}
        </div>
    );
}
