'use client';

import { motion } from 'framer-motion';
import { Search, Inbox } from 'lucide-react';

interface TabNavigationProps {
  activeTab: 'discover' | 'invites';
  onTabChange: (tab: 'discover' | 'invites') => void;
  inviteCount: number;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
  inviteCount,
}: TabNavigationProps) {
  return (
    <div className="flex bg-gray-200/50 rounded-2xl p-1 mb-6 shadow-track-inset">
      <button
        onClick={() => onTabChange('discover')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[14px] font-medium transition-colors touch-scale ${
          activeTab === 'discover'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Search className="w-4 h-4" />
        <span>Discover</span>
        {activeTab === 'discover' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-white rounded-xl shadow-elevated ring-1 ring-black/[0.04] -z-10"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
          />
        )}
      </button>

      <button
        onClick={() => onTabChange('invites')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[14px] font-medium transition-colors touch-scale ${
          activeTab === 'invites'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Inbox className="w-4 h-4" />
        <span>Invites</span>
        {inviteCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-violet-500 text-white text-[11px] font-bold rounded-full px-1">
            {inviteCount > 9 ? '9+' : inviteCount}
          </span>
        )}
        {activeTab === 'invites' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-white rounded-xl shadow-elevated ring-1 ring-black/[0.04] -z-10"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
          />
        )}
      </button>
    </div>
  );
}
