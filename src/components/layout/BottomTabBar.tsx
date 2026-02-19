'use client';

import { Home, ClipboardList, Zap, Map, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';

export type TabKey = 'home' | 'manage' | 'search' | 'map' | 'settings';

interface Tab {
    key: TabKey;
    label: string;
    icon: React.ElementType;
}

const TABS: Tab[] = [
    { key: 'home', label: 'Home', icon: Home },
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
                className="md:hidden fixed bottom-0 left-0 right-0 z-[9998] bg-white/95 backdrop-blur-sm border-t border-gray-200"
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
                                <Icon
                                    className={`w-[24px] h-[24px] transition-colors duration-150 ${isActive ? 'text-gray-900' : 'text-gray-400'
                                        }`}
                                    strokeWidth={isActive ? 2.2 : 1.6}
                                />
                            </button>
                        );
                    })}
                </div>
                {/* Safe area spacer for iPhone home indicator */}
                <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </nav>

            {/* ── Desktop left sidebar (≥ md) ── */}
            <nav
                className="hidden md:flex fixed top-0 bottom-0 z-[9998] bg-white border-r border-gray-200/60 flex-col w-[220px] transition-all duration-200"
                style={{
                    right: isMapActive ? undefined : 'calc(50% + 300px)',
                    left: isMapActive ? '0' : undefined,
                }}
            >
                {/* Branding */}
                <div className="px-5 pt-5 pb-4">
                    <span className="text-xl font-bold text-gray-900 tracking-tight">
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
                                <Icon
                                    className="w-[24px] h-[24px] flex-shrink-0"
                                    strokeWidth={isActive ? 2.4 : 1.8}
                                />
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
