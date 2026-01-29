'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut, User, Menu, X, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/hooks/useAuth';

export default function Navbar() {
  const { user, userProfile, signOut, sendVerificationEmail } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleResendVerification = async () => {
    await sendVerificationEmail();
    setVerificationSent(true);
    setTimeout(() => setVerificationSent(false), 5000);
  };

  const showVerificationBanner = user && !user.emailVerified;

  return (
    <>
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
                NYU Buddy
              </span>
            </Link>

            {/* Desktop menu */}
            <div className="hidden md:flex items-center space-x-4">
              {userProfile && (
                <span className="text-sm text-gray-600">
                  Hi, {userProfile.displayName || user?.email}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-gray-600 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden border-t border-gray-200 bg-white"
          >
            <div className="container mx-auto px-4 py-4 space-y-4">
              {userProfile && (
                <div className="flex items-center space-x-2 text-gray-600">
                  <User className="h-4 w-4" />
                  <span>{userProfile.displayName || user?.email}</span>
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={handleSignOut}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </motion.div>
        )}
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