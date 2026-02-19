'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { AnimatePresence } from 'framer-motion';

import { useAuth } from '@/lib/hooks/useAuth';
import { useMapStatus } from '@/lib/hooks/useMapStatus';
import { useWhiteThemeColor } from '@/lib/hooks/useWhiteThemeColor';
import BottomTabBar, { TabKey } from '@/components/layout/BottomTabBar';
import SetStatusSheet from '@/components/map/SetStatusSheet';
import StatusInfoCard from '@/components/map/StatusInfoCard';
import ManageActivityTab from '@/components/activity/ManageActivityTab';
import InstantMatchTab from '@/components/matching/InstantMatchTab';
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
  useWhiteThemeColor();

  // ── PWA standalone detection ──
  const [isPWA, setIsPWA] = useState(false);
  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsPWA(standalone);
  }, []);

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<TabKey>('home');

  // ── Map singleton state ──
  const isMapVisible = activeTab === 'map';
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

  // ── Handle tab changes ──
  const handleTabChange = (tab: TabKey) => {
    if (tab === 'settings') {
      router.push('/profile');
      return;
    }
    // If on a sub-page (post detail, match, profile, etc.), navigate back to root
    if (pathname !== '/') {
      router.push('/');
    }
    setActiveTab(tab);
  };

  // Sync: when navigating to /profile, highlight settings tab
  useEffect(() => {
    if (pathname === '/profile') {
      setActiveTab('settings');
    } else if (pathname === '/') {
      // Stay on whatever tab was last selected, don't force home
    }
  }, [pathname]);

  // Is user on a sub-page (post detail, match, feedback, etc.)?
  const isSubPage = pathname !== '/' && pathname !== '/onboarding';

  // Is user on the root page? (where we show tab content)
  const isRootPage = pathname === '/';

  if (loading || isChecking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto" />
          <p className="mt-2 text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col overflow-hidden"
      style={{ overscrollBehavior: 'none' }}
    >
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

        {/* Bottom status panel — positioned above the bottom tab bar */}
        <div
          className="fixed left-0 right-0 z-[9999] pointer-events-none"
          style={{ bottom: 'calc(52px + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="px-4 pb-2 md:pb-4 md:max-w-[600px] md:mx-auto">
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

      {/* ── Main content area ── */}
      <main
        style={{ display: isMapVisible ? 'none' : undefined }}
        className="flex-1 min-h-0 overflow-auto relative z-10 pb-[calc(48px+env(safe-area-inset-bottom,0px))] md:pb-0"
      >
        <div className="md:max-w-[600px] md:mx-auto md:border-x md:border-gray-100 md:min-h-full">
          {/* If on root page, render tab content */}
          {isRootPage && activeTab === 'home' && children}
          {isRootPage && activeTab === 'manage' && <ManageActivityTab />}
          {isRootPage && activeTab === 'search' && <InstantMatchTab isPWA={isPWA} />}

          {/* If on a sub-page, render the route children normally */}
          {isSubPage && children}
        </div>
      </main>

      {/* ── Tab Bar (always visible, except on onboarding) ── */}
      {pathname !== '/onboarding' && (
        <BottomTabBar
          activeTab={isSubPage && pathname !== '/profile' ? 'home' : activeTab}
          onTabChange={handleTabChange}
        />
      )}
    </div>
  );
}
