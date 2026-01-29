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
    <div className="flex bg-white rounded-xl shadow-sm p-1 mb-6">
      <button
        onClick={() => onTabChange('discover')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
          activeTab === 'discover'
            ? 'text-violet-700'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Search className="w-4 h-4" />
        <span>Discover</span>
        {activeTab === 'discover' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-violet-100 rounded-lg -z-10"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
      </button>

      <button
        onClick={() => onTabChange('invites')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-medium transition-colors ${
          activeTab === 'invites'
            ? 'text-violet-700'
            : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        <Inbox className="w-4 h-4" />
        <span>Invites</span>
        {inviteCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1">
            {inviteCount > 9 ? '9+' : inviteCount}
          </span>
        )}
        {activeTab === 'invites' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-violet-100 rounded-lg -z-10"
            transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
          />
        )}
      </button>
    </div>
  );
}
