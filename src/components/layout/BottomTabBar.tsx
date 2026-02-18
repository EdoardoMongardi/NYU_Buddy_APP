'use client';

import { Home, ClipboardList, Search, Map, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

export type TabKey = 'home' | 'manage' | 'search' | 'map' | 'settings';

interface Tab {
    key: TabKey;
    label: string;
    icon: React.ElementType;
}

const TABS: Tab[] = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'manage', label: 'Activity', icon: ClipboardList },
    { key: 'search', label: 'Search', icon: Search },
    { key: 'map', label: 'Map', icon: Map },
    { key: 'settings', label: 'Settings', icon: Settings },
];

interface BottomTabBarProps {
    activeTab: TabKey;
    onTabChange: (tab: TabKey) => void;
}

export default function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps) {
    return (
        <>
            {/* ── Mobile bottom tab bar (< md) ── */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-[9998] bg-white border-t border-gray-200/60"
                style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
                <div className="flex items-center justify-around h-[52px]">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full relative touch-scale"
                            >
                                <Icon
                                    className={`w-[22px] h-[22px] transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-gray-400'
                                        }`}
                                    strokeWidth={isActive ? 2.2 : 1.8}
                                />
                                <span
                                    className={`text-[10px] font-medium transition-colors duration-150 ${isActive ? 'text-violet-600' : 'text-gray-400'
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
            <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-[220px] z-[9998] bg-white border-r border-gray-200/60 flex-col">
                {/* Branding */}
                <div className="px-6 pt-6 pb-4">
                    <span className="text-xl font-bold text-gray-900 tracking-tight">
                        NYU Buddy
                    </span>
                </div>

                {/* Tabs */}
                <div className="flex-1 flex flex-col gap-1 px-3">
                    {TABS.map((tab) => {
                        const isActive = activeTab === tab.key;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => onTabChange(tab.key)}
                                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-[15px] font-medium transition-colors touch-scale ${isActive
                                        ? 'text-violet-600 bg-violet-50'
                                        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                    }`}
                            >
                                <Icon
                                    className="w-5 h-5"
                                    strokeWidth={isActive ? 2.2 : 1.8}
                                />
                                <span>{tab.label}</span>
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebarActive"
                                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-violet-600 rounded-r-full"
                                        transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
