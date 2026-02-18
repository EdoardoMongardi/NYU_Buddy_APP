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

    return (
        <>
            {/* ── Mobile bottom tab bar (< md) ── */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-[9998] bg-white border-t border-gray-200/80"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="flex items-center justify-around h-[49px]">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className="flex flex-col items-center justify-center gap-[2px] flex-1 h-full relative"
                            >
                                <Icon
                                    className={`w-[22px] h-[22px] transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-gray-400'
                                        }`}
                                    strokeWidth={isActive ? 2.4 : 1.8}
                                />
                                <span
                                    className={`text-[10px] leading-tight font-medium transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-gray-400'
                                        }`}
                                >
                                    {tab.label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* ── Desktop left sidebar (≥ md) ── */}
            <nav className="hidden md:flex fixed top-0 bottom-0 z-[9998] bg-white border-r border-gray-200/60 flex-col w-[220px]"
                style={{ right: 'calc(50% + 300px)' }}
            >
                {/* Branding */}
                <div className="px-5 pt-6 pb-6">
                    <span className="text-xl font-bold text-gray-900 tracking-tight">
                        NYU Buddy
                    </span>
                </div>

                {/* Tab items */}
                <div className="flex-1 flex flex-col gap-1 px-3">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className={`relative flex items-center gap-3 px-4 py-3 rounded-full text-[15px] font-medium transition-colors ${isActive
                                    ? 'text-gray-900 font-bold'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    }`}
                            >
                                <Icon
                                    className="w-[22px] h-[22px]"
                                    strokeWidth={isActive ? 2.4 : 1.8}
                                />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}

                    {/* Post button (like X) */}
                    <button
                        onClick={() => router.push('/post/create')}
                        className="mt-4 mx-2 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-full text-[15px] font-bold transition-colors flex items-center justify-center gap-2"
                    >
                        Post
                    </button>
                </div>

                {/* User profile at bottom (like X) */}
                {userProfile && (
                    <div className="px-3 pb-5 pt-3">
                        <button
                            onClick={() => onTabChange('settings')}
                            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-full hover:bg-gray-100 transition-colors"
                        >
                            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                                <ProfileAvatar
                                    photoURL={userProfile.photoURL}
                                    displayName={userProfile.displayName}
                                    size="sm"
                                />
                            </div>
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
