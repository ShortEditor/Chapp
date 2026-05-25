'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '@/db/localDb';
import { triggerPwaInstallation } from '@/components/PwaManager';
import {
  Send,
  Paperclip,
  Smile,
  LogOut,
  UserPlus,
  Settings,
  MessageSquare,
  Users,
  BellRing,
  Clock,
  Check,
  CheckCheck,
  Image as ImageIcon,
  File as FileIcon,
  Video as VideoIcon,
  Download,
  Plus,
  X,
  Sparkles,
  Info,
  ArrowLeft,
  Database,
  Key,
  Lock,
  RefreshCw
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { encryptData, decryptData } from '@/lib/crypto';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export default function ChatPage() {
  const router = useRouter();
  const {
    socket,
    isConnected,
    typingFriends,
    onlineFriends,
    setOnlineFriends,
    connectSocket,
    disconnectSocket,
    sendMessage,
    emitTyping,
    setActiveChat
  } = useSocket();

  // Local React states
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'friends' | 'requests'
  const [activeFriend, setActiveFriend] = useState(null);
  const [inputText, setInputText] = useState('');
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [friendRequestMessage, setFriendRequestMessage] = useState({ text: '', type: '' });
  const [isPwaInstallable, setIsPwaInstallable] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sendError, setSendError] = useState('');
  
  // Profile settings editor modal state
  const [showSettings, setShowSettings] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [customStatus, setCustomStatus] = useState('');

  // Zero-Knowledge Backup states
  const [settingsTab, setSettingsTab] = useState('profile'); // 'profile' | 'backup'
  const [backupPassword, setBackupPassword] = useState('');
  const [backupStatusMessage, setBackupStatusMessage] = useState({ text: '', type: '' });
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState(null);

  // Media upload states
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null); // { url, type, name }

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // -------------------------------------------------------------
  // DEXIE REACTIVE QUERIES
  // -------------------------------------------------------------
  const dbChats = useLiveQuery(
    () => db.chats.orderBy('lastMessageTime').reverse().toArray()
  ) || [];

  const dbFriends = useLiveQuery(
    () => db.friends.toArray()
  ) || [];

  const messages = useLiveQuery(
    () => activeFriend ? db.messages.where('chatId').equals(activeFriend.id).sortBy('timestamp') : Promise.resolve([]),
    [activeFriend]
  ) || [];

  // -------------------------------------------------------------
  // INITIALIZATION & SYNC EFFECTS
  // -------------------------------------------------------------
  useEffect(() => {
    const token = localStorage.getItem('chapp_token');
    const userStr = localStorage.getItem('chapp_user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    const user = JSON.parse(userStr);
    setCurrentUser(user);
    setEditBio(user.bio || '');
    setEditAvatar(user.avatar || '');
    setCustomStatus(user.status || 'online');

    // 1. Establish WSS Connection
    connectSocket(token);

    // 2. Refresh lists from server API
    refreshFriendsAndRequests(token);

    // 3. Listen for PWA installation prompts
    const handlePwaInstallable = () => setIsPwaInstallable(true);
    const handlePwaInstalled = () => setIsPwaInstallable(false);

    window.addEventListener('pwa-installable', handlePwaInstallable);
    window.addEventListener('pwa-installed', handlePwaInstalled);

    if (window.deferredPrompt) {
      setIsPwaInstallable(true);
    }

    return () => {
      window.removeEventListener('pwa-installable', handlePwaInstallable);
      window.removeEventListener('pwa-installed', handlePwaInstalled);
    };
  }, [connectSocket, router]);

  // Sync online status map from local IndexedDB friends list
  useEffect(() => {
    if (dbFriends.length > 0) {
      const statusMap = new Map();
      dbFriends.forEach(f => {
        statusMap.set(f.id, f.status || 'offline');
      });
      setOnlineFriends(statusMap);
    }
  }, [dbFriends, setOnlineFriends]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingFriends]);

  // Handle setting active chat inside context for unread counter resets
  useEffect(() => {
    setActiveChat(activeFriend?.id || null);
  }, [activeFriend, setActiveChat]);

  // Fetch backup info when settings page is displayed
  useEffect(() => {
    if (showSettings) {
      fetchBackupInfo();
      setBackupStatusMessage({ text: '', type: '' });
      setBackupPassword('');
    }
  }, [showSettings]);

  // -------------------------------------------------------------
  // REST API HANDLERS
  // -------------------------------------------------------------
  const refreshFriendsAndRequests = async (token) => {
    const activeToken = token || localStorage.getItem('chapp_token');
    if (!activeToken) return;

    try {
      // Fetch friends list from backend
      const res = await fetch(`${BACKEND_URL}/api/friends`, {
        headers: { 'Authorization': `Bearer ${activeToken}` }
      });

      if (res.ok) {
        const data = await res.json();
        
        // Split accepted friends and pending requests
        const acceptedFriends = data.filter(item => item.status === 'ACCEPTED').map(item => item.friend);
        const reqs = data.filter(item => item.status === 'PENDING');

        // Write accepted friends to Dexie local DB
        await db.friends.clear();
        await db.friends.bulkPut(acceptedFriends);
        
        // Update requests list
        setPendingRequests(reqs);
      }
    } catch (err) {
      console.error('❌ Failed to fetch friends list:', err);
    }
  };

  const fetchBackupInfo = async () => {
    const token = localStorage.getItem('chapp_token');
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/backup`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.backupUpdatedAt) {
          setLastBackupTime(data.backupUpdatedAt);
        }
      }
    } catch (err) {
      console.error('Error fetching backup info:', err);
    }
  };

  const handleBackup = async (e) => {
    e.preventDefault();
    if (!backupPassword) {
      setBackupStatusMessage({ text: 'Please enter a backup password', type: 'error' });
      return;
    }

    setBackupLoading(true);
    setBackupStatusMessage({ text: 'Preparing local data...', type: 'info' });

    try {
      const chats = await db.chats.toArray();
      const messages = await db.messages.toArray();
      const friends = await db.friends.toArray();

      const payload = {
        chats,
        messages,
        friends,
        version: 1
      };

      setBackupStatusMessage({ text: 'Encrypting backup locally...', type: 'info' });
      const serialized = JSON.stringify(payload);
      
      const encryptedBlob = await encryptData(serialized, backupPassword);

      setBackupStatusMessage({ text: 'Uploading secure backup...', type: 'info' });
      
      const token = localStorage.getItem('chapp_token');
      const res = await fetch(`${BACKEND_URL}/api/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ encryptedBackup: encryptedBlob })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Server rejected the backup.');
      }

      const data = await res.json();
      setLastBackupTime(data.backupUpdatedAt);
      setBackupStatusMessage({ text: 'Backup successfully completed and synced!', type: 'success' });
      setBackupPassword('');
    } catch (err) {
      console.error(err);
      setBackupStatusMessage({ text: `Backup failed: ${err.message}`, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (e) => {
    e.preventDefault();
    if (!backupPassword) {
      setBackupStatusMessage({ text: 'Please enter your backup password', type: 'error' });
      return;
    }

    setBackupLoading(true);
    setBackupStatusMessage({ text: 'Fetching cloud backup...', type: 'info' });

    try {
      const token = localStorage.getItem('chapp_token');
      const res = await fetch(`${BACKEND_URL}/api/backup`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) {
        throw new Error('Failed to retrieve backup from server.');
      }

      const data = await res.json();
      if (!data.encryptedBackup) {
        throw new Error('No backup found for this account on the server.');
      }

      setBackupStatusMessage({ text: 'Decrypting backup data...', type: 'info' });

      const decrypted = await decryptData(data.encryptedBackup, backupPassword);
      const payload = JSON.parse(decrypted);

      setBackupStatusMessage({ text: 'Merging with local database...', type: 'info' });

      if (payload.friends && Array.isArray(payload.friends)) {
        await db.friends.bulkPut(payload.friends);
      }

      if (payload.chats && Array.isArray(payload.chats)) {
        await db.chats.bulkPut(payload.chats);
      }

      if (payload.messages && Array.isArray(payload.messages)) {
        await db.messages.bulkPut(payload.messages);
      }

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

      setBackupStatusMessage({ text: 'Restore completed successfully! Refreshing database...', type: 'success' });
      setBackupPassword('');
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      console.error(err);
      const errMsg = err.name === 'OperationError' 
        ? 'Decryption failed. Incorrect password.' 
        : err.message;
      setBackupStatusMessage({ text: `Restore failed: ${errMsg}`, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleAddFriend = async (e) => {
    e.preventDefault();
    if (!newFriendUsername.trim()) return;

    setFriendRequestMessage({ text: '', type: '' });
    const token = localStorage.getItem('chapp_token');

    try {
      const response = await fetch(`${BACKEND_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: newFriendUsername.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send request');
      }

      setFriendRequestMessage({ text: data.message || 'Request sent successfully!', type: 'success' });
      setNewFriendUsername('');
      refreshFriendsAndRequests(token);
    } catch (err) {
      setFriendRequestMessage({ text: err.message, type: 'error' });
    }
  };

  const handleRespondRequest = async (friendshipId, action) => {
    const token = localStorage.getItem('chapp_token');
    try {
      const response = await fetch(`${BACKEND_URL}/api/friends/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ friendshipId, action })
      });

      if (response.ok) {
        if (action === 'ACCEPT') {
          // Trigger delightful confetti celebration!
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.8 },
            colors: ['#06b6d4', '#6366f1', '#10b981']
          });
        }
        refreshFriendsAndRequests(token);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('chapp_token');
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ bio: editBio, avatar: editAvatar, status: customStatus })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data);
        localStorage.setItem('chapp_user', JSON.stringify(data));
        setShowSettings(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // -------------------------------------------------------------
  // MEDIA UPLOAD & ATTACHMENTS
  // -------------------------------------------------------------
  const triggerFileSelector = () => {
    fileInputRef.current.click();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const token = localStorage.getItem('chapp_token');
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${BACKEND_URL}/api/media/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setPendingMedia({
        url: data.url,
        type: data.mediaType,
        name: data.originalName
      });
    } catch (err) {
      console.error(err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  // -------------------------------------------------------------
  // MESSAGING CORE LOGIC
  // -------------------------------------------------------------
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputText.trim() && !pendingMedia) return;

    // Guard: socket must be connected
    if (!isConnected) {
      setSendError('Not connected to server. Please wait or refresh the page.');
      setTimeout(() => setSendError(''), 4000);
      return;
    }

    setSendError('');
    const result = await sendMessage(
      activeFriend.id,
      inputText.trim(),
      pendingMedia?.url || null,
      pendingMedia?.type || null
    );

    if (!result) {
      setSendError('Failed to send. Socket may have disconnected — retrying...');
      setTimeout(() => setSendError(''), 4000);
      return;
    }

    // Reset states
    setInputText('');
    setPendingMedia(null);
    emitTyping(activeFriend.id, false);
  };

  const handleInputKeyDown = (e) => {
    if (inputText.length === 0) {
      emitTyping(activeFriend.id, true);
    }

    // Debounced stop typing
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(activeFriend.id, false);
    }, 2000);
  };

  const handleLogout = () => {
    disconnectSocket();
    localStorage.removeItem('chapp_token');
    localStorage.removeItem('chapp_user');
    router.push('/login');
  };

  // Helper to format timestamps
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to download media file (converts to binary blob for security/PWA compatibility)
  const downloadFile = async (url, filename) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // If server file is deleted (auto-pruned), download fails. We notify the user
      alert('This temporary transfer link has expired (files are deleted after 24 hours).');
    }
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[#070709] relative z-10">
      {/* Ambient glowing background particles */}
      <div className="orb orb-cyan"></div>
      <div className="orb orb-indigo"></div>

      {/* -------------------------------------------------------------
         SIDEBAR (LEFT PANEL)
         ------------------------------------------------------------- */}
      <div className={`w-full md:w-[360px] h-full flex flex-col border-r border-white/5 glass-panel z-10 shrink-0 select-none ${activeFriend ? 'hidden md:flex' : 'flex'}`}>
        
        {/* User Card Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-sm text-cyan-400 border border-white/10 overflow-hidden uppercase">
                {currentUser?.avatar?.startsWith('http') ? (
                  <img src={currentUser.avatar} alt="Me" className="w-full h-full object-cover" />
                ) : (
                  currentUser?.username?.slice(0, 2)
                )}
              </div>
              <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#09090c] ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                {currentUser?.username}
              </h2>
              <p className="text-[10px] text-slate-400 max-w-[180px] truncate leading-tight">
                {currentUser?.bio || 'Hey there! I am using Chapp.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg border border-white/5 hover:border-cyan-500/20 hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-all duration-300"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-lg border border-white/5 hover:border-red-500/20 hover:bg-white/5 text-slate-400 hover:text-red-400 transition-all duration-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PWA Banner Install */}
        {isPwaInstallable && (
          <div className="m-3 p-3.5 rounded-2xl glass-card border border-cyan-500/20 pwa-pulse flex items-start gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-slate-200">Install Chapp App</h4>
              <p className="text-[10px] text-slate-400 mt-0.5 leading-normal">Install Chapp on your device for offline support and quick access.</p>
              <button
                onClick={triggerPwaInstallation}
                className="mt-2.5 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-[#070709] font-bold text-[10px] rounded-lg tracking-wider uppercase transition-all duration-300 active:scale-95 shadow-md shadow-cyan-500/25"
              >
                Install Now
              </button>
            </div>
          </div>
        )}

        {/* Tab Selectors */}
        <div className="px-4 pt-3 flex gap-2">
          <button
            onClick={() => setActiveTab('chats')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300 ${activeTab === 'chats' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chats
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300 ${activeTab === 'friends' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Friends
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 py-2 rounded-xl text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300 relative ${activeTab === 'requests' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}
          >
            <BellRing className="w-3.5 h-3.5" />
            Requests
            {pendingRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-cyan-500 text-[#09090c] font-black text-[9px] rounded-full flex items-center justify-center animate-bounce">
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          
          {/* CHATS TAB */}
          {activeTab === 'chats' && (
            <>
              {dbChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center h-[200px] text-slate-500">
                  <MessageSquare className="w-8 h-8 opacity-30 mb-2" />
                  <p className="text-xs">No conversations yet.</p>
                  <p className="text-[10px] opacity-70 mt-1 max-w-[200px]">Go to the Friends tab to start chatting privately.</p>
                </div>
              ) : (
                dbChats.map(chat => {
                  const friend = dbFriends.find(f => f.id === chat.friendId);
                  const isOnline = onlineFriends.get(chat.friendId) === 'online';
                  const isTyping = typingFriends.has(chat.friendId);

                  return (
                    <div
                      key={chat.friendId}
                      onClick={() => setActiveFriend(friend || { id: chat.friendId, username: 'Unknown Friend' })}
                      className={`flex items-center justify-between p-3 rounded-2xl cursor-pointer glass-card-hover ${activeFriend?.id === chat.friendId ? 'bg-white/5 border border-cyan-500/20' : 'bg-transparent'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-xs border border-white/10 uppercase text-slate-200 overflow-hidden shrink-0">
                            {friend?.avatar?.startsWith('http') ? (
                              <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
                            ) : (
                              friend?.username?.slice(0, 2)
                            )}
                          </div>
                          {isOnline && (
                            <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#09090c] bg-emerald-500"></div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-200 truncate uppercase tracking-wider">{friend?.username || 'Chapp User'}</h4>
                          <p className={`text-[10px] truncate leading-tight mt-0.5 ${isTyping ? 'text-cyan-400 font-medium' : 'text-slate-400'}`}>
                            {isTyping ? 'Typing...' : chat.lastMessageText}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0 select-none">
                        <span className="text-[9px] text-slate-500">{formatTime(chat.lastMessageTime)}</span>
                        {chat.unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500 text-[#09090c] font-black text-[9px]">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* FRIENDS TAB */}
          {activeTab === 'friends' && (
            <div className="space-y-3">
              {/* Add friend input */}
              <form onSubmit={handleAddFriend} className="px-1 flex gap-2">
                <input
                  type="text"
                  placeholder="Enter friend's username..."
                  value={newFriendUsername}
                  onChange={(e) => setNewFriendUsername(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs rounded-xl glass-input text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500"
                />
                <button
                  type="submit"
                  className="p-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#070709] transition-all shrink-0 active:scale-95 shadow-md shadow-cyan-500/25"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                </button>
              </form>

              {friendRequestMessage.text && (
                <div className={`px-2 py-1.5 rounded-lg text-[10px] ${friendRequestMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {friendRequestMessage.text}
                </div>
              )}

              <div className="space-y-1">
                {dbFriends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center h-[150px] text-slate-500">
                    <Users className="w-7 h-7 opacity-30 mb-1" />
                    <p className="text-[11px]">No friends yet.</p>
                    <p className="text-[9px] opacity-70 mt-0.5 max-w-[180px]">Add your friends by their username above to start chatting!</p>
                  </div>
                ) : (
                  dbFriends.map(friend => {
                    const isOnline = onlineFriends.get(friend.id) === 'online';

                    return (
                      <div
                        key={friend.id}
                        onClick={() => {
                          setActiveFriend(friend);
                          // Initialize chat entry locally in Dexie
                          db.chats.put({
                            friendId: friend.id,
                            lastMessageText: 'Say Hello!',
                            lastMessageTime: Date.now(),
                            unreadCount: 0
                          }).catch(() => {});
                          setActiveTab('chats');
                        }}
                        className="flex items-center justify-between p-3 rounded-2xl cursor-pointer bg-white/2 border border-white/2 hover:border-cyan-500/10 hover:bg-white/5 transition-all duration-300"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative">
                            <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-xs border border-white/10 uppercase text-slate-300 overflow-hidden shrink-0">
                              {friend.avatar?.startsWith('http') ? (
                                <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
                              ) : (
                                friend.username.slice(0, 2)
                              )}
                            </div>
                            {isOnline && (
                              <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-[#09090c] bg-emerald-500"></div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-slate-200 truncate uppercase tracking-wider">{friend.username}</h4>
                            <p className="text-[9px] text-slate-500 truncate leading-tight mt-0.5">{friend.bio || 'Hey there! I am using Chapp.'}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* REQUESTS TAB */}
          {activeTab === 'requests' && (
            <div className="space-y-2">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center h-[180px] text-slate-500">
                  <BellRing className="w-7 h-7 opacity-30 mb-1.5" />
                  <p className="text-xs">No pending requests.</p>
                </div>
              ) : (
                pendingRequests.map(req => {
                  const reqUser = req.friend;
                  return (
                    <div
                      key={req.id}
                      className="p-3 rounded-2xl bg-white/3 border border-white/5 space-y-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center font-semibold text-xs border border-white/5 uppercase text-slate-300 overflow-hidden shrink-0">
                          {reqUser.avatar?.startsWith('http') ? (
                            <img src={reqUser.avatar} alt={reqUser.username} className="w-full h-full object-cover" />
                          ) : (
                            reqUser.username.slice(0, 2)
                          )}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-slate-200 truncate uppercase tracking-wider">{reqUser.username}</h4>
                          <p className="text-[8px] text-slate-500 truncate">{req.isOutgoing ? 'Sent request (awaiting response)' : 'Received request'}</p>
                        </div>
                      </div>

                      {!req.isOutgoing && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRespondRequest(req.id, 'REJECT')}
                            className="flex-1 py-1.5 rounded-lg border border-white/5 hover:bg-white/5 text-[10px] font-bold text-slate-400 transition-all active:scale-95"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleRespondRequest(req.id, 'ACCEPT')}
                            className="flex-1 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-[10px] font-bold text-[#09090c] transition-all active:scale-95 shadow-md shadow-cyan-500/25"
                          >
                            Accept
                          </button>
                        </div>
                      )}
                      
                      {req.isOutgoing && (
                        <div className="w-full text-center py-1 rounded-lg border border-white/5 text-[9px] text-slate-500 bg-black/10 select-none">
                          Awaiting Accept...
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </div>

      {/* -------------------------------------------------------------
         CHAT PANEL (RIGHT PANEL)
         ------------------------------------------------------------- */}
      <div className={`flex-1 h-full flex flex-col bg-[#08080a]/30 backdrop-blur-3xl relative z-10 ${!activeFriend ? 'hidden md:flex' : 'flex'}`}>
        
        {activeFriend ? (
          <>
            {/* Active Chat Header */}
            <div className="h-16 border-b border-white/5 px-4 md:px-6 flex items-center justify-between select-none bg-black/10 z-10 shrink-0">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setActiveFriend(null)}
                  className="md:hidden p-2 -ml-1 rounded-xl border border-white/5 hover:border-cyan-500/20 hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-all duration-300 mr-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-sm border border-white/10 uppercase text-slate-200 overflow-hidden shrink-0">
                    {activeFriend.avatar?.startsWith('http') ? (
                      <img src={activeFriend.avatar} alt={activeFriend.username} className="w-full h-full object-cover" />
                    ) : (
                      activeFriend.username.slice(0, 2)
                    )}
                  </div>
                  {onlineFriends.get(activeFriend.id) === 'online' && (
                    <div className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#09090c] bg-emerald-500"></div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">{activeFriend.username}</h3>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1.5 leading-tight">
                    {typingFriends.has(activeFriend.id) ? (
                      <span className="text-cyan-400 font-semibold animate-pulse">typing...</span>
                    ) : (
                      <span>{onlineFriends.get(activeFriend.id) === 'online' ? 'active now' : 'offline'}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Message History Feed */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6 space-y-4">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-center select-none">
                  <Sparkles className="w-8 h-8 opacity-20 mb-2 animate-bounce" />
                  <p className="text-xs">No Messages Yet</p>
                  <p className="text-[10px] opacity-70 mt-1 max-w-[240px]">This is the start of your secure chat history. Type a message below to say hello!</p>
                </div>
              ) : (
                messages.map(msg => {
                  const isMe = msg.senderId === currentUser?.id;
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] md:max-w-[70%] animate-slide-up ${isMe ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                    >
                      {/* Message Bubble */}
                      <div
                        className={`px-4 py-3 rounded-2xl shadow-sm text-sm relative ${isMe ? 'bubble-sender rounded-tr-none' : 'bubble-receiver rounded-tl-none'}`}
                      >
                        {/* Text Payload */}
                        {msg.text && <p className="leading-relaxed break-words whitespace-pre-wrap">{msg.text}</p>}

                        {/* Media Attachment Previews */}
                        {msg.mediaUrl && (
                          <div className={`mt-2 overflow-hidden rounded-xl bg-black/20 ${msg.text ? 'pt-1' : ''}`}>
                            {msg.mediaType === 'image' && (
                              <div className="relative group max-w-full overflow-hidden">
                                <img
                                  src={msg.mediaUrl}
                                  alt="Attachment"
                                  className="max-h-[220px] rounded-lg border border-white/5 object-cover cursor-pointer hover:scale-[1.01] transition-transform"
                                  onClick={() => downloadFile(msg.mediaUrl, msg.id + '.jpg')}
                                />
                                <button
                                  onClick={() => downloadFile(msg.mediaUrl, msg.id + '.jpg')}
                                  className="absolute bottom-2 right-2 p-1.5 rounded-lg bg-black/70 border border-white/10 hover:border-cyan-500/50 hover:bg-cyan-500/10 text-slate-200 transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            {msg.mediaType === 'video' && (
                              <video
                                src={msg.mediaUrl}
                                controls
                                className="max-h-[240px] rounded-lg border border-white/5"
                              />
                            )}

                            {msg.mediaType !== 'image' && msg.mediaType !== 'video' && (
                              <div className="p-3 border border-white/5 rounded-lg flex items-center justify-between gap-4 bg-black/10">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="p-2 rounded bg-indigo-500/10 text-indigo-400">
                                    <FileIcon className="w-4 h-4" />
                                  </div>
                                  <span className="text-xs truncate font-medium max-w-[140px] text-slate-300">Document</span>
                                </div>
                                <button
                                  onClick={() => downloadFile(msg.mediaUrl, 'attachment')}
                                  className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition-all"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info Metadata */}
                      <div className="flex items-center gap-1.5 mt-1 select-none">
                        <span className="text-[9px] text-slate-500">{formatTime(msg.timestamp)}</span>
                        {isMe && (
                          <span className="shrink-0">
                            {msg.status === 'sending' && <Clock className="w-3 h-3 text-slate-600 animate-spin" />}
                            {msg.status === 'delivered' && <Check className="w-3.5 h-3.5 text-slate-500" />}
                            {msg.status === 'ack' && <CheckCheck className="w-3.5 h-3.5 text-cyan-400" />}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar Section */}
            <div className="p-3 md:p-4 border-t border-white/5 bg-black/5 shrink-0 z-10">

              {/* Connection status warning */}
              {!isConnected && (
                <div className="mb-3 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2 animate-pulse">
                  <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                  Connecting to server... Messages will send once connected.
                </div>
              )}

              {/* Send error message */}
              {sendError && (
                <div className="mb-3 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
                  {sendError}
                </div>
              )}
              
              {/* Preview Pending File Upload */}
              {pendingMedia && (
                <div className="mb-3 px-4 py-2.5 rounded-2xl glass-card border border-cyan-500/20 max-w-[280px] flex items-center justify-between gap-3 animate-slide-up">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded bg-cyan-500/10 text-cyan-400">
                      {pendingMedia.type === 'image' && <ImageIcon className="w-4 h-4" />}
                      {pendingMedia.type === 'video' && <VideoIcon className="w-4 h-4" />}
                      {pendingMedia.type !== 'image' && pendingMedia.type !== 'video' && <FileIcon className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-slate-200 truncate leading-tight">Attachment</h4>
                      <p className="text-[9px] text-slate-500 truncate leading-none mt-0.5">{pendingMedia.name}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setPendingMedia(null)}
                    className="p-1 rounded-full border border-white/5 hover:border-red-500/20 hover:bg-white/5 text-slate-400 hover:text-red-400 transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,application/*"
                />

                <button
                  type="button"
                  onClick={triggerFileSelector}
                  disabled={uploading}
                  className="p-3 rounded-xl border border-white/5 hover:border-cyan-500/20 hover:bg-white/5 text-slate-400 hover:text-cyan-400 transition-all duration-300 shrink-0 disabled:opacity-50"
                >
                  <Paperclip className="w-4.5 h-4.5" />
                </button>

                <div className="flex-1 relative flex items-center">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    className="w-full px-4 py-3 pr-10 rounded-xl text-sm glass-input text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500"
                  />
                  <button
                    type="button"
                    className="absolute right-3 text-slate-600 hover:text-slate-400 transition-all shrink-0 select-none"
                  >
                    <Smile className="w-4.5 h-4.5" />
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={(!inputText.trim() && !pendingMedia) || !isConnected}
                  className="p-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-[#070709] transition-all duration-300 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-cyan-500/25 active:scale-95"
                  title={!isConnected ? 'Connecting to server...' : 'Send message'}
                >
                  <Send className="w-4.5 h-4.5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Empty Chat Welcome Screen */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none relative overflow-hidden">
            <div className="orb orb-purple opacity-10"></div>
            
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-2xl shadow-cyan-500/20 border border-white/10 mb-6 relative animate-bounce">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold bg-gradient-to-r from-slate-100 to-slate-400 bg-clip-text text-transparent tracking-tight">Chapp Secure Chat</h2>
            <p className="text-xs text-slate-400 mt-2 max-w-[320px] leading-relaxed">
              "Your conversations belong to you."
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 bg-white/2 border border-white/5 p-5 rounded-2xl max-w-[380px] glass-card shadow-lg">
              <div className="flex gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 shrink-0">
                  <Info className="w-5 h-5" />
                </div>
                <div className="text-left min-w-0">
                  <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Private local storage</h4>
                  <p className="text-[10px] text-slate-400 leading-relaxed mt-1">
                    Your messages are stored only on your device. Our server relays your messages but never saves them permanently.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* -------------------------------------------------------------
         SETTINGS & PROFILE EDITOR MODAL
         ------------------------------------------------------------- */}
      {showSettings && (
        <div className="fixed inset-0 bg-[#000]/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-slide-up">
          <div className="w-full max-w-[400px] glass-panel rounded-3xl p-6 md:p-8 border border-white/10 relative z-50">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-slate-100 tracking-tight flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                Settings
              </h3>
              <button
                onClick={() => {
                  setShowSettings(false);
                  setSettingsTab('profile');
                }}
                className="p-1 rounded-full border border-white/5 hover:border-red-500/20 hover:bg-white/5 text-slate-400 hover:text-red-400 transition-all shrink-0"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Tab Selectors */}
            <div className="flex gap-2 mb-6 border-b border-white/5 pb-3">
              <button
                type="button"
                onClick={() => setSettingsTab('profile')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300 ${settingsTab === 'profile' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'border border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                Profile
              </button>
              <button
                type="button"
                onClick={() => setSettingsTab('backup')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wider flex items-center justify-center gap-1.5 transition-all duration-300 ${settingsTab === 'backup' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/15' : 'border border-transparent text-slate-400 hover:text-slate-200'}`}
              >
                <Database className="w-3.5 h-3.5" />
                Backup & Sync
              </button>
            </div>

            {/* PROFILE TAB */}
            {settingsTab === 'profile' && (
              <form onSubmit={handleUpdateProfile} className="space-y-4 animate-slide-up">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Avatar Image URL</label>
                  <input
                    type="text"
                    placeholder="Paste URL or preset id (e.g. avatar-3)..."
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl text-xs glass-input text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Biography / Tagline</label>
                  <textarea
                    placeholder="Tell your friends who you are..."
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl text-xs glass-input text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500 resize-none"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="flex-1 py-2.5 rounded-xl border border-white/5 hover:bg-white/5 text-xs font-bold text-slate-400 transition-all active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-xs font-bold text-[#09090c] transition-all active:scale-95 shadow-md shadow-cyan-500/25"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            )}

            {/* BACKUP & SYNC TAB */}
            {settingsTab === 'backup' && (
              <div className="space-y-4 animate-slide-up">
                <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 text-[10px] text-slate-400 leading-relaxed flex gap-2.5">
                  <Lock className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-slate-200">Zero-Knowledge Security: </span>
                    Your chat logs and contacts are encrypted on your device using a password you choose. The server only hosts the encrypted file and never sees your password or raw chats.
                  </div>
                </div>

                <div className="px-1 text-xs flex items-center justify-between text-slate-400">
                  <span>Cloud Backup Status:</span>
                  <span className="font-medium text-cyan-400">
                    {lastBackupTime ? new Date(lastBackupTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No backups found'}
                  </span>
                </div>

                {backupStatusMessage.text && (
                  <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    backupStatusMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                    backupStatusMessage.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  }`}>
                    {backupLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    <span>{backupStatusMessage.text}</span>
                  </div>
                )}

                <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 ml-1">Backup Passphrase</label>
                    <div className="relative flex items-center">
                      <input
                        type="password"
                        placeholder="Enter a secret password..."
                        value={backupPassword}
                        onChange={(e) => setBackupPassword(e.target.value)}
                        className="w-full px-4 py-2.5 pl-10 rounded-xl text-xs glass-input text-slate-100 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500"
                        disabled={backupLoading}
                      />
                      <Key className="absolute left-3 w-4 h-4 text-slate-600" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2.5 pt-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleBackup}
                        disabled={backupLoading}
                        className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 text-xs font-bold text-[#09090c] transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-cyan-500/25 flex items-center justify-center gap-1.5"
                      >
                        {backupLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                        Backup Chats
                      </button>
                      <button
                        type="button"
                        onClick={handleRestore}
                        disabled={backupLoading}
                        className="flex-1 py-2.5 rounded-xl border border-white/5 hover:bg-white/5 text-xs font-bold text-slate-300 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        {backupLoading && <RefreshCw className="w-3 h-3 animate-spin" />}
                        Restore Chats
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSettings(false);
                        setSettingsTab('profile');
                      }}
                      className="w-full py-2 rounded-xl border border-white/3 hover:bg-white/3 text-[10px] font-bold text-slate-500 transition-all"
                    >
                      Close Settings
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
