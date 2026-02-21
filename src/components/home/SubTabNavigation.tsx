'use client';

import { motion } from 'framer-motion';
import { Search, Inbox } from 'lucide-react';

interface SubTabNavigationProps {
  activeTab: 'discover' | 'invites';
  onTabChange: (tab: 'discover' | 'invites') => void;
  inviteCount: number;
}

export default function SubTabNavigation({
  activeTab,
  onTabChange,
  inviteCount,
}: SubTabNavigationProps) {
  return (
    <div className="flex bg-gray-100/60 rounded-xl p-0.5">
      <button
        onClick={() => onTabChange('discover')}
        className={`flex-1 relative flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors touch-scale ${
          activeTab === 'discover'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Search className="w-3.5 h-3.5" />
        <span>Discover</span>
        {activeTab === 'discover' && (
          <motion.div
            layoutId="activeSubTab"
            className="absolute inset-0 bg-white rounded-lg shadow-sm ring-1 ring-black/[0.04] -z-10"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
          />
        )}
      </button>

      <button
        onClick={() => onTabChange('invites')}
        className={`flex-1 relative flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-[13px] font-medium transition-colors touch-scale ${
          activeTab === 'invites'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Inbox className="w-3.5 h-3.5" />
        <span>Invites</span>
        {inviteCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-violet-500 text-white text-[10px] font-bold rounded-full px-0.5">
            {inviteCount > 9 ? '9+' : inviteCount}
          </span>
        )}
        {activeTab === 'invites' && (
          <motion.div
            layoutId="activeSubTab"
            className="absolute inset-0 bg-white rounded-lg shadow-sm ring-1 ring-black/[0.04] -z-10"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
          />
        )}
      </button>
    </div>
  );
}
