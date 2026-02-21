'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Settings, AlertCircle, MapPin } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/hooks/useAuth';

export default function Navbar() {
  const { user, sendVerificationEmail } = useAuth();
  const router = useRouter();
  const [verificationSent, setVerificationSent] = useState(false);

  const handleResendVerification = async () => {
    await sendVerificationEmail();
    setVerificationSent(true);
    setTimeout(() => setVerificationSent(false), 5000);
  };

  const showVerificationBanner = user && !user.emailVerified;

  return (
    <>
      <nav className="bg-white/80 backdrop-blur-xl border-b border-gray-200/40 sticky top-0 z-50">
        <div className="container mx-auto px-5">
          <div className="flex items-center justify-between h-14">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold text-gray-900 tracking-tight">
                NYU Buddy
              </span>
            </Link>

            <div className="flex items-center gap-1">
              {/* Map button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/map')}
                className="rounded-full hover:bg-gray-100 touch-scale h-10 w-10"
              >
                <MapPin className="w-5 h-5 text-gray-400" />
              </Button>

              {/* Settings button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/profile')}
                className="rounded-full hover:bg-gray-100 touch-scale h-10 w-10"
              >
                <Settings className="w-5 h-5 text-gray-400" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Email verification banner */}
      {showVerificationBanner && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
          <div className="container mx-auto">
            <Alert className="border-amber-200 bg-transparent">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="text-amber-800">
                  Please verify your email to access all features.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendVerification}
                  disabled={verificationSent}
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                >
                  {verificationSent ? 'Sent!' : 'Resend verification email'}
                </Button>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      )}
    </>
  );
}
