'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';

let BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://chapp-oxa7.onrender.com').replace(/^["']|["']$/g, '');
if (typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    if (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1')) {
      BACKEND_URL = 'https://chapp-oxa7.onrender.com';
    }
  } else {
    if (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1')) {
      const parts = BACKEND_URL.split(':');
      const port = parts[parts.length - 1] || '5000';
      BACKEND_URL = `${window.location.protocol}//${hostname}:${port}`;
    }
  }
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    if (token) router.push('/chat');

    const preventDefaultContextMenu = (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', preventDefaultContextMenu);
    return () => {
      window.removeEventListener('contextmenu', preventDefaultContextMenu);
    };
  }, [router]);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request code. Please try again.');

      setMessage(data.message || 'A 6-digit verification code has been sent to your email.');
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!otp || !newPassword || !confirmNewPassword) return;

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (otp.trim().length !== 6 || isNaN(otp.trim())) {
      setError("Please enter a valid 6-digit code.");
      return;
    }

    setError('');
    setMessage('');
    setLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password. Please try again.');

      setMessage('Your password has been reset successfully! Redirecting to login...');
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card slide-up">
        {/* Logo & Info */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Chapp Logo" className="h-16 md:h-20 object-contain mb-3" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '4px' }}>Reset Password</h2>
          <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
            {step === 1 ? 'Enter your recovery email to reset password' : `Code sent to ${email}`}
          </p>
        </div>

        {/* Success / Status Message */}
        {message && !error && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm slide-up"
            style={{ background: '#e6f4ea', color: '#137333', border: '1px solid #a8dab5' }}>
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm slide-up"
            style={{ background: '#fce8e6', color: '#c5221f', border: '1px solid #f28b82' }}>
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1 Form */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp} className="auth-form">
            <div>
              <label className="label-text">Recovery Email</label>
              <input
                id="reset-email"
                type="email"
                placeholder="Enter recovery email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="field-input"
                required
                autoComplete="email"
              />
            </div>

            <button
              id="reset-send-otp"
              type="submit"
              disabled={loading}
              className="btn-blue w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending Code...
                </>
              ) : 'Send Verification Code'}
            </button>
          </form>
        )}

        {/* Step 2 Form */}
        {step === 2 && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <button
              type="button"
              onClick={() => { setStep(1); setError(''); setMessage(''); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: '600',
                color: 'var(--primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                alignSelf: 'flex-start',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <ArrowLeft className="w-4 h-4" /> Change Email
            </button>

            <div>
              <label className="label-text">6-Digit Code</label>
              <input
                id="reset-otp"
                type="text"
                maxLength={6}
                placeholder="Enter 6-digit OTP code"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                className="field-input text-center font-mono tracking-widest text-lg"
                required
                autoComplete="off"
              />
            </div>

            <div>
              <label className="label-text">New Password</label>
              <div className="relative">
                <input
                  id="reset-new-password"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="field-input"
                  style={{ paddingRight: '44px' }}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                  style={{ color: 'var(--text-subtle)', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label-text">Confirm New Password</label>
              <input
                id="reset-confirm-password"
                type={showPass ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="field-input"
                required
                autoComplete="new-password"
              />
            </div>

            <button
              id="reset-submit"
              type="submit"
              disabled={loading}
              className="btn-blue w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Resetting Password...
                </>
              ) : 'Reset Password'}
            </button>
          </form>
        )}

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Remember your password?{' '}
          <Link href="/login" className="font-semibold" style={{ color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
