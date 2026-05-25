'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/context/SocketContext';
import { Shield, Sparkles } from 'lucide-react';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function SignupPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connectSocket } = useSocket();

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    if (token) {
      router.push('/chat');
    }
  }, [router]);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!username || !password) return;

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      // Save token & user in localStorage
      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));

      // Connect Socket.IO
      connectSocket(data.token);

      router.push('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4">
      {/* Background Orbs */}
      <div className="orb orb-cyan"></div>
      <div className="orb orb-indigo"></div>
      <div className="orb orb-purple"></div>

      {/* Main container */}
      <div className="w-full max-w-[440px] glass-panel rounded-3xl p-8 relative z-10 animate-slide-up">
        {/* Header Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 mb-4 ring-1 ring-white/10">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">Establish Identity</h1>
          <p className="text-sm text-slate-400 mt-2 text-center">Create a new local-first secure profile.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <Shield className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Username</label>
            <input
              type="text"
              placeholder="Min. 3 characters, lowercase"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm glass-input text-slate-100 placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm glass-input text-slate-100 placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Confirm Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl text-sm glass-input text-slate-100 placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-4"
          >
            {loading ? 'Generating keys...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 mt-6">
          Already have an identity?{' '}
          <Link href="/login" className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition-all">
            Access Account
          </Link>
        </p>
      </div>
    </div>
  );
}
