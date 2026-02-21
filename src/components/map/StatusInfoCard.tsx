'use client';

import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { MapStatusNearby } from '@/lib/firebase/functions';

interface StatusInfoCardProps {
  status: MapStatusNearby;
  currentUid?: string;
  onClose: () => void;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function StatusInfoCard({
  status,
  currentUid,
  onClose,
}: StatusInfoCardProps) {
  const isOwn = status.uid === currentUid;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed left-4 right-4 z-[9998]"
      style={{ top: 'max(env(safe-area-inset-top, 12px), 12px)' }}
    >
      <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 p-3.5 flex items-center gap-3">
        {/* Emoji sticker */}
        <div className="flex-shrink-0 w-11 h-11 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
          <span className="text-2xl leading-none">{status.emoji || '📍'}</span>
        </div>

        {/* Text content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {status.statusText}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {status.createdAt && (
              <span className="text-xs text-gray-400">
                {timeAgo(status.createdAt)}
              </span>
            )}
            {isOwn && (
              <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                You
              </span>
            )}
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    </motion.div>
  );
}
