'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/lib/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  // Prevent body-level scroll on iOS Safari browser mode.
  // Fixed-position layout alone isn't enough; iOS Safari can still
  // allow overscroll/rubber-banding on the body element.
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
      {/* Subtle top gradient for visual gravity — purely decorative */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72 z-0"
        style={{
          background: 'linear-gradient(180deg, rgba(120, 90, 220, 0.045) 0%, rgba(120, 90, 220, 0.015) 40%, transparent 100%)',
        }}
        aria-hidden="true"
      />
      <div className="shrink-0 relative z-10">
        <Navbar />
      </div>
      {/* overflow-auto allows child pages (profile, etc.) to scroll.
          The home page uses its own overflow-hidden to lock scrolling. */}
      <main className="flex-1 min-h-0 overflow-auto relative z-10 px-5 pt-2 pb-[env(safe-area-inset-bottom)]">{children}</main>
    </div>
  );
}
