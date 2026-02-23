'use client';

import { ClipboardList, Zap, Map, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { useNav } from '@/context/NavContext';
import { useUnreadBadges } from '@/lib/hooks/useUnreadBadges';

export type TabKey = 'home' | 'manage' | 'search' | 'map' | 'settings';

interface Tab {
    key: TabKey;
    label: string;
    icon: React.ElementType;
}

const XHome = ({ className, ...props }: React.SVGProps<SVGSVGElement>) => {
    // Check if the generic CSS means it is active based on the scale property
    const isActive = className?.includes('scale-105');

    // We override the generic CSS to force a pure fill for X's solid/outline path design 
    const svgClass = `w-[26px] h-[26px] flex-shrink-0 transition-transform duration-150 ${className?.includes('text-gray-') ? 'fill-gray-600' : 'fill-black'} ${isActive ? 'scale-105' : ''}`;

    if (isActive) {
        // Active solid house
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClass} {...props}>
                <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM13 20h-2v-5.5c0-.552.448-1 1-1s1 .448 1 1V20z" />
            </svg>
        );
    }
    // Inactive hollow house
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={svgClass} {...props}>
            <path d="M12 1.696L.622 8.807l1.06 1.696L3 9.679V19.5C3 20.881 4.119 22 5.5 22h13c1.381 0 2.5-1.119 2.5-2.5V9.679l1.318.824 1.06-1.696L12 1.696zM5 19.5V8.428l7-4.375 7 4.375V19.5c0 .276-.224.5-.5.5h-5v-5.5c0-1.381-1.119-2.5-2.5-2.5s-2.5 1.119-2.5 2.5V20H5.5c-.276 0-.5-.224-.5-.5z" />
        </svg>
    );
};

const TABS: Tab[] = [
    { key: 'home', label: 'Home', icon: XHome },
    { key: 'manage', label: 'Activity', icon: ClipboardList },
    { key: 'search', label: 'Match', icon: Zap },
    { key: 'map', label: 'Map', icon: Map },
    { key: 'settings', label: 'Settings', icon: Settings },
];

interface BottomTabBarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
}

export default function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
    const router = useRouter();
    const { userProfile } = useAuth();
    const { navRef } = useNav();

    // Mount custom unread badges
    const unreadBadges = useUnreadBadges(activeTab);

    // On map tab, sidebar goes to far left; otherwise centered relative to content
    const isMapActive = activeTab === 'map';

    return (
        <>
            {/* ── Mobile bottom tab bar (< md) ── */}
            {/* 
              X-style bottom bar: 
              - Tab icons sit in a 44px row
              - Below the icons is env(safe-area-inset-bottom) padding for iPhone home indicator
              - The bar itself has a thin top border
            */}
            <nav
                ref={navRef as React.RefObject<HTMLElement>}
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
            >
                <div
                    className="flex items-center justify-around"
                    style={{ height: '48px', paddingTop: '2px', paddingBottom: '2px' }}
                >
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className="flex items-center justify-center flex-1 h-full"
                            >
                                <div className="relative inline-flex items-center justify-center">
                                    <Icon
                                        className={`w-[26px] h-[26px] transition-all duration-150 ${isActive ? 'scale-105 fill-black text-white stroke-[1.5px]' : 'fill-white text-black stroke-[1.8px]'
                                            }`}
                                    />
                                    {(unreadBadges as Record<string, boolean>)[tab.key] && (
                                        <div className="absolute top-0 right-0 w-[10px] h-[10px] bg-violet-500 border-[2px] border-white rounded-full -translate-y-[2px] translate-x-[2px]" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
                {/* Safe area spacer for iPhone home indicator */}
                <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </nav>

            {/* ── Desktop left sidebar (≥ md) ── */}
            <nav
                className="hidden md:flex fixed top-0 bottom-0 z-50 bg-white border-r border-gray-200/60 flex-col w-[220px] transition-all duration-200"
                style={{
                    right: isMapActive ? undefined : 'calc(50% + 300px)',
                    left: isMapActive ? '0' : undefined,
                }}
            >
                {/* Branding */}
                <div className="px-5 pt-5 pb-4">
                    <span className="text-xl font-bold text-violet-600 tracking-tight">
                        NYU Buddy
                    </span>
                </div>

                {/* Tab items */}
                <div className="flex-1 flex flex-col gap-0.5 px-3">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className={`relative flex items-center gap-3 px-4 py-3 rounded-full text-[15px] transition-colors ${isActive
                                    ? 'text-gray-900 font-bold'
                                    : 'text-gray-600 hover:bg-gray-50 font-medium'
                                    }`}
                            >
                                <div className="relative inline-flex items-center justify-center">
                                    <Icon
                                        className={`w-[26px] h-[26px] flex-shrink-0 transition-all duration-150 ${isActive ? 'scale-105 fill-black text-white stroke-[1.5px]' : 'fill-white text-black stroke-[1.8px]'
                                            }`}
                                    />
                                    {(unreadBadges as Record<string, boolean>)[tab.key] && (
                                        <div className="absolute top-0 right-0 w-[10px] h-[10px] bg-violet-500 border-[2px] border-white rounded-full -translate-y-[2px] translate-x-[2px]" />
                                    )}
                                </div>
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}

                    {/* Post button (like X's "Post" pill) */}
                    <button
                        onClick={() => router.push('/post/create')}
                        className="mt-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full text-[15px] font-bold transition-colors"
                    >
                        Post
                    </button>
                </div>

                {/* User profile at bottom (like X) */}
                {userProfile && (
                    <div className="px-3 pb-4 pt-2">
                        <button
                            onClick={() => onTabChange('settings')}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-full hover:bg-gray-50 transition-colors"
                        >
                            <ProfileAvatar
                                photoURL={userProfile.photoURL}
                                displayName={userProfile.displayName}
                                size="sm"
                            />
                            <div className="flex-1 min-w-0 text-left">
                                <p className="text-[14px] font-bold text-gray-900 truncate">
                                    {userProfile.displayName}
                                </p>
                            </div>
                        </button>
                    </div>
                )}
            </nav>
        </>
    );
}
