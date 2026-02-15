'use client';

import { useState } from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// NYU campus default location
const DEFAULT_LAT = 40.7295;
const DEFAULT_LNG = -73.9965;

const EMOJI_OPTIONS = [
  '📚', '☕', '🍕', '🎮', '🏋️', '🎵', '💻', '🎨',
  '🧑‍💻', '📖', '🍜', '🏀', '🎬', '🛒', '🧘', '💬',
];

interface SetStatusSheetProps {
  myStatus: string | null;
  onSet: (statusText: string, emoji: string, lat: number, lng: number) => Promise<void>;
  onClear: () => Promise<void>;
  settingStatus: boolean;
}

export default function SetStatusSheet({
  myStatus,
  onSet,
  onClear,
  settingStatus,
}: SetStatusSheetProps) {
  const { toast } = useToast();
  const [statusText, setStatusText] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState(EMOJI_OPTIONS[0]);
  const [expanded, setExpanded] = useState(false);

  const handleSet = async () => {
    if (!statusText.trim()) return;
    try {
      // Use device location if available, otherwise default to NYU campus
      let lat = DEFAULT_LAT;
      let lng = DEFAULT_LNG;

      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // Fallback to default
        }
      }

      await onSet(statusText.trim(), selectedEmoji, lat, lng);
      setStatusText('');
      setExpanded(false);
      toast({ title: 'Status set!', description: 'Others can see you on the map.' });
    } catch (err) {
      toast({
        title: 'Failed to set status',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleClear = async () => {
    try {
      await onClear();
      toast({ title: 'Status cleared' });
    } catch (err) {
      toast({
        title: 'Failed to clear status',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Already has a status — show it with a clear option
  if (myStatus && !expanded) {
    return (
      <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 flex items-center gap-3">
        <span className="text-lg flex-shrink-0">{selectedEmoji}</span>
        <p className="text-sm text-violet-700 flex-1 truncate">{myStatus}</p>
        <button
          onClick={handleClear}
          disabled={settingStatus}
          className="p-1.5 hover:bg-violet-100 rounded-full transition-colors"
        >
          {settingStatus ? (
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
          ) : (
            <X className="w-4 h-4 text-violet-400" />
          )}
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full py-3 rounded-2xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
      >
        <MapPin className="w-4 h-4" />
        Set Your Status
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">What are you up to?</p>
        <button
          onClick={() => setExpanded(false)}
          className="p-1 hover:bg-gray-100 rounded-full"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Emoji picker grid */}
      <div className="flex flex-wrap gap-1.5">
        {EMOJI_OPTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => setSelectedEmoji(emoji)}
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-xl transition-all ${
              selectedEmoji === emoji
                ? 'bg-violet-100 ring-2 ring-violet-400 scale-110'
                : 'hover:bg-gray-100'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Status text input */}
      <input
        value={statusText}
        onChange={(e) => setStatusText(e.target.value)}
        placeholder="e.g., Studying at Bobst"
        maxLength={30}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setExpanded(false)}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200"
        >
          Cancel
        </button>
        <button
          onClick={handleSet}
          disabled={!statusText.trim() || settingStatus}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {settingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              <span className="text-base">{selectedEmoji}</span>
              Go Live
            </>
          )}
        </button>
      </div>
    </div>
  );
}
