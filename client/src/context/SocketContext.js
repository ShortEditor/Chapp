'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import db from '../db/localDb';
import {
  generateE2EEKeyPair,
  deriveSharedKey,
  encryptWithSharedKey,
  decryptWithSharedKey
} from '../lib/crypto';

const SocketContext = createContext(null);

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


const peerConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [typingFriends, setTypingFriends] = useState(new Set());
  const [onlineFriends, setOnlineFriends] = useState(new Map());
  const [groups, setGroups] = useState([]);

  // Use a ref for the socket so callbacks always access the latest instance
  // without stale closure bugs from useState
  const socketRef = useRef(null);
  const activeChatRef = useRef(null);

  // Expose socket state for components that need to check connection
  const [socket, setSocket] = useState(null);

  // WebRTC Calling States
  const [callState, setCallState] = useState('idle'); // 'idle' | 'calling' | 'ringing' | 'connected'
  const [callPartner, setCallPartner] = useState(null); // { id, username }
  const [isMuted, setIsMuted] = useState(false);
  const [speakerMode, setSpeakerMode] = useState(false);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [currentSinkId, setCurrentSinkId] = useState('');
  const [callDuration, setCallDuration] = useState(0);

  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callTimerRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const ringbackAudioRef = useRef(null);
  const incomingAudioRef = useRef(null);

  const sharedKeyCacheRef = useRef(new Map());

  const getSharedKey = useCallback(async (friendId) => {
    if (sharedKeyCacheRef.current.has(friendId)) {
      return sharedKeyCacheRef.current.get(friendId);
    }
    
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
    const token = localStorage.getItem('chapp_token');
    if (!currentUser.id || !token) return null;

    // 1. Get own private key
    const ownPrivateKeyRecord = await db.e2eeKeys.get('private_key_' + currentUser.id);
    if (!ownPrivateKeyRecord) {
      console.warn('⚠️ [E2EE] Own private key not found in local IndexedDB');
      return null;
    }

    // 2. Get friend's public key
    let friend = await db.friends.get(friendId);
    let friendPublicKeyJwk = null;
    
    if (friend && friend.publicKey) {
      try {
        friendPublicKeyJwk = typeof friend.publicKey === 'string' ? JSON.parse(friend.publicKey) : friend.publicKey;
      } catch (_) {}
    }

    if (!friendPublicKeyJwk) {
      console.log(`🔑 [E2EE] Fetching public key for friend ${friendId} from server...`);
      try {
        const res = await fetch(`${BACKEND_URL}/api/users/${friendId}/public-key`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.publicKey) {
            friendPublicKeyJwk = typeof data.publicKey === 'string' ? JSON.parse(data.publicKey) : data.publicKey;
            // Cache in friends DB
            if (friend) {
              await db.friends.update(friendId, { publicKey: data.publicKey });
            }
          }
        }
      } catch (err) {
        console.error('❌ [E2EE] Failed to fetch friend public key:', err);
      }
    }

    if (!friendPublicKeyJwk) {
      console.warn(`⚠️ [E2EE] Could not obtain public key for friend ${friendId}`);
      return null;
    }

    // 3. Derive shared key
    try {
      const sharedKey = await deriveSharedKey(ownPrivateKeyRecord.key, friendPublicKeyJwk);
      sharedKeyCacheRef.current.set(friendId, sharedKey);
      return sharedKey;
    } catch (err) {
      console.error('❌ [E2EE] Error deriving shared key:', err);
      return null;
    }
  }, []);

  const initializeE2EEKeys = useCallback(async (userId, token) => {
    try {
      if (!userId) return;
      const privateKeyRecord = await db.e2eeKeys.get('private_key_' + userId);
      
      let publicKeyJwk;
      if (!privateKeyRecord) {
        console.log('🔑 [E2EE] No local keys found for user. Generating new ECDH keypair...');
        const keys = await generateE2EEKeyPair();
        await db.e2eeKeys.put({ id: 'private_key_' + userId, key: keys.privateKeyJwk });
        await db.e2eeKeys.put({ id: 'public_key_' + userId, key: keys.publicKeyJwk });
        publicKeyJwk = keys.publicKeyJwk;
        
        console.log('🔑 [E2EE] Uploading public key to server...');
        await fetch(`${BACKEND_URL}/api/users/profile/public-key`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ publicKey: JSON.stringify(publicKeyJwk) })
        });
      } else {
        console.log('🔑 [E2EE] Local keys loaded.');
        // Ensure server has it (e.g. if database reset)
        const userJson = localStorage.getItem('chapp_user');
        if (userJson) {
          const user = JSON.parse(userJson);
          if (!user.publicKey) {
            const pubKeyRecord = await db.e2eeKeys.get('public_key_' + userId);
            if (pubKeyRecord) {
              console.log('🔑 [E2EE] Server missing public key. Uploading local key...');
              await fetch(`${BACKEND_URL}/api/users/profile/public-key`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ publicKey: JSON.stringify(pubKeyRecord.key) })
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('❌ [E2EE] Key initialization failed:', err);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      ringbackAudioRef.current = new Audio('/ringback.mp3');
      ringbackAudioRef.current.loop = true;
      incomingAudioRef.current = new Audio('/incoming.mp3');
      incomingAudioRef.current.loop = true;
    }
  }, []);

  useEffect(() => {
    if (!ringbackAudioRef.current || !incomingAudioRef.current) return;
    
    if (callState === 'calling') {
      ringbackAudioRef.current.play().catch(e => console.warn('Ringback play blocked', e));
      incomingAudioRef.current.pause();
      incomingAudioRef.current.currentTime = 0;
    } else if (callState === 'ringing') {
      incomingAudioRef.current.play().catch(e => console.warn('Incoming play blocked', e));
      ringbackAudioRef.current.pause();
      ringbackAudioRef.current.currentTime = 0;
    } else {
      ringbackAudioRef.current.pause();
      ringbackAudioRef.current.currentTime = 0;
      incomingAudioRef.current.pause();
      incomingAudioRef.current.currentTime = 0;
    }
  }, [callState]);
  const cleanupCall = useCallback(() => {
    console.log('🧹 [WebRTC] Cleaning up call state and streams...');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    remoteStreamRef.current = null;
    pendingCandidatesRef.current = [];
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
    setCallState('idle');
    setCallPartner(null);
    setIsMuted(false);
    setSpeakerMode(false);
    setAudioOutputs([]);
    setCurrentSinkId('');
    setCallDuration(0);
  }, []);

  const startCallTimer = () => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  };

  const initiateCall = useCallback(async (friendId, friendUsername) => {
    try {
      console.log(`📞 [WebRTC] Initiating P2P call to: ${friendUsername}`);
      setCallState('calling');
      setCallPartner({ id: friendId, username: friendUsername });
      setCallDuration(0);

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(peerConfiguration);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', { to: friendId, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log('🔊 [WebRTC] Remote stream arrived!');
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.play().catch(e => {
              console.warn('🔊 [WebRTC] Playback blocked or failed:', e);
            });
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (socketRef.current) {
        socketRef.current.emit('call-user', { to: friendId, offer });
      }
    } catch (err) {
      console.error('❌ [WebRTC] Failed to initiate call:', err);
      cleanupCall();
      alert('Could not access microphone for voice calling.');
    }
  }, [cleanupCall]);

  const answerIncomingCall = useCallback(async () => {
    if (!callPartner || callState !== 'ringing') return;
    try {
      console.log('📞 [WebRTC] Answering call from:', callPartner.username);
      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      localStreamRef.current = localStream;

      const pc = new RTCPeerConnection(peerConfiguration);
      peerConnectionRef.current = pc;

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          socketRef.current.emit('ice-candidate', { to: callPartner.id, candidate: event.candidate });
        }
      };

      pc.ontrack = (event) => {
        console.log('🔊 [WebRTC] Remote stream arrived!');
        if (event.streams && event.streams[0]) {
          remoteStreamRef.current = event.streams[0];
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.play().catch(e => {
              console.warn('🔊 [WebRTC] Playback blocked or failed:', e);
            });
          }
        }
      };

      const currentOffer = peerConnectionRef.current_offer;
      if (currentOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(currentOffer));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (socketRef.current) {
        socketRef.current.emit('accept-call', { to: callPartner.id, answer });
      }

      setCallState('connected');
      startCallTimer();

      // Process queued ICE candidates
      while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift();
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch (err) {
          console.error('Error processing queued ICE candidate:', err);
        }
      }
    } catch (err) {
      console.error('❌ [WebRTC] Failed to answer call:', err);
      cleanupCall();
    }
  }, [callPartner, callState, cleanupCall]);

  const rejectIncomingCall = useCallback(() => {
    if (socketRef.current && callPartner) {
      socketRef.current.emit('reject-call', { to: callPartner.id });
    }
    cleanupCall();
  }, [callPartner, cleanupCall]);

  const endActiveCall = useCallback(() => {
    if (socketRef.current && callPartner) {
      socketRef.current.emit('end-call', { to: callPartner.id });
    }
    cleanupCall();
  }, [callPartner, cleanupCall]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(prev => !prev);
    }
  }, []);

  const enumerateAudioOutputs = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        console.log('🔊 [WebRTC] Available audio outputs:', outputs);
        setAudioOutputs(outputs);
        if (remoteAudioRef.current) {
          const currentSink = remoteAudioRef.current.sinkId || '';
          setCurrentSinkId(currentSink);
        }
      }
    } catch (err) {
      console.warn('⚠️ [WebRTC] Failed to enumerate audio devices:', err);
    }
  }, []);

  useEffect(() => {
    if (callState === 'connected') {
      // Small delay to let stream fully bind
      const timer = setTimeout(() => {
        enumerateAudioOutputs();
      }, 500);

      const handleDeviceChange = () => {
        console.log('🔊 [WebRTC] Audio devices changed, re-enumerating...');
        enumerateAudioOutputs();
      };

      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
      }

      return () => {
        clearTimeout(timer);
        if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
          navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        }
      };
    }
  }, [callState, enumerateAudioOutputs]);

  const setAudioOutputDevice = useCallback(async (sinkId) => {
    if (!remoteAudioRef.current) return;
    try {
      if (typeof remoteAudioRef.current.setSinkId !== 'undefined') {
        await remoteAudioRef.current.setSinkId(sinkId);
        setCurrentSinkId(sinkId);
        console.log(`🔊 [WebRTC] Successfully set audio output sink to: ${sinkId || 'default'}`);

        // Update speakerMode based on whether the device is labeled speaker
        if (sinkId) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const dev = devices.find(d => d.deviceId === sinkId);
          if (dev) {
            const label = dev.label.toLowerCase();
            setSpeakerMode(label.includes('speaker') || label.includes('loudspeaker') || label.includes('hands-free'));
          }
        } else {
          setSpeakerMode(false);
        }
      } else {
        console.warn('⚠️ [WebRTC] Browser does not support setSinkId audio output routing.');
      }
    } catch (err) {
      console.error('❌ [WebRTC] Error setting audio output device:', err);
    }
  }, []);

  const toggleSpeakerMode = useCallback(async () => {
    if (!remoteAudioRef.current) return;
    const nextMode = !speakerMode;

    try {
      if (typeof remoteAudioRef.current.setSinkId !== 'undefined') {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');

        if (nextMode) {
          const speaker = outputs.find(d =>
            d.label.toLowerCase().includes('speaker') ||
            d.label.toLowerCase().includes('loudspeaker') ||
            d.label.toLowerCase().includes('hands-free')
          );
          if (speaker) {
            await remoteAudioRef.current.setSinkId(speaker.deviceId);
            setCurrentSinkId(speaker.deviceId);
            console.log('🔊 [WebRTC] Switched output to speaker:', speaker.label);
          } else if (outputs.length > 0) {
            const fallback = outputs.find(d => !d.label.toLowerCase().includes('earpiece') && d.deviceId !== 'default');
            const targetId = fallback ? fallback.deviceId : outputs[0].deviceId;
            await remoteAudioRef.current.setSinkId(targetId);
            setCurrentSinkId(targetId);
          }
        } else {
          await remoteAudioRef.current.setSinkId('');
          setCurrentSinkId('');
          console.log('🔊 [WebRTC] Switched output back to default earpiece/headset');
        }
      } else {
        console.warn('⚠️ [WebRTC] Browser does not support setSinkId audio output routing.');
      }
      setSpeakerMode(nextMode);
    } catch (err) {
      console.error('❌ [WebRTC] Error toggling speaker mode:', err);
    }
  }, [speakerMode]);

  const syncPendingTicks = useCallback(async (friendId) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !activeSocket.connected || !friendId) return;
    try {
      const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
      const pendingDelivered = await db.messages
        .where('chatId').equals(friendId)
        .filter(m => m.senderId === currentUser.id && m.status === 'delivered')
        .toArray();

      if (pendingDelivered.length > 0) {
        const messageIds = pendingDelivered.map(m => m.id);
        console.log(`📤 [SocketContext] Requesting status sync for ${messageIds.length} delivered messages...`);
        activeSocket.emit('request-status-sync', { to: friendId, messageIds });
      }
    } catch (err) {
      console.error('Error in syncPendingTicks:', err);
    }
  }, []);

  const setActiveChat = useCallback((friendId) => {
    activeChatRef.current = friendId;
    if (friendId) {
      db.chats.update(friendId, { unreadCount: 0 }).catch(() => {});
      syncPendingTicks(friendId);
    }
  }, [syncPendingTicks]);

  const flushOfflineMessages = useCallback(async (activeSocket) => {
    const socketToUse = activeSocket || socketRef.current;
    if (!socketToUse || !socketToUse.connected) return;

    try {
      console.log('🔄 [SocketContext] Checking for unsent offline messages...');
      const unsent = await db.messages.where('status').equals('sending').toArray();
      if (unsent.length === 0) return;

      console.log(`🔄 [SocketContext] Flushing ${unsent.length} offline messages...`);
      for (const msg of unsent) {
        let textToSend = msg.text || '';
        let mediaUrlToSend = msg.mediaUrl || null;
        let isEncrypted = false;

        const sharedKey = await getSharedKey(msg.receiverId);
        if (sharedKey) {
          try {
            if (textToSend) {
              textToSend = await encryptWithSharedKey(textToSend, sharedKey);
            }
            if (mediaUrlToSend) {
              mediaUrlToSend = await encryptWithSharedKey(mediaUrlToSend, sharedKey);
            }
            isEncrypted = true;
          } catch (err) {
            console.error('❌ [E2EE] Encryption failed for offline message:', err);
          }
        }

        socketToUse.emit('send-message', {
          id: msg.id,
          receiverId: msg.receiverId,
          text: textToSend,
          mediaUrl: mediaUrlToSend,
          mediaType: msg.mediaType,
          timestamp: msg.timestamp,
          isEncrypted,
          replyTo: msg.replyTo || null
        });
      }
    } catch (err) {
      console.error('❌ [SocketContext] Error flushing offline messages:', err);
    }
  }, [getSharedKey]);

  const fetchGroups = useCallback(async (token) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/groups`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGroups(data);
        // Sync to IndexedDB groups table
        await db.groups.clear();
        for (const gp of data) {
          await db.groups.put({
            id: gp.id,
            name: gp.name,
            avatar: gp.avatar || null,
            description: gp.description || null,
            createdById: gp.createdById
          });
          // Insert group into chats so it shows in sidebar
          const existing = await db.chats.get(gp.id);
          if (!existing) {
            await db.chats.put({
              friendId: gp.id,
              lastMessageText: 'Group created',
              lastMessageTime: gp.createdAt ? new Date(gp.createdAt).getTime() : Date.now(),
              unreadCount: 0,
              isGroup: true
            });
          }
        }
      }
    } catch (err) {
      console.error('❌ [Groups] Fetch error:', err);
    }
  }, []);

  const connectSocket = useCallback((token) => {
    // Don't reconnect if already connected
    if (socketRef.current && socketRef.current.connected) {
      console.log('⚡ [SocketContext] Already connected, skipping reconnect.');
      return;
    }

    // Disconnect stale socket before creating new one
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    console.log('⚡ [SocketContext] Connecting to:', BACKEND_URL);

    const newSocket = io(BACKEND_URL, {
      auth: { token },
      transports: ['websocket', 'polling'], // Try websocket first for instant connection, polling as fallback
      reconnectionAttempts: 30,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });



    newSocket.on('connect', () => {
      console.log('✅ [SocketContext] Connected! Socket ID:', newSocket.id);
      setIsConnected(true);
      
      const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
      if (currentUser.id) {
        initializeE2EEKeys(currentUser.id, token);
        fetchGroups(token);
      }

      flushOfflineMessages(newSocket);
      if (activeChatRef.current) {
        syncPendingTicks(activeChatRef.current);
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('⚡ [SocketContext] Disconnected. Reason:', reason);
      setIsConnected(false);
      setTypingFriends(new Set());
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ [SocketContext] Connection error:', err.message, '| Backend:', BACKEND_URL);
      setIsConnected(false);
    });
    // RECEIVE REALTIME MESSAGE
    newSocket.on('receive-message', async (message) => {
      const { id, senderId, receiverId, chatId, text, mediaUrl, mediaType, timestamp, isEncrypted, isGroup } = message;
      try {
        let decryptedText = text || '';
        let decryptedMediaUrl = mediaUrl || null;

        if (isEncrypted && !isGroup) {
          const sharedKey = await getSharedKey(senderId);
          if (sharedKey) {
            try {
              if (text) {
                decryptedText = await decryptWithSharedKey(text, sharedKey);
              }
              if (mediaUrl) {
                decryptedMediaUrl = await decryptWithSharedKey(mediaUrl, sharedKey);
              }
            } catch (err) {
              console.error('❌ [E2EE] Decryption failed for realtime message:', err);
              decryptedText = '🔒 [Decryption error: Failed to decrypt message]';
            }
          } else {
            console.warn('⚠️ [E2EE] No shared key for decryption of realtime message');
            decryptedText = '🔒 [Decryption error: Shared key not found]';
          }
        }

        const targetChatId = isGroup ? chatId : senderId;

        await db.messages.put({
          id, chatId: targetChatId, senderId, receiverId,
          senderUsername: message.senderUsername || null,
          text: decryptedText, mediaUrl: decryptedMediaUrl, mediaType, timestamp, status: 'ack',
          replyTo: message.replyTo || null,
          reactions: {},
          isGroup: !!isGroup
        });

        const isActiveChat = activeChatRef.current === targetChatId;
        const existingChat = await db.chats.get(targetChatId);

        await db.chats.put({
          friendId: targetChatId,
          lastMessageText: (isGroup ? `${message.senderUsername || 'Member'}: ` : '') + (decryptedText || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File')),
          lastMessageTime: timestamp,
          unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1,
          isGroup: !!isGroup
        });

        if (!isGroup) {
          newSocket.emit('message-ack', { id, senderId });
        }
      } catch (err) {
        console.error('❌ [SocketContext] Error writing message to DB:', err);
      }
    });

    // RECEIVE OFFLINE BATCH
    newSocket.on('deliver-offline-messages', async (messages) => {
      const ackIds = [];
      try {
        for (const msg of messages) {
          const { id, senderId, receiverId, chatId, text, mediaUrl, mediaType, timestamp, isEncrypted, isGroup } = msg;
          
          let decryptedText = text || '';
          let decryptedMediaUrl = mediaUrl || null;

          if (isEncrypted && !isGroup) {
            const sharedKey = await getSharedKey(senderId);
            if (sharedKey) {
              try {
                if (text) {
                  decryptedText = await decryptWithSharedKey(text, sharedKey);
                }
                if (mediaUrl) {
                  decryptedMediaUrl = await decryptWithSharedKey(mediaUrl, sharedKey);
                }
              } catch (err) {
                console.error('❌ [E2EE] Decryption failed for offline message:', err);
                decryptedText = '🔒 [Decryption error: Failed to decrypt message]';
              }
            } else {
              console.warn('⚠️ [E2EE] No shared key for decryption of offline message');
              decryptedText = '🔒 [Decryption error: Shared key not found]';
            }
          }

          const targetChatId = isGroup ? chatId : senderId;

          await db.messages.put({
            id, chatId: targetChatId, senderId, receiverId,
            senderUsername: msg.senderUsername || null,
            text: decryptedText, mediaUrl: decryptedMediaUrl, mediaType, timestamp, status: 'ack',
            replyTo: msg.replyTo || null,
            reactions: {},
            isGroup: !!isGroup
          });

          const isActiveChat = activeChatRef.current === targetChatId;
          const existingChat = await db.chats.get(targetChatId);
          await db.chats.put({
            friendId: targetChatId,
            lastMessageText: (isGroup ? `${msg.senderUsername || 'Member'}: ` : '') + (decryptedText || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File')),
            lastMessageTime: timestamp,
            unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1,
            isGroup: !!isGroup
          });
          if (!isGroup) {
            ackIds.push({ id, senderId });
          }
        }

        if (ackIds.length > 0) {
          newSocket.emit('offline-messages-ack', { messageIds: ackIds });
        }
      } catch (err) {
        console.error('❌ [SocketContext] Error processing offline batch:', err);
      }
    });

    // MESSAGE STATUS UPDATE
    newSocket.on('message-status', async ({ id, status }) => {
      try {
        await db.messages.update(id, { status });
      } catch (_) {}
    });

    // FRIEND PRESENCE
    newSocket.on('friend-status-changed', async ({ userId, status }) => {
      setOnlineFriends(prev => {
        const next = new Map(prev);
        next.set(userId, status);
        return next;
      });
      try {
        await db.friends.update(userId, { status });
      } catch (_) {}
    });

    // TYPING
    newSocket.on('typing-start', ({ senderId }) => {
      setTypingFriends(prev => new Set([...prev, senderId]));
    });

    newSocket.on('typing-stop', ({ senderId }) => {
      setTypingFriends(prev => {
        const next = new Set(prev);
        next.delete(senderId);
        return next;
      });
    });

    // WebRTC Voice Calling socket listeners
    newSocket.on('incoming-call', ({ from, fromUsername, offer }) => {
      console.log(`📞 [WebRTC] Incoming call from: ${fromUsername}`);
      peerConnectionRef.current_offer = offer;
      setCallPartner({ id: from, username: fromUsername });
      setCallState('ringing');
    });

    newSocket.on('call-accepted', async ({ answer }) => {
      console.log('✅ [WebRTC] Call accepted by remote peer.');
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
          setCallState('connected');
          startCallTimer();

          // Process queued ICE candidates
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift();
            try {
              await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand));
            } catch (err) {
              console.error('Error processing queued ICE candidate:', err);
            }
          }
        } catch (err) {
          console.error('Error setting remote answer:', err);
        }
      }
    });

    newSocket.on('call-rejected', ({ reason }) => {
      console.warn('⚠️ [WebRTC] Call was rejected. Reason:', reason);
      cleanupCall();
      if (reason === 'offline') {
        alert('Friend is currently offline.');
      } else {
        alert('Call was rejected.');
      }
    });

    newSocket.on('call-ended', () => {
      console.log('🛑 [WebRTC] Call was ended by peer.');
      cleanupCall();
    });

    newSocket.on('ice-candidate', async ({ candidate }) => {
      const pc = peerConnectionRef.current;
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding remote ICE candidate:', err);
        }
      } else {
        pendingCandidatesRef.current.push(candidate);
      }
    });

    newSocket.on('query-message-receipt', async ({ from, messageIds }) => {
      console.log(`🔍 [SocketContext] Querying receipt for ${messageIds.length} messages from user ${from}`);
      const ackedIds = [];
      try {
        for (const msgId of messageIds) {
          const exists = await db.messages.get(msgId);
          if (exists) {
            ackedIds.push(msgId);
          }
        }
        if (ackedIds.length > 0 && newSocket.connected) {
          newSocket.emit('confirm-status-sync', { to: from, ackedIds });
        }
      } catch (err) {
        console.error('Error querying message receipt:', err);
      }
    });

    newSocket.on('status-sync-confirmed', async ({ ackedIds }) => {
      console.log(`✅ [SocketContext] Confirmed receipt of ${ackedIds.length} messages. Syncing double ticks.`);
      try {
        for (const msgId of ackedIds) {
          await db.messages.update(msgId, { status: 'ack' });
        }
      } catch (err) {
        console.error('Error updating status sync:', err);
      }
    });

    // friendship accepted - refresh friends list
    newSocket.on('friendship-accepted', () => {
      // Components can listen to this via the socket ref
    });

    // MESSAGE DELETED (unsend for both)
    newSocket.on('message-deleted', async ({ messageId }) => {
      try {
        await db.messages.delete(messageId);
      } catch (err) {
        console.error('❌ [SocketContext] Error deleting message from DB:', err);
      }
    });

    // RECEIVE REACTION from other user
    newSocket.on('receive-reaction', async ({ messageId, emoji, senderId }) => {
      try {
        const msg = await db.messages.get(messageId);
        if (msg) {
          const reactions = { ...(msg.reactions || {}) };
          const users = reactions[emoji] ? [...reactions[emoji]] : [];
          if (users.includes(senderId)) {
            reactions[emoji] = users.filter(u => u !== senderId);
            if (reactions[emoji].length === 0) delete reactions[emoji];
          } else {
            reactions[emoji] = [...users, senderId];
          }
          await db.messages.update(messageId, { reactions });
        }
      } catch (err) { console.error('Reaction receive error:', err); }
    });

    socketRef.current = newSocket;
    setSocket(newSocket);
  }, []);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocket(null);
      setIsConnected(false);
      setTypingFriends(new Set());
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  const generateUUID = () => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };

  // SEND MESSAGE — uses ref so never has stale socket
  const sendMessage = useCallback(async (receiverId, text, mediaUrl = null, mediaType = null, replyTo = null) => {
    const activeSocket = socketRef.current;
    const isOnline = activeSocket && activeSocket.connected;

    const messageId = generateUUID();
    const timestamp = Date.now();
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');

    const localMessage = {
      id: messageId,
      chatId: receiverId,
      senderId: currentUser.id,
      receiverId,
      text: text || '',
      mediaUrl,
      mediaType,
      timestamp,
      status: 'sending',
      replyTo: replyTo || null,
      reactions: {}
    };

    try {
      await db.messages.put(localMessage);
      await db.chats.put({
        friendId: receiverId,
        lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File'),
        lastMessageTime: timestamp,
        unreadCount: 0
      });

      if (isOnline) {
        let textToSend = text || '';
        let mediaUrlToSend = mediaUrl || null;
        let isEncrypted = false;

        const sharedKey = await getSharedKey(receiverId);
        if (sharedKey) {
          try {
            if (textToSend) {
              textToSend = await encryptWithSharedKey(textToSend, sharedKey);
            }
            if (mediaUrlToSend) {
              mediaUrlToSend = await encryptWithSharedKey(mediaUrlToSend, sharedKey);
            }
            isEncrypted = true;
          } catch (err) {
            console.error('❌ [E2EE] Encryption failed in sendMessage:', err);
          }
        }

        activeSocket.emit('send-message', {
          id: messageId,
          receiverId,
          text: textToSend,
          mediaUrl: mediaUrlToSend,
          mediaType,
          timestamp,
          isEncrypted,
          replyTo: replyTo || null
        });
        console.log('📤 [SocketContext] Message sent (online):', messageId, 'Encrypted:', isEncrypted);
      } else {
        console.log('⏳ [SocketContext] Device is offline. Message queued in local IndexedDB:', messageId);
      }

      return localMessage;
    } catch (err) {
      console.error('❌ [SocketContext] Failed to send message:', err);
      return null;
    }
  }, [getSharedKey]);

  const emitTyping = useCallback((receiverId, isTyping) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !activeSocket.connected) return;
    activeSocket.emit(isTyping ? 'typing-start' : 'typing-stop', { receiverId });
  }, []);

  // DELETE MESSAGE — unsend for both users
  const deleteMessage = useCallback(async (messageId, recipientId) => {
    const activeSocket = socketRef.current;
    try {
      // Remove from local IndexedDB
      await db.messages.delete(messageId);
      console.log(`🗑️ [SocketContext] Message ${messageId} deleted locally`);

      // Emit to server to relay to other user
      if (activeSocket && activeSocket.connected) {
        activeSocket.emit('delete-message', { messageId, recipientId });
        console.log(`🗑️ [SocketContext] Delete event emitted for message ${messageId}`);
      }
      return true;
    } catch (err) {
      console.error('❌ [SocketContext] Failed to delete message:', err);
      return false;
    }
  }, []);


  // SEND REACTION — toggle emoji on a message, relay to the other user
  const sendReaction = useCallback(async (messageId, recipientId, emoji) => {
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
    if (!currentUser.id || !messageId || !emoji) return;
    try {
      const msg = await db.messages.get(messageId);
      if (msg) {
        const reactions = { ...(msg.reactions || {}) };
        const users = reactions[emoji] ? [...reactions[emoji]] : [];
        if (users.includes(currentUser.id)) {
          reactions[emoji] = users.filter(u => u !== currentUser.id);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, currentUser.id];
        }
        await db.messages.update(messageId, { reactions });
      }
    } catch (err) { console.error('Reaction local update error:', err); }
    const activeSocket = socketRef.current;
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('send-reaction', { messageId, recipientId, emoji });
    }
  }, []);

  const sendGroupMessage = useCallback(async (groupId, text, mediaUrl = null, mediaType = null, replyTo = null) => {
    const activeSocket = socketRef.current;
    const isOnline = activeSocket && activeSocket.connected;

    const messageId = generateUUID();
    const timestamp = Date.now();
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');

    const localMessage = {
      id: messageId,
      chatId: groupId,
      senderId: currentUser.id,
      senderUsername: currentUser.username,
      receiverId: groupId,
      text: text || '',
      mediaUrl,
      mediaType,
      timestamp,
      status: isOnline ? 'delivered' : 'sending',
      replyTo: replyTo || null,
      reactions: {},
      isGroup: true
    };

    try {
      await db.messages.put(localMessage);
      await db.chats.put({
        friendId: groupId,
        lastMessageText: `${currentUser.username}: ` + (text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File')),
        lastMessageTime: timestamp,
        unreadCount: 0,
        isGroup: true
      });

      if (isOnline) {
        activeSocket.emit('send-group-message', {
          id: messageId,
          groupId,
          text,
          mediaUrl,
          mediaType,
          timestamp,
          replyTo: replyTo || null
        });
      }
      return localMessage;
    } catch (err) {
      console.error('❌ [SocketContext] sendGroupMessage error:', err);
      return null;
    }
  }, []);

  const sendGroupReaction = useCallback(async (groupId, messageId, emoji) => {
    const currentUser = JSON.parse(localStorage.getItem('chapp_user') || '{}');
    if (!currentUser.id || !messageId || !emoji) return;
    try {
      const msg = await db.messages.get(messageId);
      if (msg) {
        const reactions = { ...(msg.reactions || {}) };
        const users = reactions[emoji] ? [...reactions[emoji]] : [];
        if (users.includes(currentUser.id)) {
          reactions[emoji] = users.filter(u => u !== currentUser.id);
          if (reactions[emoji].length === 0) delete reactions[emoji];
        } else {
          reactions[emoji] = [...users, currentUser.id];
        }
        await db.messages.update(messageId, { reactions });
      }
    } catch (err) { console.error('Group reaction local update error:', err); }

    const activeSocket = socketRef.current;
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('send-group-reaction', { messageId, groupId, emoji });
    }
  }, []);

  return (
    <SocketContext.Provider
      value={{
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
        socketRef,
        groups,
        fetchGroups,
        sendGroupMessage,
        sendGroupReaction,
        callState,
        callPartner,
        isMuted,
        speakerMode,
        audioOutputs,
        currentSinkId,
        setAudioOutputDevice,
        enumerateAudioOutputs,
        callDuration,
        initiateCall,
        answerIncomingCall,
        rejectIncomingCall,
        endActiveCall,
        toggleMute,
        toggleSpeakerMode
      }}
    >
      {children}
      <audio 
        ref={remoteAudioRef} 
        autoPlay 
        playsInline 
        controls={false}
        style={{ display: 'none' }} 
      />
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
