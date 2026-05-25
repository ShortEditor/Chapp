'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import db from '../db/localDb';

const SocketContext = createContext(null);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [typingFriends, setTypingFriends] = useState(new Set());
  const [onlineFriends, setOnlineFriends] = useState(new Map()); // friendId -> 'online' | 'offline'

  // Ref to track active chat in realtime inside socket callbacks
  const activeChatRef = React.useRef(null);

  // Set active chat friend ID (so we know when to increment unread count or reset it to 0)
  const setActiveChat = useCallback((friendId) => {
    activeChatRef.current = friendId;
    if (friendId) {
      // Clear unread count for this active chat in local DB
      db.chats.update(friendId, { unreadCount: 0 }).catch(() => {});
    }
  }, []);

  // Initialize and connect socket using our local session JWT
  const connectSocket = useCallback((token) => {
    // Allow reconnect if previous socket disconnected/failed
    if (socket && socket.connected) return;

    console.log('⚡ [SocketContext] Connecting to server...', BACKEND_URL);
    const newSocket = io(BACKEND_URL, {
      auth: { token },
      transports: ['polling', 'websocket'], // polling first for Render compatibility, then upgrades to WS
      reconnectionAttempts: 15,
      reconnectionDelay: 2000,
      timeout: 20000
    });

    newSocket.on('connect', () => {
      console.log('⚡ [SocketContext] Connected to websocket server.');
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('⚡ [SocketContext] Disconnected from websocket server. Reason:', reason);
      setIsConnected(false);
      setTypingFriends(new Set());
    });

    newSocket.on('connect_error', (err) => {
      console.error('❌ [SocketContext] Socket connection error:', err.message);
    });

    // 1. RECEIVE REALTIME MESSAGE
    newSocket.on('receive-message', async (message) => {
      const { id, senderId, receiverId, text, mediaUrl, mediaType, timestamp } = message;
      console.log(`💬 [SocketContext] Received realtime message from ${senderId}`);

      try {
        // Write message to local IndexedDB (set status to 'ack' immediately because we received it!)
        await db.messages.put({
          id,
          chatId: senderId,
          senderId,
          receiverId,
          text,
          mediaUrl,
          mediaType,
          timestamp,
          status: 'ack'
        });

        // If receiver is currently viewing this chat, don't increment unread count
        const isActiveChat = activeChatRef.current === senderId;
        const existingChat = await db.chats.get(senderId);

        // Update or create chat in sidebar list
        await db.chats.put({
          friendId: senderId,
          lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 Document'),
          lastMessageTime: timestamp,
          unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1
        });

        // Send ACK back to server so sender gets their double tick
        newSocket.emit('message-ack', { id, senderId });

      } catch (err) {
        console.error('❌ [SocketContext] Error writing message to Dexie:', err);
      }
    });

    // 2. RECEIVE OFFLINE MESSAGES IN BATCH (delivered when user comes online)
    newSocket.on('deliver-offline-messages', async (messages) => {
      console.log(`📦 [SocketContext] Received batch of ${messages.length} offline messages.`);
      
      const ackIds = [];

      try {
        for (const msg of messages) {
          const { id, senderId, receiverId, text, mediaUrl, mediaType, timestamp } = msg;
          
          // Write to local IndexedDB
          await db.messages.put({
            id,
            chatId: senderId,
            senderId,
            receiverId,
            text,
            mediaUrl,
            mediaType,
            timestamp,
            status: 'ack'
          });

          // Sync unread & chat list
          const isActiveChat = activeChatRef.current === senderId;
          const existingChat = await db.chats.get(senderId);

          await db.chats.put({
            friendId: senderId,
            lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 Document'),
            lastMessageTime: timestamp,
            unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1
          });

          ackIds.push({ id, senderId });
        }

        // Send a bulk acknowledgment back to server to clear Redis queue and update senders' double ticks
        if (ackIds.length > 0) {
          newSocket.emit('offline-messages-ack', { messageIds: ackIds });
        }

      } catch (err) {
        console.error('❌ [SocketContext] Error processing offline batch:', err);
      }
    });

    // 3. MESSAGE STATUS UPDATE (single check -> double check)
    newSocket.on('message-status', async (data) => {
      const { id, status } = data;
      console.log(`✏️ [SocketContext] Message status updated: ${id} ➔ ${status}`);
      try {
        await db.messages.update(id, { status });
      } catch (err) {
        // message might not be in our DB (e.g. if cleared, ignore)
      }
    });

    // 4. FRIEND PRESENCE UPDATES
    newSocket.on('friend-status-changed', async (data) => {
      const { userId, status } = data;
      console.log(`👤 [SocketContext] Friend presence: userId ${userId} is now ${status}`);
      
      setOnlineFriends(prev => {
        const next = new Map(prev);
        next.set(userId, status);
        return next;
      });

      // Update in local Dexie database for persistence
      try {
        await db.friends.update(userId, { status });
      } catch (err) {
        // Friend might not be fully synced in local DB yet
      }
    });

    // 5. TYPING INDICATORS
    newSocket.on('typing-start', (data) => {
      const { senderId } = data;
      setTypingFriends(prev => {
        const next = new Set(prev);
        next.add(senderId);
        return next;
      });
    });

    newSocket.on('typing-stop', (data) => {
      const { senderId } = data;
      setTypingFriends(prev => {
        const next = new Set(prev);
        next.delete(senderId);
        return next;
      });
    });

    setSocket(newSocket);
  }, []);

  // Disconnect socket connection
  const disconnectSocket = useCallback(() => {
    if (socket) {
      console.log('⚡ [SocketContext] Explicit socket disconnection.');
      socket.disconnect();
      setSocket(null);
      setIsConnected(false);
      setTypingFriends(new Set());
    }
  }, [socket]);

  // Clean up socket on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [socket]);

  // Send message helper
  const sendMessage = useCallback(async (receiverId, text, mediaUrl = null, mediaType = null) => {
    if (!socket || !isConnected) {
      console.warn('⚠️ [SocketContext] Cannot send message: Socket disconnected.');
      return null;
    }

    const messageId = crypto.randomUUID();
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
      status: 'sending' // Local starts as sending (clock icon)
    };

    try {
      // 1. Save to local IndexedDB instantly
      await db.messages.put(localMessage);

      // 2. Create/Update Chat row in local DB for sidebar tracking
      await db.chats.put({
        friendId: receiverId,
        lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 Document'),
        lastMessageTime: timestamp,
        unreadCount: 0 // We sent this, so 0 unread
      });

      // 3. Emit message over websocket
      socket.emit('send-message', {
        id: messageId,
        receiverId,
        text,
        mediaUrl,
        mediaType,
        timestamp
      });

      return localMessage;

    } catch (err) {
      console.error('❌ [SocketContext] Failed to send message locally:', err);
      return null;
    }
  }, [socket, isConnected]);

  // Trigger typing events
  const emitTyping = useCallback((receiverId, isTyping) => {
    if (!socket || !isConnected) return;
    const event = isTyping ? 'typing-start' : 'typing-stop';
    socket.emit(event, { receiverId });
  }, [socket, isConnected]);

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
        emitTyping,
        setActiveChat
      }}
    >
      {children}
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
