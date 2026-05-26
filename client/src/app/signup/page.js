'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/context/SocketContext';
import { Eye, EyeOff, AlertCircle, MessageSquare } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'https://chapp-oxa7.onrender.com';

export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connectSocket } = useSocket();

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

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed. Please try again.');

      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));
      connectSocket(data.token);
      router.push('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #e8f0fe 0%, #f0f2f5 50%, #e8f0fe 100%)' }}
    >
      <div className="auth-card w-full max-w-[400px] p-8 slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 shadow-md"
            style={{ background: 'linear-gradient(135deg, #1a73e8, #6c63ff)' }}
          >
<img src="/logo.png" alt="Chapp logo" className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[#202124] mb-0.5" style={{ fontFamily: 'var(--font-display)' }}>
            Chapp
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Create an account to get started
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm slide-up"
            style={{ background: '#fce8e6', color: '#c5221f', border: '1px solid #f28b82' }}>
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="label-text">Username</label>
            <input
              id="signup-username"
              type="text"
              placeholder="Pick a username (min 3 chars)"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="field-input"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="label-text">Password</label>
            <div className="relative">
              <input
                id="signup-password"
                type={showPass ? 'text' : 'password'}
                placeholder="Create a password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="field-input"
                style={{ paddingRight: '44px' }}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors"
                style={{ color: 'var(--text-subtle)' }}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="label-text">Confirm Password</label>
            <input
              id="signup-confirm"
              type={showPass ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="field-input"
              required
              autoComplete="new-password"
            />
          </div>

          <button
            id="signup-submit"
            type="submit"
            disabled={loading}
            className="btn-blue w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Creating account...
              </>
            ) : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold" style={{ color: 'var(--primary)' }}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
