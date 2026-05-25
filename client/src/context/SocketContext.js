'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import db from '../db/localDb';

const SocketContext = createContext(null);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export function SocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [typingFriends, setTypingFriends] = useState(new Set());
  const [onlineFriends, setOnlineFriends] = useState(new Map());

  // Use a ref for the socket so callbacks always access the latest instance
  // without stale closure bugs from useState
  const socketRef = useRef(null);
  const activeChatRef = useRef(null);

  // Expose socket state for components that need to check connection
  const [socket, setSocket] = useState(null);

  const setActiveChat = useCallback((friendId) => {
    activeChatRef.current = friendId;
    if (friendId) {
      db.chats.update(friendId, { unreadCount: 0 }).catch(() => {});
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
      transports: ['polling', 'websocket'], // polling first → upgrades to WS (required for Render)
      reconnectionAttempts: 20,
      reconnectionDelay: 2000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      console.log('✅ [SocketContext] Connected! Socket ID:', newSocket.id);
      setIsConnected(true);
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
      const { id, senderId, receiverId, text, mediaUrl, mediaType, timestamp } = message;
      try {
        await db.messages.put({
          id, chatId: senderId, senderId, receiverId,
          text, mediaUrl, mediaType, timestamp, status: 'ack'
        });

        const isActiveChat = activeChatRef.current === senderId;
        const existingChat = await db.chats.get(senderId);

        await db.chats.put({
          friendId: senderId,
          lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File'),
          lastMessageTime: timestamp,
          unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1
        });

        newSocket.emit('message-ack', { id, senderId });
      } catch (err) {
        console.error('❌ [SocketContext] Error writing message to DB:', err);
      }
    });

    // RECEIVE OFFLINE BATCH
    newSocket.on('deliver-offline-messages', async (messages) => {
      const ackIds = [];
      try {
        for (const msg of messages) {
          const { id, senderId, receiverId, text, mediaUrl, mediaType, timestamp } = msg;
          await db.messages.put({
            id, chatId: senderId, senderId, receiverId,
            text, mediaUrl, mediaType, timestamp, status: 'ack'
          });

          const isActiveChat = activeChatRef.current === senderId;
          const existingChat = await db.chats.get(senderId);
          await db.chats.put({
            friendId: senderId,
            lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File'),
            lastMessageTime: timestamp,
            unreadCount: isActiveChat ? 0 : (existingChat?.unreadCount || 0) + 1
          });
          ackIds.push({ id, senderId });
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

    // friendship accepted - refresh friends list
    newSocket.on('friendship-accepted', () => {
      // Components can listen to this via the socket ref
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

  // SEND MESSAGE — uses ref so never has stale socket
  const sendMessage = useCallback(async (receiverId, text, mediaUrl = null, mediaType = null) => {
    const activeSocket = socketRef.current;

    if (!activeSocket || !activeSocket.connected) {
      console.warn('⚠️ [SocketContext] Cannot send: socket not connected. Connected:', activeSocket?.connected, 'URL:', BACKEND_URL);
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
      status: 'sending'
    };

    try {
      await db.messages.put(localMessage);
      await db.chats.put({
        friendId: receiverId,
        lastMessageText: text || (mediaType === 'image' ? '📷 Photo' : mediaType === 'video' ? '🎥 Video' : '📁 File'),
        lastMessageTime: timestamp,
        unreadCount: 0
      });

      activeSocket.emit('send-message', {
        id: messageId,
        receiverId,
        text,
        mediaUrl,
        mediaType,
        timestamp
      });

      console.log('📤 [SocketContext] Message sent:', messageId);
      return localMessage;
    } catch (err) {
      console.error('❌ [SocketContext] Failed to send message:', err);
      return null;
    }
  }, []); // No deps — always reads from socketRef directly

  const emitTyping = useCallback((receiverId, isTyping) => {
    const activeSocket = socketRef.current;
    if (!activeSocket || !activeSocket.connected) return;
    activeSocket.emit(isTyping ? 'typing-start' : 'typing-stop', { receiverId });
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
        emitTyping,
        setActiveChat,
        socketRef,
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
