'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { Sparkles } from 'lucide-react';

export default function EntryPage() {
  const router = useRouter();
  const { connectSocket } = useSocket();

  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    
    // Smooth transition redirect based on session presence
    const timer = setTimeout(() => {
      if (token) {
        // Connect socket & redirect to main dashboard
        connectSocket(token);
        router.push('/chat');
      } else {
        // Redirect to login onboarding screen
        router.push('/login');
      }
    }, 800); // 800ms sleek loading splash screen transition

    return () => clearTimeout(timer);
  }, [router, connectSocket]);

  return (
    <div className="relative min-h-screen bg-[#070709] flex flex-col items-center justify-center overflow-hidden">
      {/* Cinematic glowing background particles */}
      <div className="orb orb-cyan"></div>
      <div className="orb orb-indigo"></div>

      <div className="flex flex-col items-center animate-pulse relative z-10 select-none">
        <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-2xl shadow-cyan-500/20 border border-white/10 mb-6">
          <Sparkles className="w-8 h-8 text-white animate-spin" style={{ animationDuration: '4s' }} />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent uppercase">Chapp</h1>
        <p className="text-xs text-slate-500 mt-2.5 tracking-widest uppercase">Decentralizing conversations...</p>
      </div>
    </div>
  );
}
