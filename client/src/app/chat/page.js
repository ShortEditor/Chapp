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
  Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { encryptData, decryptData } from '@/lib/crypto';

let BACKEND_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || 'https://chapp-oxa7.onrender.com').replace(/^["']|["']$/g, '');
if (typeof window !== 'undefined' && (BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1'))) {
  const hostname = window.location.hostname;
  if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    BACKEND_URL = BACKEND_URL.replace('localhost', hostname).replace('127.0.0.1', hostname);
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

const MessageInputBar = React.memo(({ onSendMessage, pendingMedia, uploading, fileInputRef, triggerFileSelector, handleFileUpload, emitTyping, activeFriendId }) => {
  const [inputText, setInputText] = useState('');
  const typingTimeoutRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const success = await onSendMessage(inputText);
    if (success !== false) {
      setInputText('');
    }
  };

  const handleKeyDown = (e) => {
    if (inputText.length === 0) {
      emitTyping(activeFriendId, true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(activeFriendId, false);
    }, 2000);
  };

  return (
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
        type="text"
        placeholder="Type a message..."
        value={inputText}
        onChange={e => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="msg-field"
      />

      <button
        type="submit"
        disabled={!inputText.trim() && !pendingMedia}
        className="w-11 h-11 rounded-full text-white shrink-0 flex items-center justify-center transition-all disabled:opacity-40 disabled:pointer-events-none hover:scale-105 active:scale-95 shadow-md border-none cursor-pointer"
        style={{ 
          background: 'linear-gradient(135deg, var(--primary) 0%, #4a5cf6 100%)',
          boxShadow: '0 4px 12px rgba(26, 115, 232, 0.25)'
        }}
      >
        <Send className="w-5 h-5" style={{ transform: 'rotate(-15deg) translate(1px, -1px)' }} />
      </button>
    </form>
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
  const [customStatus, setCustomStatus] = useState('');

  // Zero-Knowledge Backup states
  const [settingsTab, setSettingsTab] = useState('profile'); // 'profile' | 'backup'
  const [backupPassword, setBackupPassword] = useState('');
  const [backupStatusMessage, setBackupStatusMessage] = useState({ text: '', type: '' });
  const [backupLoading, setBackupLoading] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);

  // Media upload states
  const [uploading, setUploading] = useState(false);
  const [pendingMedia, setPendingMedia] = useState(null); // { url, type, name }
  const [previewImage, setPreviewImage] = useState(null); // Full-screen image preview

  // Message delete (unsend) states
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, senderId, receiverId }
  const longPressTimerRef = useRef(null);

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
      const res = await fetch(`${BACKEND_URL}/api/backup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ encryptedBackup: encryptedBlob })
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error || 'Server rejected the backup.');
        } else {
          throw new Error('Backend unavailable (Did you set NEXT_PUBLIC_BACKEND_URL on Vercel?).');
        }
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
         throw new Error('Backend unavailable (Did you set NEXT_PUBLIC_BACKEND_URL on Vercel?).');
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
      pendingMedia?.type || null
    );

    if (!result) {
      setSendError('Failed to save message. IndexedDB may be full.');
      setTimeout(() => setSendError(''), 4000);
      return false;
    }

    setPendingMedia(null);
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
                        <div className="avatar w-10 h-10 text-xs relative" style={{ background: getAvatarColor(friend.username) }}>
                          {friend.username.slice(0, 2)}
                          {friend.avatar?.startsWith('http') && (
                            <img src={optimizeAvatarUrl(friend.avatar)} alt={friend.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                          )}
                        </div>
                        {isOnline && <span className="status-dot status-online" style={{ borderColor: 'var(--surface-2)' }} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate flex items-center gap-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>{renderUsername(friend.username)}</p>
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
                        <div className="avatar w-10 h-10 text-xs shrink-0 relative" style={{ background: getAvatarColor(u.username) }}>
                          {u.username.slice(0, 2)}
                          {u.avatar?.startsWith('http') && (
                            <img src={optimizeAvatarUrl(u.avatar)} alt={u.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>{renderUsername(u.username)}</p>
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
          {/* ── PROFILE TAB ── */}
          {activeTab === 'profile' && (
            <div className="p-4">
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>Your Profile</h2>
              <div className="flex items-center gap-4 mt-4">
                <div className="avatar w-12 h-12 text-sm relative" style={{ background: getAvatarColor(currentUser?.username) }}>
                  {currentUser?.username?.slice(0, 2)}
                  {currentUser?.avatar?.startsWith('http') && (
                    <img src={optimizeAvatarUrl(currentUser.avatar)} alt={currentUser?.username} className="w-full h-full object-cover" style={{ position: 'absolute', top: 0, left: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                </div>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text)', fontFamily: 'var(--font-jakarta)' }}>{renderUsername(currentUser?.username)}</p>
                  <p className="text-xs text-muted">{currentUser?.bio || 'No bio set.'}</p>
                </div>
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

                <div className="relative shrink-0">
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

                <div>
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
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                      }}
                      onTouchStart={() => {
                        longPressTimerRef.current = setTimeout(() => {
                          setDeleteTarget({ id: msg.id, senderId: msg.senderId, receiverId: msg.receiverId });
                        }, 600);
                      }}
                      onTouchEnd={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                      onTouchMove={() => {
                        if (longPressTimerRef.current) {
                          clearTimeout(longPressTimerRef.current);
                          longPressTimerRef.current = null;
                        }
                      }}
                    >
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
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

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
    </div>
  );
}