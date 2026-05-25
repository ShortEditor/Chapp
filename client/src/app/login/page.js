'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/context/SocketContext';
import { Shield, Eye, EyeOff, Zap } from 'lucide-react';
import db from '@/db/localDb';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { connectSocket } = useSocket();

  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    if (token) router.push('/chat');
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;

    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Login failed. Check your credentials.');

      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));
      connectSocket(data.token);

      // Sync friends list
      const friendsRes = await fetch(`${BACKEND_URL}/api/friends`, {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
      if (friendsRes.ok) {
        const friendsList = await friendsRes.json();
        await db.friends.clear();
        await db.friends.bulkPut(friendsList.map(item => item.friend));
      }

      router.push('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden p-4">
      {/* Ambient Orbs */}
      <div className="orb orb-cyan" />
      <div className="orb orb-indigo" />
      <div className="orb orb-purple" />

      {/* Card */}
      <div className="w-full max-w-[420px] glass-panel rounded-[28px] p-8 relative z-10 animate-slide-up">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center mb-4 shadow-xl shadow-cyan-500/20 ring-1 ring-white/10">
            <Zap className="w-8 h-8 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-[28px] gradient-text" style={{ fontFamily: 'var(--font-jakarta)' }}>
            Welcome back
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--foreground-muted)' }}>
            Sign in to your Chapp account
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2.5 animate-fade-in">
            <Shield className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--foreground-muted)' }}>
              Username
            </label>
            <input
              id="login-username"
              type="text"
              placeholder="Your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 text-sm glass-input"
              required
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: 'var(--foreground-muted)' }}>
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={showPass ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-12 text-sm glass-input"
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: 'var(--foreground-subtle)' }}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            id="login-submit"
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-sm btn-primary mt-2"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--foreground-subtle)' }}>
          New to Chapp?{' '}
          <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-semibold transition-colors">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
