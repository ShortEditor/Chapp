'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/context/SocketContext';
import { Eye, EyeOff, AlertCircle, MessageSquare } from 'lucide-react';

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


export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
    if (!username || !password || !email) return;
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (username.length < 3) { setError('Username must be at least 3 characters.'); return; }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email: email.trim() })
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
    <div className="auth-container">
      <div className="auth-card slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo.png" alt="Chapp Logo" className="h-16 md:h-20 object-contain mb-3" />
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

        <form onSubmit={handleSignup} className="auth-form">
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
            <label className="label-text">Email Address</label>
            <input
              id="signup-email"
              type="email"
              placeholder="Enter recovery email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="field-input"
              required
              autoComplete="email"
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
