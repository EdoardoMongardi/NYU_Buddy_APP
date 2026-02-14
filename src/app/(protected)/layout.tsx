'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { useAuth } from '@/lib/hooks/useAuth';
import Navbar from '@/components/layout/Navbar';
import NotificationPrompt from '@/components/notifications/NotificationPrompt';
import InstallBanner from '@/components/installation/InstallBanner';

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    // Not logged in -> redirect to login
    if (!user) {
      router.replace('/login');
      return;
    }

    // Email not verified -> stay on current page but show verification message
    // We allow navigation to see verification status

    // No profile document OR profile not completed -> redirect to onboarding (unless already there)
    if ((!userProfile || !userProfile.profileCompleted) && pathname !== '/onboarding') {
      router.replace('/onboarding');
      return;
    }

    // Profile completed but on onboarding page -> redirect to home
    if (userProfile?.profileCompleted && pathname === '/onboarding') {
      router.replace('/');
      return;
    }

    setIsChecking(false);
  }, [user, userProfile, loading, router, pathname]);

  if (loading || isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f2f7]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500 mx-auto" />
          <p className="mt-2 text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-[#f2f2f7] relative flex flex-col overflow-hidden">
      {/* Subtle top gradient for visual gravity — purely decorative */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{
          background: 'linear-gradient(180deg, rgba(120, 90, 220, 0.045) 0%, rgba(120, 90, 220, 0.015) 40%, transparent 100%)',
        }}
        aria-hidden="true"
      />
      <Navbar />
      <NotificationPrompt />
      <InstallBanner />
      <main className="container mx-auto px-5 pt-3 pb-[env(safe-area-inset-bottom)] relative flex-1 min-h-0 flex flex-col">{children}</main>
    </div>
  );
}