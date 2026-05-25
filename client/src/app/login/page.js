'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSocket } from '@/context/SocketContext';
import { isFirebaseConfigured, auth, googleProvider } from '@/lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { Shield, Sparkles } from 'lucide-react';
import db from '@/db/localDb';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoGoogleActive, setDemoGoogleActive] = useState(false);
  const router = useRouter();
  const { connectSocket } = useSocket();

  // Redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    if (token) {
      router.push('/chat');
    }
  }, [router]);

  // Handle standard Username/Password login
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

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Save token & user in localStorage
      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));

      // Connect Socket.IO
      connectSocket(data.token);

      // Fetch and Sync Friends list to local IndexedDB
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

  // Handle Firebase Google Auth popup (with local mock fallbacks)
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);

    // If Firebase is not configured, run in Developer mock/demo mode!
    if (!isFirebaseConfigured) {
      console.log('🛡️ [Firebase] Bypassing Google login - triggering Developer Mode demo token.');
      setDemoGoogleActive(true);
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken();

      // Send Firebase idToken to backend
      const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authentication with server failed');
      }

      // Save credentials & sync
      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));

      connectSocket(data.token);

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
      console.error(err);
      setError(err.message || 'Google Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Mock Developer Login execution
  const executeDemoLogin = async (demoUsername) => {
    try {
      // Create a mock token for local testing
      // Our backend verifyFirebaseIdToken implements a Dev Mode fallback where it decodes raw JWT claims 
      // without strict Google signature verification if REDIS/Firebase details are not present.
      // We will generate a base64 encoded JWT structure!
      const mockPayload = {
        user_id: `google-uid-demo-${Math.floor(Math.random() * 1000)}`,
        email: `${demoUsername.toLowerCase()}@chapp.demo`,
        name: demoUsername,
        picture: `avatar-${Math.floor(Math.random() * 10) + 1}`
      };

      // Simple unverified JWT simulation
      const mockTokenHeader = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const mockTokenPayload = btoa(JSON.stringify(mockPayload));
      const mockToken = `${mockTokenHeader}.${mockTokenPayload}.mockSignature`;

      const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: mockToken, username: demoUsername.toLowerCase() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Demo login failed');
      }

      localStorage.setItem('chapp_token', data.token);
      localStorage.setItem('chapp_user', JSON.stringify(data.user));

      connectSocket(data.token);
      router.push('/chat');
    } catch (err) {
      setError(err.message);
    } finally {
      setDemoGoogleActive(false);
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
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent">Chapp</h1>
          <p className="text-sm text-slate-400 mt-2 text-center">Your conversations belong to you.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <Shield className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Regular Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Username</label>
            <input
              type="text"
              placeholder="e.g. neochat"
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 transition-all duration-300 transform active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5"></div>
          </div>
          <span className="relative px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-[#08080a]">or</span>
        </div>

        {/* Google Authentication Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 rounded-xl text-sm font-medium glass-card border border-white/5 hover:border-cyan-500/30 hover:bg-white/5 text-slate-200 transition-all duration-300 flex items-center justify-center gap-2.5 active:scale-[0.98]"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="text-center text-xs text-slate-500 mt-6">
          Don't have an account?{' '}
          <Link href="/signup" className="text-cyan-400 hover:text-cyan-300 font-medium hover:underline transition-all">
            Sign Up
          </Link>
        </p>
      </div>

      {/* Cinematic Google Demo Dialog (if Firebase not configured) */}
      {demoGoogleActive && (
        <div className="fixed inset-0 bg-[#000]/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-slide-up">
          <div className="w-full max-w-[360px] glass-panel rounded-2xl p-6 border border-cyan-500/20">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
              Demo Mode Login
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Google Sign-In is not configured yet. To test the application, simply enter any nickname below to log in as a guest!
            </p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Choose a nickname (e.g. Alice)"
                className="w-full px-4 py-2.5 rounded-xl text-xs glass-input text-slate-100"
                id="demo-user-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    executeDemoLogin(e.target.value);
                  }
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setDemoGoogleActive(false)}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg border border-white/5 hover:bg-white/5 text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const val = document.getElementById('demo-user-input')?.value;
                    if (val) executeDemoLogin(val);
                  }}
                  className="flex-1 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-[#070709] font-bold shadow-md shadow-cyan-500/10"
                >
                  Log In
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
