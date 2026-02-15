'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react';
import { useMapStatus } from '@/lib/hooks/useMapStatus';
import { useAuth } from '@/lib/hooks/useAuth';
import dynamic from 'next/dynamic';
import SetStatusSheet from '@/components/map/SetStatusSheet';

// Dynamic import to avoid SSR with Leaflet
const CampusMap = dynamic(() => import('@/components/map/CampusMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  ),
});

export default function MapPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    statuses,
    loading,
    error,
    myStatus,
    setStatus,
    clearStatus,
    refresh,
    settingStatus,
  } = useMapStatus();

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Map fills entire screen — absolute positioning guarantees full coverage */}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
          <div className="text-center p-6">
            <p className="text-red-600 text-sm font-medium">{error}</p>
            <button onClick={refresh} className="mt-3 text-violet-600 text-sm font-medium">
              Try again
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0">
          <CampusMap statuses={statuses} currentUid={user?.uid} />
        </div>
      )}

      {/* Floating header bar */}
      <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="flex items-center gap-3 px-4 pt-[env(safe-area-inset-top,12px)] pb-2">
          <button
            onClick={() => router.back()}
            className="pointer-events-auto p-2 rounded-full bg-white/90 backdrop-blur shadow-sm hover:bg-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div className="pointer-events-auto bg-white/90 backdrop-blur rounded-full px-4 py-1.5 shadow-sm">
            <span className="text-sm font-semibold text-gray-900">Campus Map</span>
            <span className="ml-2 text-xs text-gray-400">
              {statuses.length} {statuses.length === 1 ? 'active' : 'active'}
            </span>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="pointer-events-auto ml-auto p-2 rounded-full bg-white/90 backdrop-blur shadow-sm hover:bg-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Floating bottom status panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="px-4 pb-[env(safe-area-inset-bottom,16px)]">
          <div className="pointer-events-auto bg-white/95 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-200/50 p-3">
            <SetStatusSheet
              myStatus={myStatus}
              onSet={setStatus}
              onClear={clearStatus}
              settingStatus={settingStatus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
