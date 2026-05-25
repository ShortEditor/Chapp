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

  // Avatar helper
  const avatarColors = ['#4a90d9','#e67e22','#27ae60','#9b59b6','#e74c3c','#1abc9c','#f39c12','#2980b9'];
  const getAvatarColor = (name) => avatarColors[(name?.charCodeAt(0) || 0) % avatarColors.length];

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ═══════════════════════════════════════
          SIDEBAR
          ═══════════════════════════════════════ */}
      <div className={`w-full md:w-[340px] h-full flex flex-col sidebar shrink-0 ${activeFriend ? 'hidden md:flex' : 'flex'}`}>

        {/* Sidebar Top Header */}
        <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="avatar w-9 h-9 text-xs shrink-0 relative"
              style={{ background: getAvatarColor(currentUser?.username) }}
            >
              {currentUser?.avatar?.startsWith('http')
                ? <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
                : currentUser?.username?.slice(0, 2)}
              <span
                className="status-dot"
                style={{ background: isConnected ? 'var(--online)' : '#f59e0b', borderColor: 'var(--surface)' }}
              />
            </div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-jakarta)', color: 'var(--text)' }}>
              Chapp
            </h1>
          </div>
          <div className="flex items-center">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-full transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              title="Settings"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-full transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fce8e6'; e.currentTarget.style.color = '#c5221f'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PWA Banner */}
        {isPwaInstallable && (
          <div className="pwa-banner">
            <div className="p-1.5 rounded-lg shrink-0" style={{ background: 'var(--primary-container)', color: 'var(--primary)' }}>
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Install Chapp App</p>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Get offline support and quick access.</p>
              <button
                onClick={triggerPwaInstallation}
                className="mt-2 px-3 py-1 rounded-full text-[10px] font-bold text-white transition-colors"
                style={{ background: 'var(--primary)' }}
              >
                Install
              </button>
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── CHATS TAB ── */}
          {activeTab === 'chats' && (
            dbChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
                <MessageSquare className="w-10 h-10 mb-3" style={{ color: 'var(--text-subtle)' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>No conversations yet</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Add friends to start chatting</p>
              </div>
            ) : (
              dbChats.map(chat => {
                const friend = dbFriends.find(f => f.id === chat.friendId);
                const isOnline = onlineFriends.get(chat.friendId) === 'online';
                const isTyping = typingFriends.has(chat.friendId);
                const isActive = activeFriend?.id === chat.friendId;
                return (
                  <div
                    key={chat.friendId}
                    onClick={() => setActiveFriend(friend || { id: chat.friendId, username: 'Unknown' })}
                    className={`conv-item ${isActive ? 'active' : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div
                        className="avatar w-12 h-12 text-sm"
                        style={{ background: getAvatarColor(friend?.username) }}
                      >
                        {friend?.avatar?.startsWith('http')
                          ? <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
                          : friend?.username?.slice(0, 2)}
                      </div>
                      {isOnline && (
                        <span className="status-dot status-online" style={{ borderColor: isActive ? 'var(--primary-light)' : 'var(--surface)' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                          {friend?.username || 'Chapp User'}
                        </span>
                        <span className="text-[10px] shrink-0 ml-2" style={{ color: 'var(--text-subtle)' }}>
                          {formatTime(chat.lastMessageTime)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs truncate" style={{ color: isTyping ? 'var(--primary)' : 'var(--text-muted)' }}>
                          {isTyping ? 'typing...' : chat.lastMessageText}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span
                            className="ml-2 shrink-0 w-5 h-5 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                            style={{ background: 'var(--primary)' }}
                          >
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )
          )}

          {/* ── FRIENDS TAB ── */}
          {activeTab === 'friends' && (
            <div className="p-3 space-y-3">
              <form onSubmit={handleAddFriend} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search by username..."
                  value={newFriendUsername}
                  onChange={e => setNewFriendUsername(e.target.value)}
                  className="msg-field flex-1"
                  style={{ borderRadius: '10px', padding: '9px 14px', fontSize: '13px' }}
                />
                <button
                  type="submit"
                  className="p-2.5 rounded-xl text-white shrink-0 flex items-center justify-center transition-opacity"
                  style={{ background: 'var(--primary)' }}
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </form>

              {friendRequestMessage.text && (
                <div
                  className="px-3 py-2 rounded-xl text-xs"
                  style={{
                    background: friendRequestMessage.type === 'success' ? '#e6f4ea' : '#fce8e6',
                    color: friendRequestMessage.type === 'success' ? '#137333' : '#c5221f',
                    border: `1px solid ${friendRequestMessage.type === 'success' ? '#ceead6' : '#f28b82'}`
                  }}
                >
                  {friendRequestMessage.text}
                </div>
              )}

              {dbFriends.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 text-center">
                  <Users className="w-8 h-8 mb-2" style={{ color: 'var(--text-subtle)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>No friends yet</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Search a username above to add</p>
                </div>
              ) : (
                dbFriends.map(friend => {
                  const isOnline = onlineFriends.get(friend.id) === 'online';
                  return (
                    <div
                      key={friend.id}
                      onClick={() => {
                        setActiveFriend(friend);
                        db.chats.put({ friendId: friend.id, lastMessageText: '', lastMessageTime: Date.now(), unreadCount: 0 }).catch(() => {});
                        setActiveTab('chats');
                      }}
                      className="conv-item"
                      style={{ borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border-light)' }}
                    >
                      <div className="relative shrink-0">
                        <div className="avatar w-10 h-10 text-xs" style={{ background: getAvatarColor(friend.username) }}>
                          {friend.avatar?.startsWith('http')
                            ? <img src={friend.avatar} alt={friend.username} className="w-full h-full object-cover" />
                            : friend.username.slice(0, 2)}
                        </div>
                        {isOnline && <span className="status-dot status-online" style={{ borderColor: 'var(--surface-2)' }} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>{friend.username}</p>
                        <p className="text-xs truncate" style={{ color: isOnline ? 'var(--online)' : 'var(--text-subtle)' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── REQUESTS TAB ── */}
          {activeTab === 'requests' && (
            <div className="p-3 space-y-2">
              {pendingRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <BellRing className="w-8 h-8 mb-2" style={{ color: 'var(--text-subtle)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>No pending requests</p>
                </div>
              ) : (
                pendingRequests.map(req => {
                  const u = req.friend;
                  return (
                    <div key={req.id} className="p-3 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className="avatar w-10 h-10 text-xs shrink-0" style={{ background: getAvatarColor(u.username) }}>
                          {u.avatar?.startsWith('http')
                            ? <img src={u.avatar} alt={u.username} className="w-full h-full object-cover" />
                            : u.username.slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>{u.username}</p>
                          <p className="text-xs" style={{ color: 'var(--text-subtle)' }}>
                            {req.isOutgoing ? 'Request sent' : 'Wants to connect'}
                          </p>
                        </div>
                      </div>
                      {!req.isOutgoing && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRespondRequest(req.id, 'REJECT')}
                            className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => handleRespondRequest(req.id, 'ACCEPT')}
                            className="flex-1 py-2 rounded-xl text-xs font-bold text-white transition-opacity"
                            style={{ background: 'var(--primary)' }}
                          >
                            Accept
                          </button>
                        </div>
                      )}
                      {req.isOutgoing && (
                        <p className="text-center text-xs py-1 rounded-lg" style={{ color: 'var(--text-subtle)', background: 'var(--border-light)' }}>
                          Awaiting response...
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Bottom Navigation */}
        <div className="bottom-nav">
          <button onClick={() => setActiveTab('chats')} className={`bottom-nav-item ${activeTab === 'chats' ? 'active' : ''}`}>
            <MessageSquare className="w-5 h-5" />
            Chats
          </button>
          <button onClick={() => setActiveTab('friends')} className={`bottom-nav-item ${activeTab === 'friends' ? 'active' : ''}`}>
            <Users className="w-5 h-5" />
            Friends
          </button>
          <button onClick={() => setActiveTab('requests')} className={`bottom-nav-item ${activeTab === 'requests' ? 'active' : ''}`} style={{ position: 'relative' }}>
            <BellRing className="w-5 h-5" />
            Requests
            {pendingRequests.length > 0 && (
              <span
                className="absolute -top-1 right-2 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                style={{ background: 'var(--primary)' }}
              >
                {pendingRequests.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          CHAT PANEL
          ═══════════════════════════════════════ */}
      <div
        className={`flex-1 h-full flex flex-col ${!activeFriend ? 'hidden md:flex' : 'flex'}`}
        style={{ background: 'var(--chat-bg)' }}
      >
        {activeFriend ? (
          <>
            {/* Chat Header */}
            <div
              className="h-16 flex items-center gap-3 px-4 shrink-0"
              style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
            >
              <button
                onClick={() => setActiveFriend(null)}
                className="md:hidden p-2 rounded-full transition-colors mr-1"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="relative shrink-0">
                <div className="avatar w-10 h-10 text-sm" style={{ background: getAvatarColor(activeFriend.username) }}>
                  {activeFriend.avatar?.startsWith('http')
                    ? <img src={activeFriend.avatar} alt={activeFriend.username} className="w-full h-full object-cover" />
                    : activeFriend.username.slice(0, 2)}
                </div>
                {onlineFriends.get(activeFriend.id) === 'online' && (
                  <span className="status-dot status-online" style={{ borderColor: 'var(--surface)' }} />
                )}
              </div>

              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                  {activeFriend.username}
                </h3>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {typingFriends.has(activeFriend.id) ? (
                    <span className="flex items-center gap-1" style={{ color: 'var(--primary)' }}>
                      <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                      <span className="ml-1">typing</span>
                    </span>
                  ) : (
                    onlineFriends.get(activeFriend.id) === 'online' ? 'Online' : 'Offline'
                  )}
                </p>
              </div>
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto px-3 py-3" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center select-none">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
                    style={{ background: 'var(--primary-light)' }}
                  >
                    <MessageSquare className="w-7 h-7" style={{ color: 'var(--primary)' }} />
                  </div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                    Start the conversation
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    Say hi to {activeFriend.username}! 👋
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUser?.id;
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const isSameGroup = prevMsg && prevMsg.senderId === msg.senderId;
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                      style={{ marginTop: isSameGroup ? '2px' : '8px' }}
                    >
                      <div style={{ maxWidth: '72%' }}>
                        {/* Bubble with timestamp INSIDE — WhatsApp style */}
                        <div
                          className={`px-3 py-2 text-sm ${isMe ? 'bubble-out' : 'bubble-in'}`}
                          style={{ wordBreak: 'break-word' }}
                        >
                          {/* Text + inline timestamp footer */}
                          {msg.text && (
                            <p className="leading-snug break-words whitespace-pre-wrap" style={{ display: 'inline' }}>
                              {msg.text}
                              {/* Spacer so timestamp doesn't overlap text */}
                              <span style={{ display: 'inline-block', width: isMe ? '64px' : '36px' }} />
                            </p>
                          )}

                          {/* Media */}
                          {msg.mediaUrl && (
                            <div className={`overflow-hidden rounded-xl ${msg.text ? 'mt-2' : ''}`}>
                              {msg.mediaType === 'image' && (
                                <div className="relative group">
                                  <img
                                    src={msg.mediaUrl}
                                    alt="Attachment"
                                    className="max-h-[220px] rounded-xl cursor-pointer object-cover w-full"
                                    onClick={() => downloadFile(msg.mediaUrl, msg.id + '.jpg')}
                                  />
                                  <button
                                    onClick={() => downloadFile(msg.mediaUrl, msg.id + '.jpg')}
                                    className="absolute bottom-2 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    style={{ background: 'rgba(0,0,0,0.6)' }}
                                  >
                                    <Download className="w-3.5 h-3.5 text-white" />
                                  </button>
                                </div>
                              )}
                              {msg.mediaType === 'video' && (
                                <video src={msg.mediaUrl} controls className="max-h-[240px] rounded-xl w-full" />
                              )}
                              {msg.mediaType !== 'image' && msg.mediaType !== 'video' && (
                                <div
                                  className="flex items-center justify-between gap-4 p-3 rounded-xl mt-1"
                                  style={{ background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--border-light)' }}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <FileIcon className="w-4 h-4 shrink-0" />
                                    <span className="text-xs truncate font-medium max-w-[140px]">Document</span>
                                  </div>
                                  <button onClick={() => downloadFile(msg.mediaUrl, 'attachment')} className="shrink-0">
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Inline timestamp row at bottom of bubble */}
                          <div
                            className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-end'}`}
                            style={{ marginTop: msg.text && !msg.mediaUrl ? '-14px' : '4px', float: 'right', marginLeft: '8px' }}
                          >
                            <span
                              className="text-[10px] leading-none"
                              style={{ color: isMe ? 'rgba(255,255,255,0.72)' : 'var(--text-subtle)', whiteSpace: 'nowrap' }}
                            >
                              {formatTime(msg.timestamp)}
                            </span>
                            {isMe && (
                              <span className="flex items-center">
                                {msg.status === 'sending'   && <Clock className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.6)' }} />}
                                {msg.status === 'delivered' && <Check className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.72)' }} />}
                                {msg.status === 'ack'       && <CheckCheck className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.9)' }} />}
                              </span>
                            )}
                          </div>
                          <div style={{ clear: 'both' }} />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="msg-input px-3 py-3 shrink-0">
              {/* Connection warning */}
              {!isConnected && (
                <div
                  className="mb-2 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
                  style={{ background: '#fef7e0', color: '#e37400', border: '1px solid #fde293' }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#e37400' }} />
                  Connecting... messages will send once connected.
                </div>
              )}

              {/* Send error */}
              {sendError && (
                <div
                  className="mb-2 px-3 py-2 rounded-xl text-xs flex items-center gap-2"
                  style={{ background: '#fce8e6', color: '#c5221f', border: '1px solid #f28b82' }}
                >
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#c5221f' }} />
                  {sendError}
                </div>
              )}

              {/* Pending media preview */}
              {pendingMedia && (
                <div
                  className="mb-2 px-3 py-2 rounded-xl flex items-center justify-between gap-3"
                  style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-container)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {pendingMedia.type === 'image' && <ImageIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />}
                    {pendingMedia.type === 'video' && <VideoIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />}
                    {pendingMedia.type !== 'image' && pendingMedia.type !== 'video' && <FileIcon className="w-4 h-4 shrink-0" style={{ color: 'var(--primary)' }} />}
                    <span className="text-xs truncate font-medium" style={{ color: 'var(--primary)' }}>{pendingMedia.name}</span>
                  </div>
                  <button onClick={() => setPendingMedia(null)}>
                    <X className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,application/*" />

                <button
                  type="button"
                  onClick={triggerFileSelector}
                  disabled={uploading}
                  className="p-2.5 rounded-full transition-colors shrink-0"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <input
                  type="text"
                  placeholder="Type a message..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  className="msg-field"
                />

                <button
                  type="submit"
                  disabled={(!inputText.trim() && !pendingMedia) || !isConnected}
                  className="p-2.5 rounded-full text-white shrink-0 flex items-center justify-center transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--primary)' }}
                >
                  <Send className="w-5 h-5" />
                </button>
              </form>
            </div>
          </>
        ) : (
          /* Welcome / Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'var(--primary-light)' }}
            >
              <MessageSquare className="w-10 h-10" style={{ color: 'var(--primary)' }} />
            </div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
              Your Messages
            </h2>
            <p className="text-sm mt-2 max-w-xs" style={{ color: 'var(--text-muted)' }}>
              Select a conversation or add a new friend to start chatting privately.
            </p>
            <div className="mt-8 grid gap-3 max-w-sm w-full">
              <div className="flex gap-3 items-start p-4 rounded-2xl text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="p-2 rounded-xl shrink-0" style={{ background: 'var(--primary-light)' }}>
                  <Lock className="w-4 h-4" style={{ color: 'var(--primary)' }} />
                </div>
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>Private by design</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Messages are stored on your device and deleted from our servers instantly after delivery.</p>
                </div>
              </div>
              <div className="flex gap-3 items-start p-4 rounded-2xl text-left" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="p-2 rounded-xl shrink-0" style={{ background: '#e8f5e9' }}>
                  <Database className="w-4 h-4" style={{ color: '#137333' }} />
                </div>
                <div>
                  <p className="text-xs font-bold mb-0.5" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>Cloud backup available</p>
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>Go to Settings → Backup to encrypt and safely store your chats in the cloud.</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════
          SETTINGS MODAL
          ═══════════════════════════════════════ */}
      {showSettings && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSettings(false)}>
          <div className="modal-card slide-up">
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                Settings
              </h3>
              <button
                onClick={() => { setShowSettings(false); setSettingsTab('profile'); }}
                className="p-2 rounded-full transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              {['profile', 'backup'].map(tab => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold capitalize transition-all flex items-center justify-center gap-1.5"
                  style={{
                    background: settingsTab === tab ? 'var(--primary-light)' : 'transparent',
                    color: settingsTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-jakarta)'
                  }}
                >
                  {tab === 'backup' && <Database className="w-3.5 h-3.5" />}
                  {tab === 'profile' ? 'Profile' : 'Backup & Sync'}
                </button>
              ))}
            </div>

            {/* Profile Tab */}
            {settingsTab === 'profile' && (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="label-text">Avatar Image URL</label>
                  <input
                    type="text"
                    placeholder="Paste an image URL..."
                    value={editAvatar}
                    onChange={e => setEditAvatar(e.target.value)}
                    className="modal-input"
                  />
                </div>
                <div>
                  <label className="label-text">Bio</label>
                  <textarea
                    placeholder="Tell your friends about you..."
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    rows={3}
                    className="modal-input resize-none"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setShowSettings(false)} className="btn-ghost flex-1">Cancel</button>
                  <button type="submit" className="btn-blue flex-1">Save Changes</button>
                </div>
              </form>
            )}

            {/* Backup Tab */}
            {settingsTab === 'backup' && (
              <div className="space-y-4">
                <div
                  className="flex gap-2.5 p-3 rounded-xl text-xs"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary-container)' }}
                >
                  <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Zero-Knowledge: </span>
                    Your backup is encrypted on your device. The server can never read your messages.
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span>Last backup:</span>
                  <span className="font-semibold" style={{ color: lastBackupTime ? 'var(--primary)' : 'var(--text-subtle)' }}>
                    {lastBackupTime
                      ? new Date(lastBackupTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'None yet'}
                  </span>
                </div>

                {backupStatusMessage.text && (
                  <div
                    className="p-3 rounded-xl text-xs flex items-center gap-2"
                    style={{
                      background: backupStatusMessage.type === 'success' ? '#e6f4ea' : backupStatusMessage.type === 'error' ? '#fce8e6' : 'var(--primary-light)',
                      color: backupStatusMessage.type === 'success' ? '#137333' : backupStatusMessage.type === 'error' ? '#c5221f' : 'var(--primary)',
                      border: `1px solid ${backupStatusMessage.type === 'success' ? '#ceead6' : backupStatusMessage.type === 'error' ? '#f28b82' : 'var(--primary-container)'}`
                    }}
                  >
                    {backupLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                    <span>{backupStatusMessage.text}</span>
                  </div>
                )}

                <div>
                  <label className="label-text">Backup Passphrase</label>
                  <div className="relative">
                    <input
                      type="password"
                      placeholder="Enter a secret passphrase..."
                      value={backupPassword}
                      onChange={e => setBackupPassword(e.target.value)}
                      className="modal-input"
                      style={{ paddingLeft: '38px' }}
                      disabled={backupLoading}
                    />
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-subtle)' }} />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleBackup}
                    disabled={backupLoading}
                    className="btn-blue flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs"
                  >
                    {backupLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Backup
                  </button>
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={backupLoading}
                    className="btn-ghost flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs"
                  >
                    {backupLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Restore
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}