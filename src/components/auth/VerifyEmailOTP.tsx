'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mail, ArrowLeft, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/lib/hooks/useAuth';

interface VerifyEmailOTPProps {
  email: string;
  onVerified: () => void;
  onBack: () => void;
}

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyEmailOTP({ email, onVerified, onBack }: VerifyEmailOTPProps) {
  const { sendVerificationCode, verifyCode } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const sendCode = useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      await sendVerificationCode();
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send code';
      setError(message);
    } finally {
      setSending(false);
    }
  }, [sendVerificationCode]);

  // Send code automatically on mount
  useEffect(() => {
    sendCode();
  }, [sendCode]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const char = value.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    setError(null);

    if (char && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    const next = [...digits];
    for (let i = 0; i < text.length; i++) {
      next[i] = text[i];
    }
    setDigits(next);
    const focusIdx = Math.min(text.length, CODE_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  };

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH;

  const handleVerify = async () => {
    if (!isComplete) return;
    setVerifying(true);
    setError(null);
    try {
      await verifyCode(code);
      onVerified();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setError(message);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  // Auto-submit when all digits entered
  useEffect(() => {
    if (isComplete && !verifying) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComplete]);

  const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
          <Mail className="w-7 h-7 text-violet-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Verify your email</h3>
          <p className="text-sm text-gray-500 mt-1">
            {codeSent
              ? <>We sent a 6-digit code to <span className="font-medium text-gray-700">{maskedEmail}</span></>
              : 'Sending verification code...'}
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-sm">{error}</AlertDescription>
        </Alert>
      )}

      {/* OTP Inputs */}
      <div className="flex justify-center gap-2.5" onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={d}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={verifying}
            className={`
              w-11 h-13 text-center text-xl font-bold rounded-xl border-2 outline-none
              transition-all duration-150
              ${d ? 'border-violet-400 bg-violet-50' : 'border-gray-200 bg-white'}
              focus:border-violet-500 focus:ring-2 focus:ring-violet-200
              disabled:opacity-50
            `}
          />
        ))}
      </div>

      {/* Submit */}
      <Button
        onClick={handleVerify}
        disabled={!isComplete || verifying}
        className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
      >
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
      </Button>

      {/* Resend + Back */}
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <button
          type="button"
          onClick={sendCode}
          disabled={cooldown > 0 || sending}
          className="flex items-center gap-1 text-violet-600 hover:text-violet-800 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${sending ? 'animate-spin' : ''}`} />
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
        </button>
      </div>

      {/* Hint */}
      <p className="text-xs text-center text-gray-400">
        Check your inbox and spam folder. Code expires in 10 minutes.
      </p>
    </motion.div>
  );
}
