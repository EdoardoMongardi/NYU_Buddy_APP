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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-purple-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto" />
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-100">
      <Navbar />
      <NotificationPrompt />
      <InstallBanner />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}