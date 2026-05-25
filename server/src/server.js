import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import prisma from './db.js';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authenticateToken,
  verifySocketToken,
  verifyFirebaseIdToken
} from './auth.js';
import { enqueueMessage, dequeueMessages } from './queue.js';
import { startCleanupWorker } from './cleanup.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes (Vercel client port + standard localhost ports)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Set up temporary uploads directory
const UPLOADS_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage engine for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max size
});

// Map to track active socket connections: key = userId, value = socketId
const onlineUsers = new Map();

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 10000,
  pingInterval: 5000
});

// Middleware to authenticate Socket.IO connections
io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  if (!token) {
    return next(new Error('Authentication error: Token required'));
  }
  
  const decoded = verifySocketToken(token);
  if (!decoded) {
    return next(new Error('Authentication error: Invalid token'));
  }
  
  socket.user = decoded;
  next();
});

// -------------------------------------------------------------
// SOCKET.IO REALTIME MESSAGING & PRESENCE ENGINE
// -------------------------------------------------------------
io.on('connection', async (socket) => {
  const userId = socket.user.id;
  const username = socket.user.username;

  console.log(`⚡ [Socket] User connected: ${username} (${userId})`);
  
  // Register active socket connection
  onlineUsers.set(userId, socket.id);

  try {
    // 1. Update user presence status to online in database
    await prisma.user.update({
      where: { id: userId },
      data: { status: 'online' }
    });

    // 2. Fetch user's friends list and notify online status
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' }
        ]
      },
      include: {
        sender: true,
        receiver: true
      }
    });

    const friendIds = friendships.map(f => f.senderId === userId ? f.receiverId : f.senderId);

    // Notify online friends immediately
    friendIds.forEach(friendId => {
      const friendSocketId = onlineUsers.get(friendId);
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend-status-changed', {
          userId,
          status: 'online'
        });
      }
    });

    // 3. Deliver any pending temporary offline messages stored in Redis queue
    const pendingMessages = await dequeueMessages(userId);
    if (pendingMessages.length > 0) {
      console.log(`📦 [Socket] Relaying ${pendingMessages.length} queued offline messages to ${username}`);
      
      // Deliver in bulk
      socket.emit('deliver-offline-messages', pendingMessages);
    }

  } catch (err) {
    console.error('❌ [Socket] Error updating online status / delivering queue:', err.message);
  }

  // EVENT: send-message
  socket.on('send-message', async (data) => {
    const { id, receiverId, text, mediaUrl, mediaType, timestamp } = data;
    
    if (!receiverId) return;

    const messagePayload = {
      id,
      senderId: userId,
      receiverId,
      text: text || '',
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      timestamp: timestamp || Date.now(),
      status: 'delivered' // Initial state relayed is single tick (delivered)
    };

    const receiverSocketId = onlineUsers.get(receiverId);

    if (receiverSocketId) {
      // Receiver is ONLINE: Relay message instantly
      console.log(`💬 [Message] Relay online: ${username} ➔ userId ${receiverId}`);
      io.to(receiverSocketId).emit('receive-message', messagePayload);
      
      // Notify sender that the message has reached the server and is delivered (single tick)
      socket.emit('message-status', { id, status: 'delivered' });
    } else {
      // Receiver is OFFLINE: Queue temporarily in Redis with TTL
      console.log(`💾 [Message] Receiver offline. Queueing message: ${username} ➔ userId ${receiverId}`);
      await enqueueMessage(receiverId, messagePayload);

      // Return "delivered" (single tick) because it is safely buffered in server Redis/Memory
      socket.emit('message-status', { id, status: 'delivered' });
    }
  });

  // EVENT: message-ack (Triggered by client when message is safely written to IndexedDB)
  socket.on('message-ack', (data) => {
    const { id, senderId } = data;
    if (!id || !senderId) return;

    console.log(`✅ [ACK] Message ${id} stored by receiver. Notifying sender ${senderId}`);

    // Relay double tick ("ack") to sender if online
    const senderSocketId = onlineUsers.get(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit('message-status', { id, status: 'ack' });
    }
  });

  // EVENT: offline-messages-ack (Triggered by client when offline batch is successfully stored)
  socket.on('offline-messages-ack', (data) => {
    const { messageIds } = data; // Array of { id, senderId }
    if (!messageIds || !Array.isArray(messageIds)) return;

    console.log(`✅ [ACK] Offline batch acknowledged: ${messageIds.length} messages.`);

    messageIds.forEach(({ id, senderId }) => {
      const senderSocketId = onlineUsers.get(senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('message-status', { id, status: 'ack' });
      }
    });
  });

  // EVENT: typing-start
  socket.on('typing-start', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing-start', { senderId: userId });
    }
  });

  // EVENT: typing-stop
  socket.on('typing-stop', (data) => {
    const { receiverId } = data;
    const receiverSocketId = onlineUsers.get(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('typing-stop', { senderId: userId });
    }
  });

  // EVENT: disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 [Socket] User disconnected: ${username} (${userId})`);
    
    // Remove active socket reference
    onlineUsers.delete(userId);

    // Standard 5-second grace period for page refreshes / reconnection
    setTimeout(async () => {
      // Check if user reconnected in the meantime
      if (onlineUsers.has(userId)) {
        console.log(`⚡ [Socket] User ${username} reconnected within grace period.`);
        return;
      }

      try {
        // Update user status to offline
        await prisma.user.update({
          where: { id: userId },
          data: { status: 'offline' }
        });

        // Notify friends user is offline
        const friendships = await prisma.friendship.findMany({
          where: {
            OR: [
              { senderId: userId, status: 'ACCEPTED' },
              { receiverId: userId, status: 'ACCEPTED' }
            ]
          }
        });
        
        const friendIds = friendships.map(f => f.senderId === userId ? f.receiverId : f.senderId);

        friendIds.forEach(friendId => {
          const friendSocketId = onlineUsers.get(friendId);
          if (friendSocketId) {
            io.to(friendSocketId).emit('friend-status-changed', {
              userId,
              status: 'offline'
            });
          }
        });
        
        console.log(`💤 [Presence] User ${username} is now offline.`);
      } catch (err) {
        // ignore on closed DB transactions
      }
    }, 5000);
  });
});

// -------------------------------------------------------------
// REST API ROUTES
// -------------------------------------------------------------

// signup endpoint
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (existing) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password & create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        passwordHash,
        avatar: `avatar-${Math.floor(Math.random() * 10) + 1}`, // Random preset avatar id
        bio: 'Hey there! I am using Chapp.'
      }
    });

    const token = generateToken(user);
    res.status(201).json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    console.error('❌ [Signup] Error:', err.message);
    res.status(500).json({ error: 'Server error during signup' });
  }
});

// login endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const match = await comparePassword(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    console.error('❌ [Login] Error:', err.message);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// Firebase google authentication endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { token, username } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    // Verify token using Firebase auth utility
    const payload = await verifyFirebaseIdToken(token);
    if (!payload) {
      return res.status(400).json({ error: 'Firebase token verification failed' });
    }

    // Check if user exists by firebaseUid
    let user = await prisma.user.findUnique({
      where: { firebaseUid: payload.uid }
    });

    if (!user) {
      // First time Google Login: Generate/Verify custom username
      let targetUsername = username ? username.trim().toLowerCase() : '';
      
      if (!targetUsername) {
        // Fallback: Generate one based on google display name
        targetUsername = payload.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (targetUsername.length < 3) targetUsername = 'user';
        targetUsername += Math.floor(Math.random() * 1000);
      }

      // Ensure targetUsername uniqueness
      let existing = await prisma.user.findUnique({ where: { username: targetUsername } });
      let counter = 1;
      const baseUsername = targetUsername;
      
      while (existing) {
        targetUsername = `${baseUsername}${counter}`;
        existing = await prisma.user.findUnique({ where: { username: targetUsername } });
        counter++;
      }

      // Choose photoURL or generate default preset ID
      const userAvatar = payload.picture || `avatar-${Math.floor(Math.random() * 10) + 1}`;

      // Create new user profile linked to Firebase
      user = await prisma.user.create({
        data: {
          username: targetUsername,
          firebaseUid: payload.uid,
          avatar: userAvatar,
          bio: 'Hey there! I am using Chapp.'
        }
      });
      
      console.log(`🆕 [Auth] Registered new Google User: ${user.username}`);
    }

    const sessionToken = generateToken(user);
    res.json({ token: sessionToken, user: { id: user.id, username: user.username, avatar: user.avatar, bio: user.bio } });
  } catch (err) {
    console.error('❌ [Google Login] Error:', err.message);
    res.status(500).json({ error: 'Server error during Google Authentication' });
  }
});

// profile routes (protected)
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, avatar: user.avatar, bio: user.bio, status: user.status });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { bio, avatar, status } = req.body;
    
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(bio !== undefined && { bio }),
        ...(avatar !== undefined && { avatar }),
        ...(status !== undefined && { status })
      }
    });

    res.json({ id: updated.id, username: updated.username, avatar: updated.avatar, bio: updated.bio, status: updated.status });
  } catch (err) {
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// GET user's encrypted backup
app.get('/api/backup', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        encryptedBackup: true,
        backupUpdatedAt: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      encryptedBackup: user.encryptedBackup,
      backupUpdatedAt: user.backupUpdatedAt
    });
  } catch (err) {
    console.error('❌ [Backup GET] Error:', err.message);
    res.status(500).json({ error: 'Server error retrieving backup' });
  }
});

// POST update user's encrypted backup
app.post('/api/backup', authenticateToken, async (req, res) => {
  try {
    const { encryptedBackup } = req.body;
    if (encryptedBackup === undefined) {
      return res.status(400).json({ error: 'encryptedBackup payload is required' });
    }
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        encryptedBackup,
        backupUpdatedAt: new Date()
      },
      select: {
        backupUpdatedAt: true
      }
    });
    res.json({
      message: 'Backup updated successfully',
      backupUpdatedAt: updated.backupUpdatedAt
    });
  } catch (err) {
    console.error('❌ [Backup POST] Error:', err.message);
    res.status(500).json({ error: 'Server error saving backup' });
  }
});

// fetch all friends (accepted and pending)
app.get('/api/friends', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      include: {
        sender: true,
        receiver: true
      }
    });

    // Format list for frontend
    const list = friendships.map(f => {
      const isSender = f.senderId === userId;
      const targetUser = isSender ? f.receiver : f.sender;
      
      return {
        id: f.id,
        status: f.status,
        createdAt: f.createdAt,
        isOutgoing: isSender,
        friend: {
          id: targetUser.id,
          username: targetUser.username,
          avatar: targetUser.avatar,
          bio: targetUser.bio,
          status: targetUser.status
        }
      };
    });

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching friends' });
  }
});

// send friend request
app.post('/api/friends/request', authenticateToken, async (req, res) => {
  try {
    const { username } = req.body;
    const senderId = req.user.id;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    
    // Find recipient
    const recipient = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (!recipient) {
      return res.status(404).json({ error: `User '${username}' does not exist` });
    }

    if (recipient.id === senderId) {
      return res.status(400).json({ error: 'You cannot add yourself as a friend' });
    }

    // Check if relationship already exists
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId, receiverId: recipient.id },
          { senderId: recipient.id, receiverId: senderId }
        ]
      }
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        return res.status(400).json({ error: 'You are already friends with this user' });
      }
      if (existing.status === 'PENDING') {
        if (existing.senderId === senderId) {
          return res.status(400).json({ error: 'Friend request is already pending' });
        } else {
          // If the other user already sent a request, auto-accept it!
          const updated = await prisma.friendship.update({
            where: { id: existing.id },
            data: { status: 'ACCEPTED' }
          });
          return res.json({ message: 'Friend request auto-accepted!', friendship: updated });
        }
      }
    }

    // Create pending request
    const friendship = await prisma.friendship.create({
      data: {
        senderId,
        receiverId: recipient.id,
        status: 'PENDING'
      }
    });

    res.status(201).json({ message: 'Friend request sent', friendship });
  } catch (err) {
    console.error('❌ [Friend Request] Error:', err.message);
    res.status(500).json({ error: 'Server error sending request' });
  }
});

// respond to friend request
app.post('/api/friends/respond', authenticateToken, async (req, res) => {
  try {
    const { friendshipId, action } = req.body; // action: 'ACCEPT' or 'REJECT'
    const userId = req.user.id;

    if (!friendshipId || !action) {
      return res.status(400).json({ error: 'FriendshipId and action are required' });
    }

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    // Security check: Only the receiver can accept/reject a pending request
    if (friendship.receiverId !== userId && friendship.status === 'PENDING') {
      return res.status(403).json({ error: 'Not authorized to respond to this request' });
    }

    if (action === 'ACCEPT') {
      const updated = await prisma.friendship.update({
        where: { id: friendshipId },
        data: { status: 'ACCEPTED' }
      });
      
      // Notify both sockets of accepted friendship status
      const senderSocketId = onlineUsers.get(friendship.senderId);
      const receiverSocketId = onlineUsers.get(friendship.receiverId);
      
      if (senderSocketId) io.to(senderSocketId).emit('friendship-accepted', { friendshipId });
      if (receiverSocketId) io.to(receiverSocketId).emit('friendship-accepted', { friendshipId });

      res.json({ message: 'Friend request accepted', friendship: updated });
    } else if (action === 'REJECT') {
      // Privacy & space cleaning: delete row on decline
      await prisma.friendship.delete({
        where: { id: friendshipId }
      });
      res.json({ message: 'Friend request declined and removed' });
    } else {
      res.status(400).json({ error: 'Invalid action, must be ACCEPT or REJECT' });
    }
  } catch (err) {
    console.error('❌ [Friend Respond] Error:', err.message);
    res.status(500).json({ error: 'Server error responding to request' });
  }
});

// media upload endpoint (protected, single file, field: 'file')
app.post('/api/media/upload', authenticateToken, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Build the temporary download URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const fileUrl = `${baseUrl}/api/media/download/${req.file.filename}`;

    res.status(201).json({
      url: fileUrl,
      filename: req.file.filename,
      mediaType: req.file.mimetype.split('/')[0], // e.g. 'image', 'video', 'application'
      originalName: req.file.originalname,
      size: req.file.size
    });
  } catch (err) {
    console.error('❌ [Media Upload] Error:', err.message);
    res.status(500).json({ error: 'Server error during media upload' });
  }
});

// media download/serving endpoint
app.get('/api/media/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(UPLOADS_DIR, filename);

    // Prevent directory traversal attacks
    const safePath = path.resolve(filePath);
    if (!safePath.startsWith(UPLOADS_DIR)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'File has expired or does not exist' });
    }

    res.sendFile(safePath);
  } catch (err) {
    console.error('❌ [Media Download] Error:', err.message);
    res.status(500).json({ error: 'Server error retrieving file' });
  }
});

// Start background temporary file cleanup worker
startCleanupWorker();

// Start Server
httpServer.listen(PORT, () => {
  console.log(`🚀 [Server] Chapp backend running on port ${PORT}`);
});
