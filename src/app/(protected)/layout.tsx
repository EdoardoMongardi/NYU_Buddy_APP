'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';

import { useAuth } from '@/lib/hooks/useAuth';
import { useMapStatus } from '@/lib/hooks/useMapStatus';
import Navbar from '@/components/layout/Navbar';
import SetStatusSheet from '@/components/map/SetStatusSheet';
import StatusInfoCard from '@/components/map/StatusInfoCard';
import type { MapStatusNearby } from '@/lib/firebase/functions';

// Dynamic import — SSR-safe, only loads mapbox-gl on client
const MapboxMap = dynamic(() => import('@/components/map/MapboxMap'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 bg-gray-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  ),
});

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  // ── Map singleton state ──
  const isMapVisible = pathname === '/map';
  const [selectedStatus, setSelectedStatus] = useState<MapStatusNearby | null>(null);
  const {
    statuses,
    myStatus,
    setStatus,
    clearStatus,
    settingStatus,
    refresh,
    error: mapError,
  } = useMapStatus({ enabled: isMapVisible });

  // Clear selection when leaving the map
  useEffect(() => {
    if (!isMapVisible) {
      setSelectedStatus(null);
    }
  }, [isMapVisible]);

  // Prevent body-level scroll on iOS Safari browser mode.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    return () => {
      html.style.overflow = '';
      html.style.height = '';
      body.style.overflow = '';
      body.style.height = '';
    };
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    if ((!userProfile || !userProfile.profileCompleted) && pathname !== '/onboarding') {
      router.replace('/onboarding');
      return;
    }

    if (userProfile?.profileCompleted && pathname === '/onboarding') {
      router.replace('/');
      return;
    }

    setIsChecking(false);
  }, [user, userProfile, loading, router, pathname]);

  if (loading || isChecking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#f2f2f7]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto" />
          <p className="mt-2 text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-[#f2f2f7] flex flex-col overflow-hidden"
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Subtle top gradient — hidden when map is visible */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 z-0"
        style={{
          display: isMapVisible ? 'none' : undefined,
          background: 'linear-gradient(180deg, rgba(120, 90, 220, 0.045) 0%, rgba(120, 90, 220, 0.015) 40%, transparent 100%)',
        }}
        aria-hidden="true"
      />

      {/* Navbar — hidden when map is visible */}
      <div
        style={{ display: isMapVisible ? 'none' : undefined }}
        className="shrink-0 relative z-10"
      >
        <Navbar />
      </div>

      {/* ── Persistent Map Layer (always in DOM, CSS toggled) ── */}
      <div
        style={{ display: isMapVisible ? 'block' : 'none' }}
        className="fixed inset-0 z-50"
      >
        {mapError ? (
          <div className="fixed inset-0 flex items-center justify-center bg-gray-50">
            <div className="text-center p-6">
              <p className="text-red-600 text-sm font-medium">{mapError}</p>
              <button onClick={refresh} className="mt-3 text-violet-600 text-sm font-medium">
                Try again
              </button>
            </div>
          </div>
        ) : (
          <MapboxMap
            statuses={statuses}
            currentUid={user?.uid}
            selectedId={selectedStatus?.uid ?? null}
            onSelectStatus={setSelectedStatus}
            visible={isMapVisible}
          />
        )}

        {/* Info card */}
        <AnimatePresence>
          {selectedStatus && (
            <StatusInfoCard
              status={selectedStatus}
              currentUid={user?.uid}
              onClose={() => setSelectedStatus(null)}
            />
          )}
        </AnimatePresence>

        {/* Back button */}
        <button
          onClick={() => {
            setSelectedStatus(null);
            router.back();
          }}
          className="fixed left-4 z-[9999] p-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md hover:bg-white transition-colors"
          style={{ top: 'calc(env(safe-area-inset-top, 12px) + 56px)' }}
        >
          <ArrowLeft className="w-5 h-5 text-gray-700" />
        </button>

        {/* Bottom status panel */}
        <div className="fixed bottom-0 left-0 right-0 z-[9999] pointer-events-none">
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

      {/* ── Main content area (hidden when map is visible) ── */}
      <main
        style={{ display: isMapVisible ? 'none' : undefined }}
        className="flex-1 min-h-0 overflow-auto relative z-10 px-5 pt-2 pb-[env(safe-area-inset-bottom)]"
      >
        {children}
      </main>
    </div>
  );
}
