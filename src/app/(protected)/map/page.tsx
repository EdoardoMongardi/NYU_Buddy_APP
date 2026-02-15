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
    <div className="w-full h-[400px] bg-gray-100 rounded-2xl flex items-center justify-center">
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
    <div className="max-w-md mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 py-3">
        <button
          onClick={() => router.back()}
          className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Campus Map</h1>
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto p-2 rounded-full hover:bg-gray-100 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status bar */}
      <div className="mb-3">
        <SetStatusSheet
          myStatus={myStatus}
          onSet={setStatus}
          onClear={clearStatus}
          settingStatus={settingStatus}
        />
      </div>

      {/* Map */}
      {error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-6 text-center">
          <p className="text-red-700 text-sm">{error}</p>
          <button onClick={refresh} className="mt-2 text-red-600 text-sm font-medium">
            Try again
          </button>
        </div>
      ) : (
        <div className="h-[400px] rounded-2xl overflow-hidden border border-gray-200">
          <CampusMap statuses={statuses} currentUid={user?.uid} />
        </div>
      )}

      {/* Status count */}
      <p className="text-center text-[12px] text-gray-400 mt-3">
        {statuses.length} {statuses.length === 1 ? 'person' : 'people'} on the map
      </p>
    </div>
  );
}
