'use client';

import { motion } from 'framer-motion';
import { Zap, Users } from 'lucide-react';

interface TabNavigationProps {
  activeTab: 'activities' | 'instant-match';
  onTabChange: (tab: 'activities' | 'instant-match') => void;
  inviteCount?: number;
}

export default function TabNavigation({
  activeTab,
  onTabChange,
  inviteCount = 0,
}: TabNavigationProps) {
  return (
    <div className="flex bg-gray-200/50 rounded-2xl p-1 shadow-track-inset">
      <button
        onClick={() => onTabChange('activities')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[14px] font-medium transition-colors touch-scale ${
          activeTab === 'activities'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Users className="w-4 h-4" />
        <span>Activities</span>
        {activeTab === 'activities' && (
          <motion.div
            layoutId="activeTab"
            className="absolute inset-0 bg-white rounded-xl shadow-elevated ring-1 ring-black/[0.04] -z-10"
            transition={{ type: 'spring', bounce: 0.15, duration: 0.5 }}
          />
        )}
      </button>

      <button
        onClick={() => onTabChange('instant-match')}
        className={`flex-1 relative flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[14px] font-medium transition-colors touch-scale ${
          activeTab === 'instant-match'
            ? 'text-gray-900'
            : 'text-gray-400'
        }`}
      >
        <Zap className="w-4 h-4" />
        <span>Instant Match</span>
        {inviteCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center bg-violet-500 text-white text-[11px] font-bold rounded-full px-1">
            {inviteCount > 9 ? '9+' : inviteCount}
          </span>
        )}
        {activeTab === 'instant-match' && (
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
