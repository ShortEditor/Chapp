'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  RefreshCw,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  Bluetooth,
  Headphones,
  ChevronUp,
  User,
  Trash2,
  Mail,
  AlertCircle,
  SquarePen,
  Reply
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { encryptData, decryptData } from '@/lib/crypto';

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


const ensureSecureUrl = (url) => {
  if (!url) return url;
  return url.startsWith('http://') ? url.replace('http://', 'https://') : url;
};

const optimizeAvatarUrl = (url) => {
  if (!url) return url;
  const secureUrl = ensureSecureUrl(url);
  if (secureUrl.includes('res.cloudinary.com') && secureUrl.includes('/upload/v')) {
    return secureUrl.replace('/upload/v', '/upload/w_150,h_150,c_fill,q_auto,f_auto/v');
  }
  return secureUrl;
};

const VERIFIED_USERS = ['shorteditor'];
const PINK_VERIFIED_USERS = ['trilok', 'nagaganesh'];

const BlueTick = () => (
  <svg className="w-4 h-4 shrink-0 inline-block" viewBox="0 0 24 24" fill="none">
    <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="#1d9bf0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#1d9bf0" />
    <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PinkTick = () => (
  <svg className="w-4 h-4 shrink-0 inline-block" viewBox="0 0 24 24" fill="none">
    <path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" stroke="#ff69b4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="#ff69b4" />
    <path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const renderUsername = (username, textStyle = {}) => {
  if (username && PINK_VERIFIED_USERS.includes(username.toLowerCase())) {
    return (
      <span className="inline-flex items-center gap-1" style={textStyle}>
        <span>{username}</span>
        <PinkTick />
      </span>
    );
  }
  if (username && VERIFIED_USERS.includes(username.toLowerCase())) {
    return (
      <span className="inline-flex items-center gap-1" style={textStyle}>
        <span>{username}</span>
        <BlueTick />
      </span>
    );
  }
  return <span style={textStyle}>{username || ''}</span>;
};

const MessageInputBar = React.memo(({ onSendMessage, pendingMedia, uploading, fileInputRef, triggerFileSelector, handleFileUpload, emitTyping, activeFriendId, replyingTo, onCancelReply }) => {
  const [inputText, setInputText] = useState('');
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-focus input and scroll into view when replying
  useEffect(() => {
    if (replyingTo && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [replyingTo]);

  // Escape key cancels reply
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape' && replyingTo) onCancelReply(); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [replyingTo, onCancelReply]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await onSendMessage(inputText);
    if (success !== false) {
      setInputText('');
      if (inputRef.current) inputRef.current.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (inputText.length === 0) emitTyping(activeFriendId, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => emitTyping(activeFriendId, false), 2000);
  };

  return (
    <div className="w-full">
      {/* Reply bar — animates in */}
      {replyingTo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px', marginBottom: '8px',
          background: 'var(--surface)', borderRadius: '14px',
          border: '1px solid var(--border-light)',
          borderLeft: '3px solid var(--primary)',
          animation: 'slideUp 0.15s ease-out',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
        }}>
          <Reply style={{ width: '14px', height: '14px', color: 'var(--primary)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', margin: '0 0 1px', fontFamily: 'var(--font-jakarta)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {replyingTo.senderId === replyingTo._selfId ? 'You' : 'Replying'}
            </p>
            <p style={{ fontSize: '12px', color: 'var(--text)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.75 }}>
              {replyingTo.text || '📎 Attachment'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            style={{ background: 'var(--border-light)', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-muted)', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px' }}
            title="Cancel reply (Esc)"
          >
            <X style={{ width: '11px', height: '11px' }} />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-4">
        <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,video/*,application/*" />

        <button
          type="button"
          onClick={triggerFileSelector}
          disabled={uploading}
          className="p-3.5 rounded-full transition-colors shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <input
          ref={inputRef}
          type="text"
          placeholder={replyingTo ? 'Type your reply...' : 'Type a message...'}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          className="msg-field"
          style={replyingTo ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px rgba(99,102,241,0.15)' } : {}}
        />

        <button
          type="submit"
          disabled={!inputText.trim() && !pendingMedia}
          className="w-11 h-11 rounded-full text-white shrink-0 flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none hover:scale-105 active:scale-95 shadow-md border-none cursor-pointer"
          style={{
            background: replyingTo
              ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
              : 'linear-gradient(135deg, var(--primary) 0%, #4a5cf6 100%)',
            boxShadow: replyingTo
              ? '0 4px 12px rgba(99,102,241,0.35)'
              : '0 4px 12px rgba(26,115,232,0.25)'
          }}
        >
          <Send className="w-5 h-5" style={{ transform: 'rotate(-15deg) translate(1px, -1px)' }} />
        </button>
      </form>
    </div>
  );
});
MessageInputBar.displayName = 'MessageInputBar';


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
    deleteMessage,
    sendReaction,
    emitTyping,
    setActiveChat,
    callState,
    callPartner,
    isMuted,
    speakerMode,
    audioOutputs,
    currentSinkId,
    setAudioOutputDevice,
    callDuration,
    initiateCall,
    answerIncomingCall,
    rejectIncomingCall,
    endActiveCall,
    toggleMute,
    toggleSpeakerMode
  } = useSocket();

  // Local React states
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('chats'); // 'chats' | 'friends' | 'requests'
  const [activeFriend, setActiveFriend] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingUserAdding, setViewingUserAdding] = useState(false);

  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [friendRequestMessage, setFriendRequestMessage] = useState({ text: '', type: '' });
  const [isPwaInstallable, setIsPwaInstallable] = useState(false);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [sendError, setSendError] = useState('');
  
  // Profile settings editor modal state
  const [showSettings, setShowSettings] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [profileStatusMessage, setProfileStatusMessage] = useState({ text: '', type: '' });
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [socialLinks, setSocialLinks] = useState({});
  const [editingSocialLinks, setEditingSocialLinks] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState(null);
  const [msgActionSheet, setMsgActionSheet] = useState(null); // { msg, isMe }
  const [draftSocialLinks, setDraftSocialLinks] = useState({});
  const [customStatus, setCustomStatus] = useState('');

  // Friend suggestions states
  const [suggestions, setSuggestions] = useState([]);
  const [fetchingSuggestions, setFetchingSuggestions] = useState(false);
  const [sendingRequestIds, setSendingRequestIds] = useState(new Set());

  // Profile editing mode state
  const [isEditingBio, setIsEditingBio] = useState(false);

  // Zero-Knowledge Backup states
  const [settingsTab, setSettingsTab] = useState('profile'); // 'profile' | 'backup'
  const [backupPassword, setBackupPassword] = useState('');
  const [backupStatusMessage, setBackupStatusMessage] = useState({ text: '', type: '' });
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);

  // Recovery email editing states
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editEmailVal, setEditEmailVal] = useState('');
  const [emailEditError, setEmailEditError] = useState('');

  // Dynamic user search states
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Conversation search state
  const [chatSearchQuery, setChatSearchQuery] = useState('');

  // Media upload states
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null); // { url, type, name }
  const [previewImage, setPreviewImage] = useState(null); // Full-screen image preview

  // Message delete (unsend) states
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, senderId, receiverId }
  const longPressTimerRef = useRef(null);
  const touchData = useRef({ startX: 0, startY: 0, isHorizontal: null });

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const lastChatIdRef = useRef(null);

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

    // Fetch latest profile from backend to ensure we have the most up-to-date data
    fetch(`${BACKEND_URL}/api/users/profile`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch profile');
      })
      .then(data => {
        setCurrentUser(data);
      setSocialLinks(data.socialLinks || {});
        localStorage.setItem('chapp_user', JSON.stringify(data));
        setEditBio(data.bio || '');
        setEditAvatar(data.avatar || '');
        setCustomStatus(data.status || 'online');
      })
      .catch(err => console.error('❌ Error syncing profile on startup:', err));

    // Load auto backup state from local storage
    const savedAuto = localStorage.getItem('chapp_auto_backup_enabled') === 'true';
    setAutoBackupEnabled(savedAuto);

    // 1. Establish WSS Connection
    connectSocket(token);

    // 2. Refresh lists from server API
    refreshFriendsAndRequests(token);

    // 3. Fetch latest backup metadata for auto-sync checks
    fetchBackupInfo();

    // 4. Register Web Push notification token dynamically
    setTimeout(registerPushNotifications, 2000);

    // 5. Listen for PWA installation prompts
    const handlePwaInstallable = () => setIsPwaInstallable(true);
    const handlePwaInstalled = () => setIsPwaInstallable(false);

    window.addEventListener('pwa-installable', handlePwaInstallable);
    window.addEventListener('pwa-installed', handlePwaInstalled);

    // 6. Disable context menu / long press on images
    const preventDefaultContextMenu = (e) => {
      if (e.target.tagName === 'IMG') {
        e.preventDefault();
      }
    };
    window.addEventListener('contextmenu', preventDefaultContextMenu);

    if (window.deferredPrompt) {
      setIsPwaInstallable(true);
    }

    return () => {
      window.removeEventListener('pwa-installable', handlePwaInstallable);
      window.removeEventListener('pwa-installed', handlePwaInstalled);
      window.removeEventListener('contextmenu', preventDefaultContextMenu);
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

  // Keep activeFriend in sync with latest dbFriends data (e.g. avatar updates)
  useEffect(() => {
    if (activeFriend && dbFriends.length > 0) {
      const updated = dbFriends.find(f => f.id === activeFriend.id);
      if (updated && (updated.avatar !== activeFriend.avatar || updated.bio !== activeFriend.bio || updated.username !== activeFriend.username)) {
        setActiveFriend(updated);
      }
    }
  }, [dbFriends, activeFriend]);

  // Scroll to bottom of message list on new messages
  useEffect(() => {
    if (!activeFriend) return;

    const isNewChat = lastChatIdRef.current !== activeFriend.id;
    if (isNewChat) {
      // Instant snap on chat load
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      lastChatIdRef.current = activeFriend.id;
    } else {
      // Smooth scroll only for new incoming/outgoing messages in the same chat
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, typingFriends, activeFriend]);

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

  // Automatic Daily Background Backup trigger
  useEffect(() => {
    const checkAndRunAutoBackup = async () => {
      if (!autoBackupEnabled) return;
      const passphrase = localStorage.getItem('chapp_auto_backup_passphrase');
      if (!passphrase) return;

      const shouldBackup = !lastBackupTime || (Date.now() - new Date(lastBackupTime).getTime() > 24 * 60 * 60 * 1000);
      if (shouldBackup) {
        await triggerAutoBackup(passphrase);
      }
    };
    
    // Run after a short 3-second delay on mount or when lastBackupTime is loaded
    const timeout = setTimeout(checkAndRunAutoBackup, 3000);
    return () => clearTimeout(timeout);
  }, [lastBackupTime, autoBackupEnabled]);

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

  const fetchSuggestions = async () => {
    const token = localStorage.getItem('chapp_token');
    if (!token) return;
    setFetchingSuggestions(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/friends/suggestions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data);
      }
    } catch (err) {
      console.error('❌ Failed to fetch suggestions:', err);
    } finally {
      setFetchingSuggestions(false);
    }
  };

  const handleAddSuggestedFriend = async (username) => {
    const token = localStorage.getItem('chapp_token');
    if (!token) return;

    const cand = suggestions.find(s => s.username === username);
    if (cand) {
      setSendingRequestIds(prev => {
        const next = new Set(prev);
        next.add(cand.id);
        return next;
      });
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send request');
      }

      setFriendRequestMessage({ text: data.message || 'Request sent successfully!', type: 'success' });
      
      confetti({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.8 },
        colors: ['#6366f1', '#a5b4fc', '#4f46e5']
      });

      fetchSuggestions();
      refreshFriendsAndRequests(token);
    } catch (err) {
      setFriendRequestMessage({ text: err.message, type: 'error' });
    } finally {
      if (cand) {
        setSendingRequestIds(prev => {
          const next = new Set(prev);
          next.delete(cand.id);
          return next;
        });
      }
    }
  };

  // Sync suggestions when friends tab is selected
  useEffect(() => {
    if (activeTab === 'friends') {
      fetchSuggestions();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!newFriendUsername.trim()) {
      setSearchSuggestions([]);
      setSearchLoading(false);
      return;
    }

    setSearchLoading(true);
    const timer = setTimeout(async () => {
      const token = localStorage.getItem('chapp_token');
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/search?q=${encodeURIComponent(newFriendUsername.trim())}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setSearchSuggestions(data);
        }
      } catch (err) {
        console.error('Error searching users:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [newFriendUsername]);




  const registerPushNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('⚠️ Push notifications not supported on this browser.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('🚫 Notification permission denied.');
        return;
      }

      // 1. Fetch VAPID public key from backend
      const res = await fetch(`${BACKEND_URL}/api/notifications/vapidPublicKey`);
      if (!res.ok) throw new Error('Failed to fetch VAPID public key.');
      const { publicKey } = await res.json();

      // Convert VAPID public key to Uint8Array
      const padding = '='.repeat((4 - publicKey.length % 4) % 4);
      const base64 = (publicKey + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }

      // 2. Get Service Worker Registration
      const registration = await navigator.serviceWorker.ready;
      
      // 3. Register Subscription
      let subscription;
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: outputArray
        });
      } catch (subErr) {
        console.warn('⚠️ Push subscription failed, attempting to reset active subscription:', subErr);
        try {
          const activeSub = await registration.pushManager.getSubscription();
          if (activeSub) {
            await activeSub.unsubscribe();
            console.log('✅ Unsubscribed existing push subscription.');
          }
          // Retry subscription
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: outputArray
          });
        } catch (retryErr) {
          throw new Error(`Failed to subscribe after reset: ${retryErr.message}`);
        }
      }

      // 4. Send subscription to server
      const token = localStorage.getItem('chapp_token');
      await fetch(`${BACKEND_URL}/api/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription })
      });
    } catch (err) {
      console.error('❌ Failed to register push notifications:', err);
    }
  };

  const saveAvatarToBackend = async (imageUrl, token) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ avatar: imageUrl })
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data);
        localStorage.setItem('chapp_user', JSON.stringify(data));
        return true;
      }
    } catch (err) {
      console.error('❌ Failed to auto-save avatar to backend:', err);
    }
    return false;
  };

  const handleAvatarUpload = async (e) => {
    let file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    setProfileStatusMessage({ text: 'Compressing avatar...', type: 'info' });

    try {
      file = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 250;
            let { width, height } = img;
            if (width > height && width > maxSize) {
              height *= maxSize / width;
              width = maxSize;
            } else if (height > maxSize) {
              width *= maxSize / height;
              height = maxSize;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
            }, 'image/jpeg', 0.85);
          };
          img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
      });
    } catch(err) {
      console.warn("Compression failed, using original file", err);
    }

    setProfileStatusMessage({ text: 'Uploading avatar...', type: 'info' });

    const token = localStorage.getItem('chapp_token');

    // Layer 1: Secure Signed Cloudinary Upload
    try {
      console.log('☁️ [Cloudinary] Attempting secure signed upload...');
      if (!token) throw new Error('Not authenticated');

      const signRes = await fetch(`${BACKEND_URL}/api/cloudinary/sign`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!signRes.ok) {
        throw new Error('Signed upload endpoint not available or returned error');
      }

      const signData = await signRes.json();
      const { signature, timestamp, folder, apiKey, cloudName } = signData;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);

      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        throw new Error('Signed Cloudinary upload failed');
      }

      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.secure_url;

      setEditAvatar(imageUrl);
      const saved = await saveAvatarToBackend(imageUrl, token);
      if (saved) {
        setProfileStatusMessage({ text: 'Avatar uploaded and saved successfully!', type: 'success' });
      } else {
        setProfileStatusMessage({ text: 'Avatar uploaded successfully! Click Save Changes to apply.', type: 'success' });
      }
      setAvatarUploading(false);
      return;
    } catch (layer1Err) {
      console.warn('☁️ [Cloudinary] Layer 1 Signed Upload failed:', layer1Err.message);
    }

    // Layer 2: Unsigned Cloudinary Upload (Fallback)
    try {
      console.log('☁️ [Cloudinary] Attempting unsigned fallback upload...');
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dlw5v5zot';
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'avatar_preset';

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error('Unsigned upload failed');
      }

      const data = await res.json();
      const imageUrl = data.secure_url;

      setEditAvatar(imageUrl);
      const saved = await saveAvatarToBackend(imageUrl, token);
      if (saved) {
        setProfileStatusMessage({ text: 'Avatar uploaded and saved successfully!', type: 'success' });
      } else {
        setProfileStatusMessage({ text: 'Avatar uploaded successfully! Click Save Changes to apply.', type: 'success' });
      }
      setAvatarUploading(false);
      return;
    } catch (layer2Err) {
      console.warn('☁️ [Cloudinary] Layer 2 Unsigned Upload failed:', layer2Err.message);
    }

    // Layer 3: Self-Hosted Server Fallback
    try {
      console.log('💻 [Server] Attempting self-hosted fallback upload...');
      if (!token) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${BACKEND_URL}/api/media/upload`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        throw new Error('Server upload failed');
      }

      const data = await res.json();
      const imageUrl = data.url;

      setEditAvatar(imageUrl);
      const saved = await saveAvatarToBackend(imageUrl, token);
      if (saved) {
        setProfileStatusMessage({ text: 'Avatar uploaded and saved successfully!', type: 'success' });
      } else {
        setProfileStatusMessage({ text: 'Avatar uploaded successfully! Click Save Changes to apply.', type: 'success' });
      }
    } catch (layer3Err) {
      console.error('❌ All avatar upload layers failed:', layer3Err.message);
      setProfileStatusMessage({ text: `Avatar upload failed: ${layer3Err.message}`, type: 'error' });
    } finally {
      setAvatarUploading(false);
    }
  };

  const saveBannerToBackend = async (imageUrl, token) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ banner: imageUrl })
      });
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data);
        localStorage.setItem('chapp_user', JSON.stringify(data));
        return true;
      }
    } catch (err) {
      console.error('❌ Failed to save banner to backend:', err);
    }
    return false;
  };

  const saveSocialLinks = async (links) => {
    const token = localStorage.getItem('chapp_token');
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ socialLinks: links })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setCurrentUser(data);
      setSocialLinks(data.socialLinks || {});
    } catch (err) {
      console.error('Social links save error:', err.message);
    }
  };

  const handleBannerUpload = async (e) => {
    let file = e.target.files?.[0];
    if (!file) return;

    setBannerUploading(true);
    setProfileStatusMessage({ text: 'Uploading banner...', type: 'info' });

    // Compress banner to a reasonable size (max 1200px wide)
    try {
      file = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxW = 1200;
            let { width, height } = img;
            if (width > maxW) { height *= maxW / width; width = maxW; }
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
              resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file);
            }, 'image/jpeg', 0.88);
          };
          img.onerror = () => resolve(file);
        };
        reader.onerror = () => resolve(file);
      });
    } catch (err) {
      console.warn('Banner compression failed, using original', err);
    }

    const token = localStorage.getItem('chapp_token');

    // Layer 1: Signed Cloudinary
    try {
      if (!token) throw new Error('Not authenticated');
      const signRes = await fetch(`${BACKEND_URL}/api/cloudinary/sign`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!signRes.ok) throw new Error('Sign endpoint unavailable');
      const { signature, timestamp, folder, apiKey, cloudName } = await signRes.json();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('api_key', apiKey);
      formData.append('timestamp', timestamp);
      formData.append('signature', signature);
      formData.append('folder', folder);
      const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
      if (!uploadRes.ok) throw new Error('Signed upload failed');
      const { secure_url } = await uploadRes.json();
      await saveBannerToBackend(secure_url, token);
      setProfileStatusMessage({ text: 'Banner updated!', type: 'success' });
      setBannerUploading(false);
      return;
    } catch (l1) { console.warn('Banner Layer 1 failed:', l1.message); }

    // Layer 2: Unsigned Cloudinary
    try {
      const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'dlw5v5zot';
      const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || 'avatar_preset';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Unsigned upload failed');
      const { secure_url } = await res.json();
      await saveBannerToBackend(secure_url, token);
      setProfileStatusMessage({ text: 'Banner updated!', type: 'success' });
      setBannerUploading(false);
      return;
    } catch (l2) { console.warn('Banner Layer 2 failed:', l2.message); }

    // Layer 3: Self-hosted
    try {
      if (!token) throw new Error('Not authenticated');
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BACKEND_URL}/api/media/upload`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      if (!res.ok) throw new Error('Server upload failed');
      const { url } = await res.json();
      await saveBannerToBackend(url, token);
      setProfileStatusMessage({ text: 'Banner updated!', type: 'success' });
    } catch (l3) {
      console.error('❌ All banner upload layers failed:', l3.message);
      setProfileStatusMessage({ text: `Banner upload failed: ${l3.message}`, type: 'error' });
    } finally {
      setBannerUploading(false);
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
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (data.backupUpdatedAt) {
            setLastBackupTime(data.backupUpdatedAt);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching backup info:', err);
    }
  };

  const triggerAutoBackup = async (passphrase) => {
    try {
      console.log('🔄 [Auto-Backup] Running silent background auto-backup...');
      const chats = await db.chats.toArray();
      const messages = await db.messages.toArray();
      const friends = await db.friends.toArray();

      const payload = {
        chats,
        messages,
        friends,
        version: 1
      };

      const serialized = JSON.stringify(payload);
      const encryptedBlob = await encryptData(serialized, passphrase);
      const token = localStorage.getItem('chapp_token');

      const res = await fetch(`${BACKEND_URL}/api/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ encryptedBackup: encryptedBlob })
      });

      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setLastBackupTime(data.backupUpdatedAt);
          console.log('✅ [Auto-Backup] Silent background auto-backup completed successfully!');
        }
      }
    } catch (err) {
      console.error('❌ [Auto-Backup] Background auto-backup failed:', err);
    }
  };

  const handleToggleAutoBackup = (e) => {
    const checked = e.target.checked;
    if (checked) {
      // Enabling auto-backup: requires a password in backupPassword or existing saved
      const savedPass = localStorage.getItem('chapp_auto_backup_passphrase');
      if (!backupPassword && !savedPass) {
        setBackupStatusMessage({ text: 'Please enter a backup password below first to enable auto-backup.', type: 'error' });
        return;
      }
      if (backupPassword) {
        localStorage.setItem('chapp_auto_backup_passphrase', backupPassword);
      }
      localStorage.setItem('chapp_auto_backup_enabled', 'true');
      setAutoBackupEnabled(true);
      setBackupStatusMessage({ text: 'Auto-backup enabled! We will run it in the background.', type: 'success' });
    } else {
      localStorage.removeItem('chapp_auto_backup_enabled');
      localStorage.removeItem('chapp_auto_backup_passphrase');
      setAutoBackupEnabled(false);
      setBackupStatusMessage({ text: 'Auto-backup disabled.', type: 'info' });
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
      const backupController = new AbortController();
      const backupTimeout = setTimeout(() => backupController.abort(), 30000);
      let res;
      try {
        res = await fetch(`${BACKEND_URL}/api/backup`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ encryptedBackup: encryptedBlob }),
          signal: backupController.signal
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error('Backup timed out — the server took too long to respond. Try again in a moment (server may be waking up).');
        }
        throw new Error(`Network error during backup: ${fetchErr.message}`);
      } finally {
        clearTimeout(backupTimeout);
      }

      if (!res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          throw new Error(data.error || `Server error (${res.status})`);
        } else {
          throw new Error(`Server error ${res.status} — the backend may be starting up. Wait a moment and try again.`);
        }
      }

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Unexpected server response (${res.status}) — try again in a few seconds.`);
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

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error('Backend unavailable (Did you set NEXT_PUBLIC_BACKEND_URL on Vercel?).');
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
  const onSendMessage = async (text) => {
    if (!text.trim() && !pendingMedia) return false;

    setSendError('');
    const result = await sendMessage(
      activeFriend.id,
      text.trim(),
      pendingMedia?.url || null,
      pendingMedia?.type || null,
      replyingTo ? { id: replyingTo.id, text: replyingTo.text, senderId: replyingTo.senderId } : null
    );

    if (!result) {
      setSendError('Failed to save message. IndexedDB may be full.');
      setTimeout(() => setSendError(''), 4000);
      return false;
    }

    setPendingMedia(null);
    setReplyingTo(null);
    emitTyping(activeFriend.id, false);
    return true;
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
      const secureUrl = ensureSecureUrl(url);
      const res = await fetch(secureUrl);
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
  const filteredChats = dbChats.filter(chat => {
    const friend = dbFriends.find(f => f.id === chat.friendId);
    const friendName = friend?.username || 'Unknown';
    const lastMsg = chat.lastMessageText || '';
    return friendName.toLowerCase().includes(chatSearchQuery.toLowerCase()) || 
           lastMsg.toLowerCase().includes(chatSearchQuery.toLowerCase());
  });

  // Derived suggestions
  const mutualSuggestions = suggestions.filter(s => s && s.mutualFriends && s.mutualFriends.length > 0);
  const otherSuggestions = suggestions.filter(s => s && (!s.mutualFriends || s.mutualFriends.length === 0));

  return (
    <div className="flex h-[100dvh] overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ═══════════════════════════════════════
          SIDEBAR
          ═══════════════════════════════════════ */}
      <div className={`w-full md:w-[340px] h-full flex flex-col sidebar shrink-0 ${activeFriend ? 'hidden md:flex' : 'flex'}`}>

        {/* Sidebar Top Header */}
        <div 
          className="flex items-center justify-between border-b shrink-0" 
          style={{ 
            borderColor: 'var(--border)',
            paddingLeft: 'calc(16px + env(safe-area-inset-left))',
            paddingRight: 'calc(16px + env(safe-area-inset-right))',
            paddingTop: 'calc(12px + env(safe-area-inset-top))',
            paddingBottom: '12px'
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="avatar w-9 h-9 text-xs shrink-0 relative"
              style={{ background: getAvatarColor(currentUser?.username) }}
            >
              {currentUser?.username?.slice(0, 2)}
              {currentUser?.avatar?.startsWith('http') && (
                <img src={optimizeAvatarUrl(currentUser.avatar)} alt="me" className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
              )}
              <span
                className="status-dot"
                style={{ background: isConnected ? 'var(--online)' : '#f59e0b', borderColor: 'var(--surface)' }}
              />
            </div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--font-jakarta)', color: 'var(--text)' }}>
              Chapp
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setActiveTab('friends'); }}
              className="p-2 rounded-full transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--border-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
              title="New chat"
            >
              <SquarePen className="w-5 h-5" />
            </button>
            {activeTab !== 'chats' && (
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
            )}
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
                className="mt-2 px-4 py-1.5 rounded-full text-[11px] font-bold text-white transition-colors cursor-pointer"
                style={{ 
                  background: 'var(--primary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 'auto',
                  minWidth: '70px',
                  border: 'none'
                }}
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
            <div className="p-3 space-y-3">
              {/* Search Bar */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search conversations..."
                  value={chatSearchQuery}
                  onChange={e => setChatSearchQuery(e.target.value)}
                  className="msg-field w-full"
                  style={{ borderRadius: '10px', padding: '9px 14px', fontSize: '13px', height: '38px' }}
                />
                {chatSearchQuery && (
                  <button
                    onClick={() => setChatSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 px-6 text-center">
                  <MessageSquare className="w-10 h-10 mb-3" style={{ color: 'var(--text-subtle)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>
                    {dbChats.length === 0 ? 'No conversations yet' : 'No matches found'}
                  </p>
                  {dbChats.length === 0 && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Add friends to start chatting</p>
                  )}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {filteredChats.map(chat => {
                    const friend = dbFriends.find(f => f.id === chat.friendId);
                    const isOnline = onlineFriends.get(chat.friendId) === 'online';
                    const isTyping = typingFriends.has(chat.friendId);
                    const isActive = activeFriend?.id === chat.friendId;
                    return (
                      <div
                        key={chat.friendId}
                        onClick={() => setActiveFriend(friend || { id: chat.friendId, username: 'Unknown' })}
                        className={`conv-item ${isActive ? 'active' : ''}`}
                        style={{ borderRadius: '12px' }}
                      >
                        <div className="relative shrink-0">
                          <div
                            className="avatar w-12 h-12 text-sm"
                            style={{ background: getAvatarColor(friend?.username) }}
                          >
                            {friend?.username?.slice(0, 2)}
                            {friend?.avatar?.startsWith('http') && (
                              <img src={optimizeAvatarUrl(friend.avatar)} alt={friend.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                            )}
                          </div>
                          {isOnline && (
                            <span className="status-dot status-online" style={{ borderColor: isActive ? 'var(--primary-light)' : 'var(--surface)' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold truncate flex items-center gap-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                              {renderUsername(friend?.username || 'Chapp User')}
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
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── FRIENDS TAB ── */}
          {activeTab === 'friends' && (
            <div className="pb-6" style={{ background: 'var(--bg)' }}>

              {/* Search bar */}
              <div style={{ padding: '12px 14px 0' }}>
                <form onSubmit={handleAddFriend} className="flex gap-2 relative">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder="Search username to add..."
                      value={newFriendUsername}
                      onChange={e => setNewFriendUsername(e.target.value)}
                      className="msg-field w-full"
                      style={{ borderRadius: '14px', padding: '10px 14px 10px 38px', fontSize: '13px', height: '42px' }}
                    />
                    <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                      <Users style={{ width: '14px', height: '14px', color: 'var(--text-subtle)' }} />
                    </div>
                    {searchLoading && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-subtle)' }} />
                      </div>
                    )}
                  </div>
                  <button
                    type="submit"
                    className="px-4 rounded-2xl text-white font-bold text-xs shrink-0 flex items-center gap-1.5 justify-center transition-all hover:opacity-90 active:scale-95"
                    style={{ background: 'var(--primary)', height: '42px', border: 'none', cursor: 'pointer' }}
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>

                  {/* Suggestions Dropdown */}
                  {searchSuggestions.length > 0 && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setSearchSuggestions([])} />
                      <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl shadow-xl border overflow-hidden z-50 animate-zoom-in"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
                        <div className="max-h-60 overflow-y-auto">
                          {searchSuggestions.map(user => {
                            const isAdding = sendingRequestIds.has(user.id);
                            return (
                              <div key={user.id} className="flex items-center justify-between p-3 transition-colors"
                                style={{ borderBottom: '1px solid var(--border-light)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <div className="flex items-center gap-3 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(user)}>
                                  <div className="avatar w-9 h-9 text-xs relative font-bold" style={{ background: getAvatarColor(user.username) }}>
                                    {user.username.slice(0, 2)}
                                    {user.avatar?.startsWith('http') && (
                                      <img src={optimizeAvatarUrl(user.avatar)} alt={user.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{renderUsername(user.username)}</p>
                                    <p className="text-[10px]" style={{ color: user.status === 'online' ? '#34a853' : 'var(--text-subtle)' }}>{user.status || 'offline'}</p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setSendingRequestIds(prev => { const n = new Set(prev); n.add(user.id); return n; });
                                    const token = localStorage.getItem('chapp_token');
                                    try {
                                      const response = await fetch(`${BACKEND_URL}/api/friends/request`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ username: user.username })
                                      });
                                      const data = await response.json();
                                      if (!response.ok) throw new Error(data.error || 'Failed');
                                      setFriendRequestMessage({ text: data.message || 'Request sent!', type: 'success' });
                                      confetti({ particleCount: 40, spread: 20, origin: { y: 0.8 } });
                                      setSearchSuggestions(prev => prev.filter(item => item.id !== user.id));
                                      setNewFriendUsername('');
                                      refreshFriendsAndRequests(token);
                                    } catch (err) {
                                      setFriendRequestMessage({ text: err.message, type: 'error' });
                                    } finally {
                                      setSendingRequestIds(prev => { const n = new Set(prev); n.delete(user.id); return n; });
                                    }
                                  }}
                                  disabled={isAdding}
                                  style={{ background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '10px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                                >
                                  {isAdding ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </form>

                {/* Status message */}
                {friendRequestMessage.text && (
                  <div className="mt-2 px-3 py-2 rounded-xl text-xs animate-fade-in flex items-center gap-2" style={{
                    background: friendRequestMessage.type === 'success' ? 'rgba(52,168,83,0.10)' : 'rgba(239,68,68,0.08)',
                    color: friendRequestMessage.type === 'success' ? '#137333' : '#c5221f',
                    border: `1px solid ${friendRequestMessage.type === 'success' ? 'rgba(52,168,83,0.25)' : 'rgba(239,68,68,0.2)'}`,
                  }}>
                    {friendRequestMessage.type === 'success' ? <Check className="w-3 h-3 shrink-0" /> : <AlertCircle className="w-3 h-3 shrink-0" />}
                    {friendRequestMessage.text}
                  </div>
                )}
              </div>

              {/* Friends List */}
              <div style={{ padding: '16px 14px 0' }}>
                <div className="flex items-center gap-2 mb-3">
                  <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Friends</h3>
                  {dbFriends.length > 0 && (
                    <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '20px', padding: '1px 8px' }}>
                      {dbFriends.length}
                    </span>
                  )}
                </div>

                {dbFriends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div style={{ width: '52px', height: '52px', borderRadius: '18px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
                      <Users style={{ width: '22px', height: '22px', color: 'var(--primary)' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>No friends yet</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Search a username above to connect</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dbFriends.map(friend => {
                      const isOnline = onlineFriends.get(friend.id) === 'online';
                      return (
                        <div
                          key={friend.id}
                          className="animate-fade-in"
                          style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
                        >
                          <div style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(friend)}>
                            <div className="avatar" style={{ width: '44px', height: '44px', fontSize: '14px', background: getAvatarColor(friend.username), borderRadius: '50%', position: 'relative' }}>
                              {friend.username.slice(0, 2)}
                              {friend.avatar?.startsWith('http') && (
                                <img src={optimizeAvatarUrl(friend.avatar)} alt={friend.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={(e) => { e.target.style.display = 'none'; }} />
                              )}
                            </div>
                            {isOnline && <span className="status-dot status-online" style={{ borderColor: 'var(--surface)' }} />}
                          </div>
                          <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(friend)}>
                            <p className="font-bold truncate flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>
                              {renderUsername(friend.username)}
                            </p>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isOnline ? '#34a853' : 'var(--text-subtle)' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOnline ? '#34a853' : 'var(--border)', display: 'inline-block' }} />
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setActiveFriend(friend);
                              db.chats.put({ friendId: friend.id, lastMessageText: '', lastMessageTime: Date.now(), unreadCount: 0 }).catch(() => {});
                              setActiveTab('chats');
                            }}
                            style={{ flexShrink: 0, width: '36px', height: '36px', borderRadius: '12px', background: 'var(--primary-light)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-container)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--primary-light)'}
                            title="Open chat"
                          >
                            <MessageSquare style={{ width: '15px', height: '15px', color: 'var(--primary)' }} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Mutual Suggestions */}
              {mutualSuggestions.length > 0 && (
                <div style={{ padding: '20px 14px 0' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Mutual Connections</h3>
                  </div>
                  <div className="space-y-2">
                    {mutualSuggestions.map(s => (
                      <div key={s.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(s.username), borderRadius: '50%', position: 'relative' }}>
                            {s.username.slice(0, 2)}
                            {s.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(s.avatar)} alt={s.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(s.username)}</p>
                          <p style={{ fontSize: '10px', color: 'var(--primary)', fontWeight: 600, margin: '2px 0 0' }}>{s.mutualFriends.length} mutual friend{s.mutualFriends.length > 1 ? 's' : ''}</p>
                        </div>
                        <button onClick={() => handleAddSuggestedFriend(s.username)} disabled={sendingRequestIds.has(s.id)}
                          style={{ flexShrink: 0, background: 'var(--primary-light)', border: '1.5px solid var(--primary-container)', borderRadius: '12px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {sendingRequestIds.has(s.id) ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Discover People */}
              {otherSuggestions.length > 0 && (
                <div style={{ padding: '20px 14px 0' }}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Discover People</h3>
                    {fetchingSuggestions && <RefreshCw className="w-3 h-3 animate-spin" style={{ color: 'var(--text-subtle)' }} />}
                  </div>
                  <div className="space-y-2">
                    {otherSuggestions.map(s => (
                      <div key={s.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(s.username), borderRadius: '50%', position: 'relative' }}>
                            {s.username.slice(0, 2)}
                            {s.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(s.avatar)} alt={s.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(s)}>
                          <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(s.username)}</p>
                          <p style={{ fontSize: '10px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>New to Chapp</p>
                        </div>
                        <button onClick={() => handleAddSuggestedFriend(s.username)} disabled={sendingRequestIds.has(s.id)}
                          style={{ flexShrink: 0, background: 'var(--primary-light)', border: '1.5px solid var(--primary-container)', borderRadius: '12px', padding: '6px 14px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {sendingRequestIds.has(s.id) ? <span className="w-3.5 h-3.5 border-2 border-current/40 border-t-current rounded-full animate-spin" /> : <><UserPlus className="w-3 h-3" />Add</>}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── REQUESTS TAB ── */}
          {activeTab === 'requests' && (() => {
            const incoming = pendingRequests.filter(r => !r.isOutgoing);
            const outgoing = pendingRequests.filter(r => r.isOutgoing);
            return (
              <div className="pb-6" style={{ background: 'var(--bg)' }}>
                {pendingRequests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                    <div style={{ width: '56px', height: '56px', borderRadius: '20px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                      <BellRing style={{ width: '24px', height: '24px', color: 'var(--primary)' }} />
                    </div>
                    <p className="text-sm font-bold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>No pending requests</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-subtle)' }}>Friend requests will appear here</p>
                  </div>
                ) : (
                  <>
                    {incoming.length > 0 && (
                      <div style={{ padding: '16px 14px 0' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Incoming</h3>
                          <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: '20px', padding: '1px 8px' }}>{incoming.length}</span>
                        </div>
                        <div className="space-y-3">
                          {incoming.map(req => {
                            const u = req.friend;
                            return (
                              <div key={req.id} style={{ background: 'var(--surface)', borderRadius: '20px', border: '1px solid var(--border-light)', padding: '14px', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                                <div className="flex items-center gap-3 mb-3" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <div className="avatar" style={{ width: '46px', height: '46px', fontSize: '14px', background: getAvatarColor(u.username), borderRadius: '50%', position: 'relative' }}>
                                      {u.username.slice(0, 2)}
                                      {u.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                                    </div>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-bold flex items-center gap-1" style={{ fontSize: '14px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(u.username)}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>Wants to connect with you</p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => handleRespondRequest(req.id, 'REJECT')}
                                    style={{ flex: 1, padding: '10px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >Decline</button>
                                  <button onClick={() => handleRespondRequest(req.id, 'ACCEPT')}
                                    style={{ flex: 1, padding: '10px', borderRadius: '14px', border: 'none', background: 'var(--primary)', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-jakarta)', boxShadow: '0 2px 8px rgba(26,115,232,0.25)' }}
                                    onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                  >Accept ✓</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {outgoing.length > 0 && (
                      <div style={{ padding: '20px 14px 0' }}>
                        <div className="flex items-center gap-2 mb-3">
                          <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Sent</h3>
                          <span style={{ fontSize: '10px', fontWeight: 700, background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: '20px', padding: '1px 8px' }}>{outgoing.length}</span>
                        </div>
                        <div className="space-y-2">
                          {outgoing.map(req => {
                            const u = req.friend;
                            return (
                              <div key={req.id} style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ flexShrink: 0, cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <div className="avatar" style={{ width: '40px', height: '40px', fontSize: '13px', background: getAvatarColor(u.username), borderRadius: '50%', position: 'relative' }}>
                                    {u.username.slice(0, 2)}
                                    {u.avatar?.startsWith('http') && (<img src={optimizeAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0, borderRadius: '50%' }} onError={e => { e.target.style.display = 'none'; }} />)}
                                  </div>
                                </div>
                                <div className="flex-1 min-w-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(u)}>
                                  <p className="font-bold truncate" style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'var(--font-jakarta)', margin: 0 }}>{renderUsername(u.username)}</p>
                                  <p style={{ fontSize: '10px', color: 'var(--text-subtle)', margin: '2px 0 0' }}>Request pending...</p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '20px', padding: '4px 10px', flexShrink: 0 }}>
                                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
                                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#f59e0b' }}>Pending</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* ── PROFILE TAB ── */}
          {activeTab === 'profile' && (
            <div className="pb-8" style={{ background: 'var(--bg)' }}>
              {/* ── Hero Banner ── */}
              <label
                className="relative shrink-0 overflow-hidden group"
                style={{
                  height: '140px',
                  display: 'block',
                  cursor: bannerUploading ? 'wait' : 'pointer',
                  background: currentUser?.banner
                    ? 'transparent'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #ec4899 80%, #f97316 100%)',
                }}
                title="Click to change banner"
              >
                {/* Banner image (if set) */}
                {currentUser?.banner && (
                  <img
                    src={currentUser.banner}
                    alt="banner"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                {/* Gradient fallback overlay when no banner */}
                {!currentUser?.banner && (
                  <>
                    <div style={{ position: 'absolute', top: '-30px', left: '-20px', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,0.10)', filter: 'blur(20px)' }} />
                    <div style={{ position: 'absolute', bottom: '-20px', right: '30px', width: '90px', height: '90px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', filter: 'blur(16px)' }} />
                    <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', width: '160px', height: '60px', borderRadius: '50%', background: 'rgba(255,255,255,0.06)', filter: 'blur(12px)' }} />
                  </>
                )}
                {/* Hover camera overlay */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: 'rgba(0,0,0,0.38)', backdropFilter: 'blur(2px)' }}
                >
                  {bannerUploading ? (
                    <RefreshCw className="w-6 h-6 text-white animate-spin" />
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>Change Banner</span>
                    </>
                  )}
                </div>
                {/* Hidden file input */}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerUpload}
                  disabled={bannerUploading}
                />
              </label>

              {/* ── Avatar + Identity ── */}
              <div
                style={{
                  background: 'var(--surface)',
                  borderRadius: '0 0 24px 24px',
                  paddingBottom: '20px',
                  marginBottom: '12px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                }}
              >
                {/* Avatar */}
                <div className="flex flex-col items-center" style={{ marginTop: '-44px' }}>
                  <label
                    className="relative group cursor-pointer"
                    style={{ display: 'inline-block' }}
                    title="Click to change profile picture"
                  >
                    {/* Glow ring */}
                    <div style={{
                      position: 'absolute',
                      inset: '-4px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #6366f1, #ec4899, #f97316)',
                      opacity: 0.7,
                      filter: 'blur(4px)',
                      zIndex: 0,
                    }} />
                    <div
                      style={{
                        width: '88px',
                        height: '88px',
                        borderRadius: '50%',
                        border: '3px solid var(--surface)',
                        background: getAvatarColor(currentUser?.username),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        position: 'relative',
                        zIndex: 1,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                      }}
                    >
                      <span className="text-2xl font-bold text-white uppercase" style={{ fontFamily: 'var(--font-jakarta)', pointerEvents: 'none' }}>
                        {currentUser?.username?.slice(0, 2)}
                      </span>
                      {currentUser?.avatar?.startsWith('http') && (
                        <img
                          src={optimizeAvatarUrl(currentUser.avatar)}
                          alt="avatar"
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                      {/* Camera overlay */}
                      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity" style={{ background: 'rgba(0,0,0,0.45)', borderRadius: '50%' }}>
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        </svg>
                      </div>
                      {avatarUploading && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', borderRadius: '50%' }}>
                          <RefreshCw className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" disabled={avatarUploading} />
                  </label>

                  {/* Name + handle */}
                  <h2
                    className="flex items-center gap-1.5 mt-3"
                    style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-jakarta)', lineHeight: 1.2 }}
                  >
                    {renderUsername(currentUser?.username)}
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-subtle)', marginTop: '2px', fontWeight: 500 }}>
                    @{currentUser?.username?.toLowerCase()}
                  </p>

                  {/* Status pill */}
                  <div
                    className="flex items-center gap-1.5 mt-2"
                    style={{
                      background: 'rgba(52,168,83,0.10)',
                      border: '1px solid rgba(52,168,83,0.25)',
                      borderRadius: '20px',
                      padding: '3px 10px',
                    }}
                  >
                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34a853', display: 'inline-block', boxShadow: '0 0 0 2px rgba(52,168,83,0.3)' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#34a853', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Online</span>
                  </div>
                </div>
              </div>

              {/* ── Stats Row ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', padding: '0 14px', marginBottom: '12px' }}>
                {/* Friends */}
                <div style={{ borderRadius: '18px', padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border-light)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                    <Users style={{ width: '15px', height: '15px', color: '#6366f1' }} />
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{dbFriends.length}</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Friends</span>
                </div>
                {/* Chats */}
                <div style={{ borderRadius: '18px', padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border-light)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(236,72,153,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                    <MessageSquare style={{ width: '15px', height: '15px', color: '#ec4899' }} />
                  </div>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>{dbChats.length}</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Chats</span>
                </div>
                {/* Joined */}
                <div style={{ borderRadius: '18px', padding: '14px 10px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border-light)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(251,146,60,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                    <Sparkles style={{ width: '15px', height: '15px', color: '#f97316' }} />
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-jakarta)', lineHeight: 1 }}>
                    {currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : 'May 26'}
                  </span>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Joined</span>
                </div>
              </div>

              {/* ── Settings Row ── */}
              <div style={{ padding: '0 14px', marginBottom: '10px' }}>
                <button
                  onClick={() => { setSettingsTab('backup'); setShowSettings(true); }}
                  style={{
                    width: '100%', background: 'var(--surface)', borderRadius: '18px',
                    border: '1px solid var(--border-light)', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
                    padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '10px', background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Settings style={{ width: '14px', height: '14px', color: '#6366f1' }} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>Settings & Backup</p>
                      <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-subtle)', marginTop: '1px' }}>Profile settings, backup & sync</p>
                    </div>
                  </div>
                  <ChevronUp style={{ width: '14px', height: '14px', color: 'var(--text-subtle)', transform: 'rotate(90deg)' }} />
                </button>
              </div>

              {/* ── Biography Card ── */}
              <div style={{ padding: '0 14px', marginBottom: '10px' }}>
                <div style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Info style={{ width: '13px', height: '13px', color: '#6366f1' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-jakarta)' }}>Bio</span>
                    </div>
                    {!isEditingBio ? (
                      <button
                        onClick={() => { setEditBio(currentUser?.bio || ''); setIsEditingBio(true); }}
                        style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                      >
                        Edit
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setIsEditingBio(false)} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-subtle)', background: 'var(--border-light)', border: 'none', borderRadius: '20px', padding: '4px 10px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem('chapp_token');
                            if (!token) return;
                            try {
                              const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ bio: editBio })
                              });
                              if (response.ok) {
                                const data = await response.json();
                                setCurrentUser(data);
                                localStorage.setItem('chapp_user', JSON.stringify(data));
                                setIsEditingBio(false);
                                confetti({ particleCount: 35, spread: 25, origin: { y: 0.8 }, colors: ['#818cf8', '#f472b6', '#6366f1'] });
                              }
                            } catch (err) { console.error(err); }
                          }}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'var(--primary)', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer' }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ height: '1px', background: 'var(--border-light)', margin: '0 16px' }} />
                  <div style={{ padding: '12px 16px 14px' }}>
                    {!isEditingBio ? (
                      <p style={{ fontSize: '13px', color: currentUser?.bio ? 'var(--text-muted)' : 'var(--text-subtle)', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontStyle: currentUser?.bio ? 'normal' : 'italic' }}>
                        {currentUser?.bio || 'Hey there! I am using Chapp.'}
                      </p>
                    ) : (
                      <textarea
                        style={{ width: '100%', fontSize: '13px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', resize: 'none', fontFamily: 'var(--font-sans)', outline: 'none', lineHeight: '1.5' }}
                        rows={3}
                        value={editBio}
                        onChange={e => setEditBio(e.target.value)}
                        placeholder="Write something about yourself..."
                        onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(26,115,232,0.12)'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* ── Recovery Email Card ── */}
              <div style={{ padding: '0 14px', marginBottom: '10px' }}>
                <div style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: currentUser?.email ? 'rgba(52,168,83,0.12)' : 'rgba(251,146,60,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Mail style={{ width: '13px', height: '13px', color: currentUser?.email ? '#34a853' : '#f97316' }} />
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-jakarta)' }}>Recovery Email</span>
                      {currentUser?.email ? (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#34a853', background: 'rgba(52,168,83,0.10)', border: '1px solid rgba(52,168,83,0.20)', borderRadius: '20px', padding: '2px 8px' }}>✓ Secured</span>
                      ) : (
                        <span style={{ fontSize: '9px', fontWeight: 700, color: '#f97316', background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.25)', borderRadius: '20px', padding: '2px 8px' }}>! Setup</span>
                      )}
                    </div>
                    {!isEditingEmail ? (
                      <button
                        onClick={() => { setEditEmailVal(currentUser?.email || ''); setIsEditingEmail(true); setEmailEditError(''); }}
                        style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}
                      >
                        {currentUser?.email ? 'Change' : 'Set'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setIsEditingEmail(false); setEmailEditError(''); }} style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-subtle)', background: 'var(--border-light)', border: 'none', borderRadius: '20px', padding: '4px 10px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            const token = localStorage.getItem('chapp_token');
                            if (!token) return;
                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                            if (editEmailVal.trim() && !emailRegex.test(editEmailVal.trim().toLowerCase())) {
                              setEmailEditError('Invalid email format.');
                              return;
                            }
                            try {
                              const response = await fetch(`${BACKEND_URL}/api/users/profile`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                body: JSON.stringify({ email: editEmailVal.trim() || null })
                              });
                              const data = await response.json();
                              if (!response.ok) throw new Error(data.error || 'Failed to update email.');
                              setCurrentUser(data);
                              localStorage.setItem('chapp_user', JSON.stringify(data));
                              setIsEditingEmail(false);
                              setEmailEditError('');
                              confetti({ particleCount: 30, spread: 20, origin: { y: 0.8 } });
                            } catch (err) { setEmailEditError(err.message); }
                          }}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'var(--primary)', border: 'none', borderRadius: '20px', padding: '4px 12px', cursor: 'pointer' }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ height: '1px', background: 'var(--border-light)', margin: '0 16px' }} />
                  <div style={{ padding: '12px 16px 14px' }}>
                    {emailEditError && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '6px 10px', marginBottom: '10px' }}>
                        <AlertCircle style={{ width: '12px', height: '12px', color: '#ef4444', flexShrink: 0 }} />
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#ef4444', margin: 0 }}>{emailEditError}</p>
                      </div>
                    )}
                    {!isEditingEmail ? (
                      <p style={{ fontSize: '13px', color: currentUser?.email ? 'var(--text)' : 'var(--text-subtle)', fontStyle: currentUser?.email ? 'normal' : 'italic' }}>
                        {currentUser?.email || 'No recovery email set.'}
                      </p>
                    ) : (
                      <input
                        type="email"
                        placeholder="e.g. you@gmail.com"
                        value={editEmailVal}
                        onChange={e => setEditEmailVal(e.target.value)}
                        style={{ width: '100%', fontSize: '13px', padding: '10px 12px', borderRadius: '12px', border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                        onFocus={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.boxShadow = '0 0 0 3px rgba(26,115,232,0.12)'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                      />
                    )}
                    {!isEditingEmail && (
                      <p style={{ fontSize: '11px', marginTop: '8px', color: 'var(--text-subtle)', lineHeight: '1.5' }}>
                        Used to restore access to your account if you lose your password.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Social Links Card ── */}
              <div style={{ padding: '0 14px', marginBottom: '10px' }}>
                <div style={{ background: 'var(--surface)', borderRadius: '18px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(99,102,241,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-jakarta)' }}>Social Links</span>
                    </div>
                    {!editingSocialLinks ? (
                      <button onClick={() => { setDraftSocialLinks({...socialLinks}); setEditingSocialLinks(true); }}
                        style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}>
                        {Object.values(socialLinks).some(v => v) ? 'Edit' : '+ Add'}
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setEditingSocialLinks(false)}
                          style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--border-light)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer' }}>Cancel</button>
                        <button onClick={async () => { await saveSocialLinks(draftSocialLinks); setEditingSocialLinks(false); }}
                          style={{ fontSize: '11px', fontWeight: 700, color: '#fff', background: 'var(--primary)', border: 'none', borderRadius: '8px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'var(--font-jakarta)' }}>Save</button>
                      </div>
                    )}
                  </div>

                  {/* Display icons when not editing */}
                  {!editingSocialLinks && (() => {
                    const PLATFORMS = [
                      { key: 'instagram', label: 'Instagram', color: '#E1306C', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg> },
                      { key: 'facebook', label: 'Facebook', color: '#1877F2', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg> },
                      { key: 'youtube', label: 'YouTube', color: '#FF0000', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.95C5.12 20 12 20 12 20s6.88 0 8.59-.47a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z"/><polygon fill="currentColor" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg> },
                      { key: 'twitter', label: 'X / Twitter', color: '#000', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
                      { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg> },
                      { key: 'github', label: 'GitHub', color: '#333', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg> },
                      { key: 'tiktok', label: 'TikTok', color: '#010101', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.28 8.28 0 0 0 4.84 1.55V6.79a4.85 4.85 0 0 1-1.07-.1z"/></svg> },
                      { key: 'snapchat', label: 'Snapchat', color: '#FFFC00', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.166 3C8.97 3 7 5.17 7 7.94v.91c-.34.13-.72.24-1.03.24a1 1 0 0 0-.97 1c0 .55.45 1 1 1h.08c-.2.42-.34.88-.34 1.38 0 1.66 1.32 3.03 3.01 3.15-.24.46-.66.77-1.12.77-.54 0-1.02-.33-1.4-.66-.25-.21-.54-.34-.86-.34-.87 0-1.57.53-1.79 1.26 1.37.27 2.44 1.07 3 2.08.28.5.72.83 1.2.83.24 0 .47-.08.68-.23.57-.41 1.2-.62 1.88-.62h.32c.68 0 1.31.21 1.88.62.21.15.44.23.68.23.48 0 .92-.33 1.2-.83.56-1.01 1.63-1.81 3-2.08-.22-.73-.92-1.26-1.79-1.26-.32 0-.61.13-.86.34-.38.33-.86.66-1.4.66-.46 0-.88-.31-1.12-.77 1.69-.12 3.01-1.49 3.01-3.15 0-.5-.14-.96-.34-1.38h.08c.55 0 1-.45 1-1a1 1 0 0 0-.97-1c-.31 0-.69-.11-1.03-.24V7.94C17 5.17 15.36 3 12.166 3z"/></svg> },
                      { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> },
                      { key: 'phone', label: 'Phone', color: '#34a853', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.61 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.29 6.29l.61-.61a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg> },
                    ];
                    const filled = PLATFORMS.filter(p => socialLinks[p.key]?.trim());
                    if (filled.length === 0) return (
                      <p style={{ fontSize: '12px', color: 'var(--text-subtle)', padding: '4px 16px 14px', margin: 0 }}>No social links added yet</p>
                    );
                    return (
                      <div style={{ padding: '4px 16px 14px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {filled.map(p => (
                          <a key={p.key} href={socialLinks[p.key].startsWith('http') ? socialLinks[p.key] : (p.key === 'phone' ? `tel:${socialLinks[p.key]}` : `https://${socialLinks[p.key]}`)}
                            target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: p.key === 'snapchat' ? '#333' : `${p.color}15`, border: `1.5px solid ${p.color}30`, borderRadius: '12px', padding: '5px 10px', textDecoration: 'none', color: p.color === '#000' || p.color === '#010101' ? 'var(--text)' : p.color }}
                            title={p.label}
                          >
                            {p.icon}
                            <span style={{ fontSize: '11px', fontWeight: 700, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</span>
                          </a>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Edit form */}
                  {editingSocialLinks && (() => {
                    const PLATFORMS = [
                      { key: 'instagram', label: 'Instagram', color: '#E1306C', placeholder: 'https://instagram.com/yourname' },
                      { key: 'facebook', label: 'Facebook', color: '#1877F2', placeholder: 'https://facebook.com/yourname' },
                      { key: 'youtube', label: 'YouTube', color: '#FF0000', placeholder: 'https://youtube.com/@yourchannel' },
                      { key: 'twitter', label: 'X / Twitter', color: '#555', placeholder: 'https://x.com/yourhandle' },
                      { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', placeholder: 'https://linkedin.com/in/yourprofile' },
                      { key: 'github', label: 'GitHub', color: '#333', placeholder: 'https://github.com/yourusername' },
                      { key: 'tiktok', label: 'TikTok', color: '#555', placeholder: 'https://tiktok.com/@yourname' },
                      { key: 'snapchat', label: 'Snapchat', color: '#c8a800', placeholder: 'Your Snapchat username' },
                      { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', placeholder: '+91 9876543210' },
                      { key: 'phone', label: 'Phone', color: '#34a853', placeholder: '+91 9876543210' },
                    ];
                    return (
                      <div style={{ padding: '4px 14px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {PLATFORMS.map(p => (
                          <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: `${p.color}18`, border: `1.5px solid ${p.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: p.color === '#000' || p.color === '#010101' || p.color === '#333' ? 'var(--text-muted)' : p.color }}>
                              <span style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '-0.02em' }}>{p.label.slice(0,2).toUpperCase()}</span>
                            </div>
                            <input
                              type={p.key === 'phone' || p.key === 'whatsapp' ? 'tel' : 'url'}
                              placeholder={p.placeholder}
                              value={draftSocialLinks[p.key] || ''}
                              onChange={e => setDraftSocialLinks(prev => ({ ...prev, [p.key]: e.target.value }))}
                              className="msg-field"
                              style={{ flex: 1, borderRadius: '10px', padding: '7px 10px', fontSize: '12px', height: '34px' }}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* ── Sign Out ── */}
              <div style={{ padding: '6px 14px 24px' }}>
                <button
                  onClick={() => {
                    localStorage.removeItem('chapp_token');
                    localStorage.removeItem('chapp_user');
                    router.push('/login');
                  }}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: '18px',
                    border: '1.5px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.05)',
                    color: '#ef4444',
                    fontSize: '13px',
                    fontWeight: 700,
                    fontFamily: 'var(--font-jakarta)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.10)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.05)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
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
                    <button onClick={() => setActiveTab('profile')} className={`bottom-nav-item ${activeTab === 'profile' ? 'active' : ''}`}>
              <User className="w-5 h-5" />
              Profile
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
              className="flex items-center justify-between px-4 shrink-0"
              style={{ 
                background: 'var(--surface)', 
                borderBottom: '1px solid var(--border)',
                paddingLeft: 'calc(16px + env(safe-area-inset-left))',
                paddingRight: 'calc(16px + env(safe-area-inset-right))',
                paddingTop: 'calc(12px + env(safe-area-inset-top))',
                paddingBottom: '12px',
                minHeight: '64px'
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setActiveFriend(null)}
                  className="md:hidden p-2 rounded-full transition-colors mr-1"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border-light)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="relative shrink-0" style={{ cursor: 'pointer' }} onClick={() => setViewingUser(activeFriend)}>
                  <div className="avatar w-10 h-10 text-sm relative" style={{ background: getAvatarColor(activeFriend.username) }}>
                    {activeFriend.username.slice(0, 2)}
                    {activeFriend.avatar?.startsWith('http') && (
                      <img src={optimizeAvatarUrl(activeFriend.avatar)} alt={activeFriend.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                  {onlineFriends.get(activeFriend.id) === 'online' && (
                    <span className="status-dot status-online" style={{ borderColor: 'var(--surface)' }} />
                  )}
                </div>

                <div style={{ cursor: 'pointer' }} onClick={() => setViewingUser(activeFriend)}>
                  <h3 className="text-sm font-bold truncate flex items-center gap-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                    {renderUsername(activeFriend.username)}
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

              {/* Call Trigger Button */}
              <button
                onClick={() => {
                  const isOnline = onlineFriends.get(activeFriend.id) === 'online';
                  if (isOnline) {
                    initiateCall(activeFriend.id, activeFriend.username);
                  } else {
                    alert(`${activeFriend.username} is currently offline. You can only call friends who are active and online!`);
                  }
                }}
                className="p-2.5 rounded-full transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 flex items-center justify-center"
                style={{ 
                  background: onlineFriends.get(activeFriend.id) === 'online' ? 'var(--primary-light)' : 'var(--border-light)', 
                  color: onlineFriends.get(activeFriend.id) === 'online' ? 'var(--primary)' : 'var(--text-subtle)',
                  border: `1px solid ${onlineFriends.get(activeFriend.id) === 'online' ? 'var(--primary-container)' : 'var(--border)'}`,
                  opacity: onlineFriends.get(activeFriend.id) === 'online' ? 1 : 0.7
                }}
                title={onlineFriends.get(activeFriend.id) === 'online' ? "Start Voice Call" : `${activeFriend.username} is offline`}
              >
                <Phone className="w-4 h-4" />
              </button>
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
                  <p className="text-xs mt-1 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    <span>Say hi to</span>
                    {renderUsername(activeFriend.username)}
                    <span>! 👋</span>
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMe = msg.senderId === currentUser?.id;
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const isSameGroup = prevMsg && prevMsg.senderId === msg.senderId;

                  // Timestamp + tick icons
                  const tsColor = isMe ? 'rgba(255,255,255,0.75)' : 'var(--text-subtle)';
                  const TsRow = () => (
                    <div style={{
                      position: 'absolute',
                      bottom: '5px',
                      right: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      lineHeight: 1,
                      pointerEvents: 'none'
                    }}>
                      <span style={{ fontSize: '10px', color: tsColor, whiteSpace: 'nowrap' }}>
                        {formatTime(msg.timestamp)}
                      </span>
                      {isMe && (
                        <>
                          {msg.status === 'sending'   && <Clock      className="w-2.5 h-2.5" style={{ color: tsColor }} />}
                          {msg.status === 'delivered' && <Check      className="w-2.5 h-2.5" style={{ color: tsColor }} />}
                          {msg.status === 'ack'       && <CheckCheck className="w-2.5 h-2.5" style={{ color: tsColor }} />}
                        </>
                      )}
                    </div>
                  );

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        justifyContent: isMe ? 'flex-end' : 'flex-start',
                        marginTop: isSameGroup ? '2px' : '10px',
                        paddingLeft: isMe ? '52px' : '0',
                        paddingRight: isMe ? '0' : '52px',
                      }}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => { setHoveredMsgId(null); if (emojiPickerMsgId === msg.id) setEmojiPickerMsgId(null); }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                      }}
                      onTouchStart={(e) => {
                        touchData.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, isHorizontal: null };
                        longPressTimerRef.current = setTimeout(() => {
                          setMsgActionSheet({ msg, isMe });
                        }, 500);
                      }}
                      onTouchMove={(e) => {
                        const deltaX = e.touches[0].clientX - touchData.current.startX;
                        const deltaY = e.touches[0].clientY - touchData.current.startY;
                        if (touchData.current.isHorizontal === null) {
                          touchData.current.isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) + 5;
                        }
                        if (touchData.current.isHorizontal && deltaX > 0) {
                          if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                          const clampedX = Math.min(deltaX, 75);
                          const bubbleEl = e.currentTarget.querySelector('.swipe-bubble');
                          if (bubbleEl) bubbleEl.style.transform = `translateX(${clampedX}px)`;
                          const iconEl = e.currentTarget.querySelector('.swipe-icon');
                          if (iconEl) { const p = Math.min(clampedX / 55, 1); iconEl.style.opacity = p.toString(); iconEl.style.transform = `scale(${p})`; }
                        }
                      }}
                      onTouchEnd={(e) => {
                        const deltaX = e.changedTouches[0].clientX - touchData.current.startX;
                        const bubbleEl = e.currentTarget.querySelector('.swipe-bubble');
                        if (bubbleEl) { bubbleEl.style.transition = 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)'; bubbleEl.style.transform = 'translateX(0)'; setTimeout(() => { if (bubbleEl) bubbleEl.style.transition = ''; }, 300); }
                        const iconEl = e.currentTarget.querySelector('.swipe-icon');
                        if (iconEl) { iconEl.style.opacity = '0'; iconEl.style.transform = 'scale(0)'; }
                        if (touchData.current.isHorizontal && deltaX > 55) {
                          setReplyingTo({ id: msg.id, text: msg.text, senderId: msg.senderId, _selfId: currentUser?.id });
                        }
                        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                        touchData.current.isHorizontal = null;
                      }}
                    >
                      {/* Hover action row — absolutely positioned, zero layout impact, desktop only */}
                      {hoveredMsgId === msg.id && (
                        <div style={{
                          position: 'absolute',
                          top: '-30px',
                          [isMe ? 'right' : 'left']: '0',
                          display: 'flex', alignItems: 'center', gap: '4px',
                          zIndex: 10,
                          pointerEvents: 'auto',
                        }}>
                          <button
                            onClick={() => setReplyingTo({ id: msg.id, text: msg.text, senderId: msg.senderId, _selfId: currentUser?.id })}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', whiteSpace: 'nowrap' }}
                          >
                            <Reply style={{ width: '11px', height: '11px' }} /> Reply
                          </button>
                          <button
                            onClick={() => setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id)}
                            style={{ background: 'var(--surface)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '3px 8px', cursor: 'pointer', fontSize: '13px', boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}
                          >😊</button>
                          {isMe && (
                            <button
                              onClick={() => setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId })}
                              style={{ background: 'var(--surface)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '3px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', color: '#ef4444' }}
                            >
                              <Trash2 style={{ width: '11px', height: '11px' }} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Emoji picker — fixed overlay, no layout shift */}
                      {emojiPickerMsgId === msg.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setEmojiPickerMsgId(null)} />
                          <div style={{
                            position: 'absolute',
                            top: '-52px',
                            [isMe ? 'right' : 'left']: '0',
                            zIndex: 50,
                            display: 'flex', gap: '2px',
                            background: 'var(--surface)',
                            borderRadius: '24px',
                            padding: '6px 10px',
                            border: '1px solid var(--border-light)',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                            animation: 'slideUp 0.15s ease-out',
                          }}>
                            {['❤️','😂','😮','😢','😡','👍','🔥','🎉'].map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji);
                                  setEmojiPickerMsgId(null);
                                }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', padding: '2px 3px', borderRadius: '8px', transition: 'transform 0.1s', lineHeight: 1 }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.35)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                              >{emoji}</button>
                            ))}
                          </div>
                        </>
                      )}

                      {/* Swipe-to-reply indicator icon (appears on left during swipe) */}
                      <div className="swipe-icon" style={{ position: 'absolute', [isMe ? 'left' : 'right']: isMe ? '-32px' : '-32px', top: '50%', transform: 'translateY(-50%) scale(0)', opacity: 0, transition: 'none', width: '24px', height: '24px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                      </div>

                      {/* Column wrapper: bubble on top, reactions below */}
                      <div className="swipe-bubble" style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                      {/* Bubble */}
                      <div
                        className={isMe ? 'bubble-out' : 'bubble-in'}
                        style={{
                          position: 'relative',
                          maxWidth: '100%',
                          fontSize: '14px',
                          lineHeight: '1.4',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                        }}
                      >
                        {/* Reply quote block */}
                        {msg.replyTo && (
                          <div style={{ margin: '6px 8px 2px', padding: '5px 8px', borderRadius: '8px', borderLeft: '3px solid rgba(255,255,255,0.5)', background: isMe ? 'rgba(0,0,0,0.15)' : 'var(--border-light)', opacity: 0.9 }}>
                            <p style={{ fontSize: '10px', fontWeight: 700, margin: '0 0 1px', opacity: 0.8, color: isMe ? '#fff' : 'var(--primary)' }}>
                              {msg.replyTo.senderId === currentUser?.id ? 'You' : activeFriend?.username}
                            </p>
                            <p style={{ fontSize: '11px', margin: 0, opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px', color: isMe ? '#fff' : 'var(--text)' }}>
                              {msg.replyTo.text || '📎 Attachment'}
                            </p>
                          </div>
                        )}

                        {/* Text only — with extra right/bottom padding for timestamp */}
                        {msg.text && !msg.mediaUrl && (
                          <div style={{
                            padding: '7px 10px',
                            paddingBottom: '22px',
                            paddingRight: isMe ? '68px' : '52px',
                          }}>
                            {msg.text}
                            <TsRow />
                          </div>
                        )}

                        {/* Text + media */}
                        {msg.text && msg.mediaUrl && (
                          <div style={{ padding: '7px 10px 7px 10px' }}>
                            {msg.text}
                          </div>
                        )}

                        {/* Media */}
                        {msg.mediaUrl && (
                          <div style={{ borderRadius: '12px', overflow: 'hidden', margin: msg.text ? '0 0 0 0' : '0' }}>
                            {msg.mediaType === 'image' && (
                              <div style={{ position: 'relative' }} className="group">
                                <img
                                  src={ensureSecureUrl(msg.mediaUrl)}
                                  alt="Attachment"
                                  style={{ maxHeight: '220px', width: '100%', objectFit: 'cover', borderRadius: '12px', cursor: 'pointer', display: 'block' }}
                                  onClick={() => setPreviewImage(ensureSecureUrl(msg.mediaUrl))}
                                  onError={(e) => { e.target.style.display = 'none'; }}
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
                              <video src={ensureSecureUrl(msg.mediaUrl)} controls style={{ maxHeight: '240px', width: '100%', borderRadius: '12px', display: 'block' }} />
                            )}
                            {msg.mediaType !== 'image' && msg.mediaType !== 'video' && (
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '12px',
                                  padding: '10px 12px',
                                  margin: '4px',
                                  borderRadius: '10px',
                                  background: isMe ? 'rgba(255,255,255,0.15)' : 'var(--border-light)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                  <FileIcon className="w-4 h-4" style={{ flexShrink: 0 }} />
                                  <span style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>Document</span>
                                </div>
                                <button onClick={() => downloadFile(msg.mediaUrl, 'attachment')} style={{ flexShrink: 0 }}>
                                  <Download className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                            {/* Timestamp bar below media */}
                            <div style={{ padding: '3px 8px 5px', textAlign: 'right' }}>
                              <TsRow />
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Reactions — below bubble */}
                      {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '3px', marginBottom: '2px' }}>
                          {Object.entries(msg.reactions).map(([emoji, users]) => users.length > 0 && (
                            <button
                              key={emoji}
                              onClick={() => sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji)}
                              style={{ background: users.includes(currentUser?.id) ? 'rgba(99,102,241,0.15)' : 'var(--surface)', border: users.includes(currentUser?.id) ? '1.5px solid rgba(99,102,241,0.4)' : '1px solid var(--border-light)', borderRadius: '20px', padding: '2px 8px', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
                            >
                              {emoji}
                              {users.length > 1 && <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{users.length}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                      </div>{/* end swipe-bubble column */}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Mobile Message Action Sheet */}
            {msgActionSheet && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
                  onClick={() => setMsgActionSheet(null)}
                />
                <div style={{
                  position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
                  background: 'var(--surface)',
                  borderRadius: '24px 24px 0 0',
                  padding: '12px 0 32px',
                  boxShadow: '0 -8px 32px rgba(0,0,0,0.2)',
                  animation: 'slideUp 0.2s ease-out',
                }}>
                  {/* Drag handle */}
                  <div style={{ width: '36px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 16px' }} />

                  {/* Message preview */}
                  <div style={{ padding: '0 20px 14px', borderBottom: '1px solid var(--border-light)' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-subtle)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                      {msgActionSheet.msg.text || '📎 Attachment'}
                    </p>
                  </div>

                  {/* Emoji strip */}
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '14px 20px', borderBottom: '1px solid var(--border-light)' }}>
                    {['❤️','😂','😮','😢','😡','👍','🔥','🎉'].map(emoji => {
                      const msg = msgActionSheet.msg;
                      const isMe = msgActionSheet.isMe;
                      const reacted = msg.reactions?.[emoji]?.includes(currentUser?.id);
                      return (
                        <button
                          key={emoji}
                          onClick={() => {
                            sendReaction(msg.id, isMe ? msg.receiverId : msg.senderId, emoji);
                            setMsgActionSheet(null);
                          }}
                          style={{
                            background: reacted ? 'rgba(99,102,241,0.15)' : 'var(--surface-2)',
                            border: reacted ? '2px solid rgba(99,102,241,0.4)' : '1.5px solid var(--border-light)',
                            borderRadius: '50%', width: '44px', height: '44px',
                            cursor: 'pointer', fontSize: '22px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                        >{emoji}</button>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div style={{ padding: '8px 0' }}>
                    <button
                      onClick={() => {
                        setReplyingTo({ id: msgActionSheet.msg.id, text: msgActionSheet.msg.text, senderId: msgActionSheet.msg.senderId, _selfId: currentUser?.id });
                        setMsgActionSheet(null);
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: '15px', fontFamily: 'var(--font-jakarta)', fontWeight: 500 }}
                    >
                      <Reply style={{ width: '18px', height: '18px', color: 'var(--primary)' }} />
                      Reply
                    </button>
                    {msgActionSheet.isMe && (
                      <button
                        onClick={() => {
                          setDeleteTarget({ id: msgActionSheet.msg.id, senderId: msgActionSheet.msg.senderId, receiverId: msgActionSheet.msg.receiverId });
                          setMsgActionSheet(null);
                        }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 24px', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '15px', fontFamily: 'var(--font-jakarta)', fontWeight: 500 }}
                      >
                        <Trash2 style={{ width: '18px', height: '18px' }} />
                        Delete message
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Delete Message Confirmation Modal */}
            {deleteTarget && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.5)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  padding: '20px',
                }}
                onClick={() => setDeleteTarget(null)}
              >
                <div
                  style={{
                    background: 'var(--card)',
                    borderRadius: '16px',
                    padding: '24px',
                    maxWidth: '320px',
                    width: '100%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    border: '1px solid var(--border-light)',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Trash2 className="w-5 h-5" style={{ color: '#fff' }} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                        Delete Message
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        This will delete for everyone
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button
                      onClick={() => setDeleteTarget(null)}
                      style={{
                        flex: 1,
                        padding: '11px 16px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-light)',
                        background: 'transparent',
                        color: 'var(--text)',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-jakarta)',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-light)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (deleteTarget) {
                          const recipientId = deleteTarget.senderId === currentUser?.id
                            ? deleteTarget.receiverId
                            : deleteTarget.senderId;
                          await deleteMessage(deleteTarget.id, recipientId);
                          setDeleteTarget(null);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '11px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'var(--font-jakarta)',
                        transition: 'transform 0.15s, box-shadow 0.15s',
                        boxShadow: '0 4px 12px rgba(255,71,87,0.3)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,71,87,0.4)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,71,87,0.3)'; }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="msg-input shrink-0">
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

              <MessageInputBar
                onSendMessage={onSendMessage}
                pendingMedia={pendingMedia}
                uploading={uploading}
                fileInputRef={fileInputRef}
                triggerFileSelector={triggerFileSelector}
                handleFileUpload={handleFileUpload}
                emitTyping={emitTyping}
                activeFriendId={activeFriend.id}
              />
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
                    fontFamily: 'var(--font-jakarta)',
                    border: 'none',
                    outline: 'none',
                    boxShadow: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {tab === 'backup' && <Database className="w-3.5 h-3.5" />}
                  {tab === 'profile' ? 'Profile' : 'Backup & Sync'}
                </button>
              ))}
            </div>

            {/* Profile Tab */}
            {settingsTab === 'profile' && (
              <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Visual Avatar Preview & Cloudinary Upload */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', paddingBottom: '8px' }}>
                  <label 
                    className="w-24 h-24 rounded-full border-2 flex items-center justify-center overflow-hidden shrink-0 relative group cursor-pointer hover:opacity-95 active:scale-95 transition-all"
                    style={{ 
                      background: getAvatarColor(currentUser?.username),
                      borderColor: 'var(--primary)',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
                    }}
                    title="Click circle to directly upload avatar"
                  >
                    <span className="text-2xl font-bold text-white">{currentUser?.username?.slice(0, 2).toUpperCase()}</span>
                    {editAvatar?.startsWith('http') && (
                      <img src={optimizeAvatarUrl(editAvatar)} alt="preview" className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                    
                    {/* Hover Overlay with Camera Icon */}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-white gap-1 select-none">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-[9px] font-bold uppercase tracking-wider">Change</span>
                    </div>

                    {avatarUploading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <RefreshCw className="w-6 h-6 text-white animate-spin" />
                      </div>
                    )}

                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleAvatarUpload} 
                      className="hidden" 
                      disabled={avatarUploading}
                    />
                  </label>
                  <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-1 select-none">Tap circle to upload</p>
                  <div className="mt-2 text-base font-bold flex items-center gap-1.5" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>
                    @{renderUsername(currentUser?.username)}
                  </div>
                </div>


                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="label-text">Bio</label>
                  <textarea
                    placeholder="Tell your friends about you..."
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    rows={3}
                    className="modal-input resize-none"
                  />
                </div>
                {profileStatusMessage.text && (
                  <div
                    className="p-3 rounded-xl text-xs flex items-center justify-between gap-2 transition-all duration-200"
                    style={{
                      background: profileStatusMessage.type === 'success' ? '#e6f4ea' : profileStatusMessage.type === 'error' ? '#fce8e6' : 'var(--primary-light)',
                      color: profileStatusMessage.type === 'success' ? '#137333' : profileStatusMessage.type === 'error' ? '#c5221f' : 'var(--primary)',
                      border: `1px solid ${profileStatusMessage.type === 'success' ? '#ceead6' : profileStatusMessage.type === 'error' ? '#f28b82' : 'var(--primary-container)'}`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {avatarUploading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                      <span>{profileStatusMessage.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setProfileStatusMessage({ text: '', type: '' })}
                      className="p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer border-none shrink-0"
                      style={{ color: 'inherit' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div className="flex gap-3 pt-3">
                  <button type="button" onClick={() => { setShowSettings(false); setProfileStatusMessage({ text: '', type: '' }); }} className="btn-ghost flex-1">Cancel</button>
                  <button type="submit" className="btn-blue flex-1">Save Changes</button>
                </div>
              </form>
            )}

            {/* Backup Tab */}
            {settingsTab === 'backup' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
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

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '12px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>Daily Auto-Backup</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Encrypts and backs up chats in the background once a day.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoBackupEnabled}
                    onChange={handleToggleAutoBackup}
                    style={{
                      width: '16px',
                      height: '16px',
                      accentColor: 'var(--primary)',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  />
                </div>

                {backupStatusMessage.text && (
                  <div
                    className="p-3 rounded-xl text-xs flex items-center justify-between gap-2 transition-all duration-200"
                    style={{
                      background: backupStatusMessage.type === 'success' ? '#e6f4ea' : backupStatusMessage.type === 'error' ? '#fce8e6' : 'var(--primary-light)',
                      color: backupStatusMessage.type === 'success' ? '#137333' : backupStatusMessage.type === 'error' ? '#c5221f' : 'var(--primary)',
                      border: `1px solid ${backupStatusMessage.type === 'success' ? '#ceead6' : backupStatusMessage.type === 'error' ? '#f28b82' : 'var(--primary-container)'}`
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {backupLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                      <span>{backupStatusMessage.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBackupStatusMessage({ text: '', type: '' })}
                      className="p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer border-none shrink-0"
                      style={{ color: 'inherit' }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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

                <div className="flex gap-3 pt-3">
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

      {/* ═══════════════════════════════════════
          IMAGE LIGHTBOX PREVIEW MODAL
          ═══════════════════════════════════════ */}
      {previewImage && (
        <div 
          className="modal-overlay animate-fade-in" 
          style={{ 
            zIndex: 9999, 
            background: 'rgba(0, 0, 0, 0.92)', 
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
          }}
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="animate-zoom-in"
            style={{ 
              position: 'relative', 
              maxWidth: '90vw', 
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Top Bar for close and download */}
            <div style={{
              position: 'absolute',
              top: '-55px',
              right: '0',
              display: 'flex',
              gap: '12px',
              zIndex: 10000
            }}>
              <button
                onClick={() => downloadFile(previewImage, 'download.jpg')}
                className="p-2.5 rounded-full transition-all text-white bg-white/10 hover:bg-white/20 active:scale-95 cursor-pointer"
                title="Download Image"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-2.5 rounded-full transition-all text-white bg-white/10 hover:bg-white/20 active:scale-95 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <img
              src={previewImage}
              alt="Enlarged view"
              style={{
                maxWidth: '100%',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: '16px',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)',
                border: '1px solid rgba(255,255,255,0.15)'
              }}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          VOICE CALL OVERLAY MODAL
          ═══════════════════════════════════════ */}
      {callState !== 'idle' && callPartner && (
        <div 
          className="modal-overlay animate-fade-in" 
          style={{ 
            zIndex: 10001, 
            background: 'rgba(10, 11, 14, 0.95)', 
            backdropFilter: 'blur(15px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
          }}
        >
          <div 
            className="animate-zoom-in"
            style={{ 
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '24px',
              padding: '40px',
              width: '100%',
              maxWidth: '360px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 30px 60px rgba(0,0,0,0.6)',
            }}
          >
            {/* Pulsing Ring Avatar Container */}
            {(() => {
              const partner = dbFriends.find(f => f.id === callPartner.id) || callPartner;
              return (
                <div style={{ position: 'relative', marginBottom: '24px' }}>
                  <div 
                    className={callState === 'ringing' || callState === 'calling' ? 'animate-ping' : ''}
                    style={{
                      position: 'absolute',
                      inset: '-10px',
                      borderRadius: '50%',
                      background: 'var(--primary-light)',
                      opacity: 0.15,
                      animationDuration: '2s'
                    }}
                  />
                  <div 
                    className="w-24 h-24 rounded-full text-2xl font-bold text-white flex items-center justify-center shadow-2xl relative z-10 overflow-hidden"
                    style={{ 
                      background: getAvatarColor(partner.username),
                      boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
                    }}
                  >
                    {partner.username?.slice(0, 2).toUpperCase()}
                    {partner.avatar?.startsWith('http') && (
                      <img src={optimizeAvatarUrl(partner.avatar)} alt={partner.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Title / Partner name */}
            <h2 className="flex items-center gap-1.5 justify-center" style={{ 
              fontSize: '20px', 
              fontWeight: 700, 
              color: '#fff', 
              fontFamily: 'var(--font-display)',
              marginBottom: '8px'
            }}>
              {renderUsername(callPartner.username)}
            </h2>

            {/* Calling state description */}
            <p style={{ 
              fontSize: '13px', 
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '40px',
              fontWeight: 500
            }}>
              {callState === 'calling' && 'Calling... 📞'}
              {callState === 'ringing' && 'Incoming Voice Call... 🔔'}
              {callState === 'connected' && (
                <span className="flex items-center gap-1.5 justify-center" style={{ color: 'var(--online)' }}>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected — {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, '0')}
                </span>
              )}
            </p>

            {/* Action Buttons */}
            <div className="flex items-center gap-6 justify-center w-full">
              {/* Incoming Call Buttons */}
              {callState === 'ringing' && (
                <>
                  <button
                    onClick={rejectIncomingCall}
                    className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all text-white flex items-center justify-center cursor-pointer shadow-lg border-none"
                    title="Decline Call"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                  <button
                    onClick={answerIncomingCall}
                    className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 hover:scale-105 active:scale-95 transition-all text-white flex items-center justify-center cursor-pointer shadow-lg border-none"
                    title="Accept Call"
                  >
                    <Phone className="w-6 h-6" />
                  </button>
                </>
              )}

              {/* Outgoing Call / Active Connected Call Buttons */}
              {(callState === 'calling' || callState === 'connected') && (
                <>
                  {callState === 'connected' && (
                    <>
                      <button
                        onClick={toggleMute}
                        className="w-12 h-12 rounded-full transition-all flex items-center justify-center cursor-pointer shadow-md"
                        style={{
                          background: isMuted ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                          color: '#fff',
                          border: '1px solid rgba(255,255,255,0.1)'
                        }}
                        title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
                      >
                        {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                      </button>

                      <div className="relative">
                        <button
                          onClick={() => setShowAudioMenu(!showAudioMenu)}
                          className="w-12 h-12 rounded-full transition-all flex items-center justify-center cursor-pointer shadow-md"
                          style={{
                            background: showAudioMenu || speakerMode ? 'var(--primary)' : 'rgba(255,255,255,0.08)',
                            color: '#fff',
                            border: showAudioMenu || speakerMode ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.1)'
                          }}
                          title="Change Audio Route"
                        >
                          <Volume2 className="w-5 h-5" />
                        </button>
                        
                        {showAudioMenu && (
                          <>
                            {/* Tap-to-close backdrop */}
                            <div
                              onClick={() => setShowAudioMenu(false)}
                              style={{
                                position: 'fixed',
                                top: 0,
                                left: 0,
                                width: '100vw',
                                height: '100vh',
                                zIndex: 10002,
                                background: 'rgba(0,0,0,0.3)',
                              }}
                            />
                            <div 
                              style={{
                                position: 'fixed',
                                bottom: '120px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '280px',
                                maxWidth: 'calc(100vw - 40px)',
                                borderRadius: '24px',
                                padding: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                zIndex: 10003,
                                background: 'rgba(23, 23, 23, 0.97)',
                                backdropFilter: 'blur(24px)',
                                border: '1px solid rgba(255, 255, 255, 0.15)',
                                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
                              }}
                            >
                              <div className="text-xs uppercase font-bold tracking-wider px-4 py-2" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                                Audio Route
                              </div>
                              
                              {audioOutputs.length === 0 ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (speakerMode) {
                                        await toggleSpeakerMode();
                                      }
                                      setShowAudioMenu(false);
                                    }}
                                    className="w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all text-white border-none cursor-pointer"
                                    style={{
                                      background: !speakerMode ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                    }}
                                  >
                                    <Phone className="w-5 h-5 shrink-0" />
                                    <span className="flex-1 truncate">Earpiece / Headset</span>
                                    {!speakerMode && <Check className="w-5 h-5 shrink-0 text-emerald-400" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!speakerMode) {
                                        await toggleSpeakerMode();
                                      }
                                      setShowAudioMenu(false);
                                    }}
                                    className="w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all text-white border-none cursor-pointer"
                                    style={{
                                      background: speakerMode ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                    }}
                                  >
                                    <Volume2 className="w-5 h-5 shrink-0" />
                                    <span className="flex-1 truncate">Speakerphone</span>
                                    {speakerMode && <Check className="w-5 h-5 shrink-0 text-emerald-400" />}
                                  </button>
                                </>
                              ) : (
                                audioOutputs.map(dev => {
                                  const label = dev.label || 'Unknown Output';
                                  const isSelected = currentSinkId === dev.deviceId || (dev.deviceId === 'default' && !currentSinkId);
                                  
                                  let DeviceIcon = Volume2;
                                  if (label.toLowerCase().includes('bluetooth') || label.toLowerCase().includes('wireless') || label.toLowerCase().includes('buds') || label.toLowerCase().includes('pods')) {
                                    DeviceIcon = Bluetooth;
                                  } else if (label.toLowerCase().includes('headphone') || label.toLowerCase().includes('headset') || label.toLowerCase().includes('audio jack')) {
                                    DeviceIcon = Headphones;
                                  } else if (label.toLowerCase().includes('earpiece') || label.toLowerCase().includes('receiver') || label.toLowerCase().includes('handset')) {
                                    DeviceIcon = Phone;
                                  } else if (label.toLowerCase().includes('speaker') || label.toLowerCase().includes('loudspeaker')) {
                                    DeviceIcon = Volume2;
                                  }
                                  
                                  return (
                                    <button
                                      key={dev.deviceId}
                                      type="button"
                                      onClick={async () => {
                                        await setAudioOutputDevice(dev.deviceId);
                                        setShowAudioMenu(false);
                                      }}
                                      className="w-full text-left px-4 py-3.5 rounded-2xl text-sm font-semibold flex items-center gap-3 transition-all text-white border-none cursor-pointer"
                                      style={{
                                        background: isSelected ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                      }}
                                    >
                                      <DeviceIcon className="w-5 h-5 shrink-0" style={{ color: isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.6)' }} />
                                      <span className="flex-1 truncate">{label}</span>
                                      {isSelected && <Check className="w-5 h-5 shrink-0 text-emerald-400" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}

                  <button
                    onClick={callState === 'calling' ? rejectIncomingCall : endActiveCall}
                    className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 hover:scale-105 active:scale-95 transition-all text-white flex items-center justify-center cursor-pointer shadow-lg border-none"
                    title="End Call"
                  >
                    <PhoneOff className="w-6 h-6" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          USER PROFILE MODAL
          ═══════════════════════════════════════ */}
      {viewingUser && (() => {
        const isFriend = dbFriends.some(f => f.id === viewingUser.id);
        const isOnline = onlineFriends.get(viewingUser.id) === 'online';
        const isMe = viewingUser.id === currentUser?.id;
        return (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            }}
            onClick={() => setViewingUser(null)}
          >
            <div
              style={{
                width: '100%', maxWidth: '420px',
                background: 'var(--surface)',
                borderRadius: '28px 28px 0 0',
                overflow: 'hidden',
                boxShadow: '0 -8px 40px rgba(0,0,0,0.25)',
                animation: 'slideUp 0.28s cubic-bezier(0.34,1.56,0.64,1)',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Banner */}
              <div style={{
                height: '110px', position: 'relative', flexShrink: 0,
                background: viewingUser.banner
                  ? 'transparent'
                  : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 40%, #ec4899 80%, #f97316 100%)',
              }}>
                {viewingUser.banner && (
                  <img src={viewingUser.banner} alt="banner" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                )}
                {!viewingUser.banner && (
                  <>
                    <div style={{ position: 'absolute', top: '-20px', left: '-10px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.10)', filter: 'blur(16px)' }} />
                    <div style={{ position: 'absolute', bottom: '-10px', right: '20px', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(255,255,255,0.08)', filter: 'blur(12px)' }} />
                  </>
                )}
                {/* Close button */}
                <button
                  onClick={() => setViewingUser(null)}
                  style={{ position: 'absolute', top: '10px', right: '12px', background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Avatar overlapping banner */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-38px', paddingBottom: '20px' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  {/* Glow ring */}
                  <div style={{ position: 'absolute', inset: '-3px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #ec4899)', opacity: 0.7, filter: 'blur(4px)', zIndex: 0 }} />
                  <div style={{
                    width: '76px', height: '76px', borderRadius: '50%',
                    border: '3px solid var(--surface)',
                    background: getAvatarColor(viewingUser.username),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden', position: 'relative', zIndex: 1,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                    fontSize: '22px', fontWeight: 800, color: '#fff',
                    fontFamily: 'var(--font-jakarta)',
                  }}>
                    {viewingUser.username?.slice(0, 2)}
                    {viewingUser.avatar?.startsWith('http') && (
                      <img src={optimizeAvatarUrl(viewingUser.avatar)} alt={viewingUser.username} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display='none'} />
                    )}
                  </div>
                  {/* Online dot */}
                  {isOnline && (
                    <span style={{ position: 'absolute', bottom: '4px', right: '4px', width: '13px', height: '13px', borderRadius: '50%', background: '#34a853', border: '2.5px solid var(--surface)', zIndex: 2 }} />
                  )}
                </div>

                {/* Name & handle */}
                <h2 style={{ margin: '10px 0 2px', fontSize: '17px', fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-jakarta)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {renderUsername(viewingUser.username)}
                </h2>
                <p style={{ fontSize: '12px', color: 'var(--text-subtle)', margin: 0 }}>@{viewingUser.username?.toLowerCase()}</p>

                {/* Status pill */}
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px', background: isOnline ? 'rgba(52,168,83,0.10)' : 'var(--border-light)', border: `1px solid ${isOnline ? 'rgba(52,168,83,0.25)' : 'var(--border)'}`, borderRadius: '20px', padding: '3px 10px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: isOnline ? '#34a853' : 'var(--text-subtle)', display: 'inline-block' }} />
                  <span style={{ fontSize: '10px', fontWeight: 700, color: isOnline ? '#34a853' : 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{isOnline ? 'Online' : 'Offline'}</span>
                </div>

                {/* Bio */}
                {viewingUser.bio && (
                  <p style={{ margin: '12px 20px 0', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', textAlign: 'center' }}>
                    {viewingUser.bio}
                  </p>
                )}

                {/* Social Links in modal */}
                {viewingUser.socialLinks && Object.values(viewingUser.socialLinks).some(v => v) && (() => {
                  const PLATFORMS = [
                    { key: 'instagram', label: 'Instagram', color: '#E1306C' },
                    { key: 'facebook', label: 'Facebook', color: '#1877F2' },
                    { key: 'youtube', label: 'YouTube', color: '#FF0000' },
                    { key: 'twitter', label: 'X', color: '#555' },
                    { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
                    { key: 'github', label: 'GitHub', color: '#333' },
                    { key: 'tiktok', label: 'TikTok', color: '#555' },
                    { key: 'snapchat', label: 'Snapchat', color: '#c8a800' },
                    { key: 'whatsapp', label: 'WhatsApp', color: '#25D366' },
                    { key: 'phone', label: 'Phone', color: '#34a853' },
                  ];
                  const filled = PLATFORMS.filter(p => viewingUser.socialLinks[p.key]?.trim());
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', padding: '10px 16px 0' }}>
                      {filled.map(p => (
                        <a key={p.key}
                          href={viewingUser.socialLinks[p.key].startsWith('http') ? viewingUser.socialLinks[p.key] : (p.key === 'phone' || p.key === 'whatsapp' ? `tel:${viewingUser.socialLinks[p.key]}` : `https://${viewingUser.socialLinks[p.key]}`)}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: `${p.color}18`, border: `1.5px solid ${p.color}35`, borderRadius: '20px', padding: '4px 10px', textDecoration: 'none', color: ['#000','#010101','#333'].includes(p.color) ? 'var(--text-muted)' : p.color, fontSize: '11px', fontWeight: 700 }}
                          title={p.label}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor', display: 'inline-block', opacity: 0.7 }} />
                          {p.label}
                        </a>
                      ))}
                    </div>
                  );
                })()}

                {/* Friend badge */}
                {isFriend && (
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.20)', borderRadius: '20px', padding: '4px 12px' }}>
                    <Users style={{ width: '11px', height: '11px', color: '#6366f1' }} />
                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#6366f1', letterSpacing: '0.05em' }}>FRIENDS</span>
                  </div>
                )}

                {/* Action buttons */}
                {!isMe && (
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px', padding: '0 20px', width: '100%', boxSizing: 'border-box' }}>
                    {/* Message button */}
                    <button
                      onClick={() => {
                        if (isFriend) {
                          setActiveFriend(viewingUser);
                          db.chats.put({ friendId: viewingUser.id, lastMessageText: '', lastMessageTime: Date.now(), unreadCount: 0 }).catch(() => {});
                          setActiveTab('chats');
                        }
                        setViewingUser(null);
                      }}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '16px', border: 'none',
                        background: isFriend ? 'var(--primary)' : 'var(--border-light)',
                        color: isFriend ? '#fff' : 'var(--text-subtle)',
                        fontSize: '13px', fontWeight: 700, cursor: isFriend ? 'pointer' : 'not-allowed',
                        fontFamily: 'var(--font-jakarta)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        opacity: isFriend ? 1 : 0.5,
                        transition: 'all 0.18s',
                      }}
                      title={isFriend ? 'Open chat' : 'Add as friend first'}
                    >
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </button>

                    {/* Add friend / Friends indicator button */}
                    {!isFriend ? (
                      <button
                        onClick={async () => {
                          setViewingUserAdding(true);
                          const token = localStorage.getItem('chapp_token');
                          try {
                            const res = await fetch(`${BACKEND_URL}/api/friends/request`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                              body: JSON.stringify({ username: viewingUser.username }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'Failed');
                            confetti({ particleCount: 50, spread: 40, origin: { y: 0.6 }, colors: ['#6366f1','#a5b4fc','#ec4899'] });
                            refreshFriendsAndRequests(token);
                            setViewingUser(null);
                          } catch (err) {
                            alert(err.message);
                          } finally {
                            setViewingUserAdding(false);
                          }
                        }}
                        disabled={viewingUserAdding}
                        style={{
                          flex: 1, padding: '12px', borderRadius: '16px', border: '1.5px solid var(--primary)',
                          background: 'var(--primary-light)', color: 'var(--primary)',
                          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                          fontFamily: 'var(--font-jakarta)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          transition: 'all 0.18s',
                        }}
                      >
                        {viewingUserAdding ? (
                          <span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                        ) : (
                          <><UserPlus className="w-4 h-4" />Add Friend</>
                        )}
                      </button>
                    ) : (
                      <div style={{
                        flex: 1, padding: '12px', borderRadius: '16px',
                        background: 'rgba(52,168,83,0.08)', border: '1.5px solid rgba(52,168,83,0.25)',
                        color: '#34a853', fontSize: '13px', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        fontFamily: 'var(--font-jakarta)',
                      }}>
                        <Check className="w-4 h-4" />
                        Friends
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}