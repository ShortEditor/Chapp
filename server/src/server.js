import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import prisma from './db.js';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import {
  hashPassword,
  comparePassword,
  generateToken,
  authenticateToken,
  verifySocketToken,
  verifyFirebaseIdToken
} from './auth.js';
import { enqueueMessage, dequeueMessages, storeOtp, verifyOtp } from './queue.js';
import { startCleanupWorker } from './cleanup.js';

dotenv.config();

// Configure Web Push VAPID keys (generate dynamically if not in .env)
let publicVapidKey = process.env.VAPID_PUBLIC_KEY;
let privateVapidKey = process.env.VAPID_PRIVATE_KEY;

if (!publicVapidKey || !privateVapidKey) {
  console.log('🔑 [Push] No VAPID keys in .env. Generating dynamic keys for this session...');
  const keys = webpush.generateVAPIDKeys();
  publicVapidKey = keys.publicKey;
  privateVapidKey = keys.privateKey;
}

webpush.setVapidDetails(
  'mailto:support@chapp.app',
  publicVapidKey,
  privateVapidKey
);

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 5000;

// Enable CORS for all routes (Vercel client port + standard localhost ports)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

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

  // Helper to verify friendship
  const isFriend = async (uId, targetId) => {
    try {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { senderId: uId, receiverId: targetId, status: 'ACCEPTED' },
            { senderId: targetId, receiverId: uId, status: 'ACCEPTED' }
          ]
        }
      });
      return !!friendship;
    } catch (err) {
      console.error('❌ Error checking friendship status:', err);
      return false;
    }
  };

  // Rate limiting middleware per socket connection
  const eventLimitMap = new Map();
  socket.use(([event, data], next) => {
    if (['send-message', 'call-user', 'delete-message', 'message-ack'].includes(event)) {
      const now = Date.now();
      const limit = eventLimitMap.get(event) || { count: 0, resetTime: now + 10000 };
      
      if (now > limit.resetTime) {
        limit.count = 0;
        limit.resetTime = now + 10000;
      }
      
      limit.count++;
      eventLimitMap.set(event, limit);
      
      if (limit.count > 15) {
        console.warn(`⚠️ [Rate Limit] User ${username} exceeded rate limit on event: ${event}`);
        return next(new Error(`Rate limit exceeded for event: ${event}. Please slow down.`));
      }
    }
    next();
  });

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
    const { id, receiverId, text, mediaUrl, mediaType, timestamp, isEncrypted, replyTo } = data;
    
    if (!receiverId) return;

    const messagePayload = {
      id,
      senderId: userId,
      receiverId,
      text: text || '',
      mediaUrl: mediaUrl || null,
      mediaType: mediaType || null,
      timestamp: timestamp || Date.now(),
      status: 'delivered',
      isEncrypted: isEncrypted || false,
      replyTo: replyTo || null
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

      // Trigger Web Push Notification
      try {
        const receiver = await prisma.user.findUnique({
          where: { id: receiverId }
        });
        if (receiver && receiver.pushSubscription) {
          const sub = JSON.parse(receiver.pushSubscription);
          const pushPayload = JSON.stringify({
            title: `New message from ${username}`,
            body: text || (mediaType === 'image' ? '📷 Sent a photo' : mediaType === 'video' ? '🎥 Sent a video' : '📁 Sent a file'),
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            url: '/chat'
          });
          console.log(`🔔 [Push] Relaying Web Push notification to offline user: ${receiver.username}`);
          await webpush.sendNotification(sub, pushPayload);
        }
      } catch (pushErr) {
        console.error('⚠️ [Push] Web Push trigger failed:', pushErr.message);
      }

      // Return "delivered" (single tick) because it is safely buffered in server Redis/Memory
      socket.emit('message-status', { id, status: 'delivered' });
    }
  });

  // EVENT: send-reaction (relay emoji reaction to other user)
  socket.on('send-reaction', ({ messageId, recipientId, emoji }) => {
    if (!messageId || !recipientId || !emoji) return;
    const receiverSocketId = onlineUsers.get(recipientId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive-reaction', { messageId, emoji, senderId: userId });
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

  // EVENT: delete-message (Unsend for both users)
  socket.on('delete-message', (data) => {
    const { messageId, recipientId } = data;
    if (!messageId || !recipientId) return;

    console.log(`🗑️ [Message] Delete request: ${username} wants to delete message ${messageId} for user ${recipientId}`);

    const recipientSocketId = onlineUsers.get(recipientId);
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('message-deleted', { messageId, deletedBy: userId });
      console.log(`🗑️ [Message] Deletion relayed to online user ${recipientId}`);
    }
    // Also confirm deletion back to the sender
    socket.emit('message-deleted', { messageId, deletedBy: userId });
  });

  // EVENT: WebRTC Call Signaling - call-user (friendship-guarded)
  socket.on('call-user', async (data) => {
    const { to, offer } = data;
    if (!to) return;

    // Verify caller and callee are accepted friends
    const areFriends = await isFriend(userId, to);
    if (!areFriends) {
      console.warn(`⚠️ [WebRTC] Blocked call attempt: ${username} is not friends with ${to}`);
      socket.emit('call-rejected', { to, reason: 'not_friends' });
      return;
    }

    const receiverSocketId = onlineUsers.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('incoming-call', {
        from: userId,
        fromUsername: username,
        offer
      });
    } else {
      socket.emit('call-rejected', { to, reason: 'offline' });
    }
  });

  // EVENT: WebRTC Call Signaling - accept-call
  socket.on('accept-call', (data) => {
    const { to, answer } = data;
    const callerSocketId = onlineUsers.get(to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-accepted', {
        from: userId,
        answer
      });
    }
  });

  // EVENT: WebRTC Call Signaling - reject-call / end-call / ice-candidate
  socket.on('reject-call', (data) => {
    const { to } = data;
    const callerSocketId = onlineUsers.get(to);
    if (callerSocketId) {
      io.to(callerSocketId).emit('call-rejected', { from: userId, reason: 'rejected' });
    }
  });

  socket.on('end-call', (data) => {
    const { to } = data;
    const peerSocketId = onlineUsers.get(to);
    if (peerSocketId) {
      io.to(peerSocketId).emit('call-ended', { from: userId });
    }
  });

  socket.on('ice-candidate', async (data) => {
    const { to, candidate } = data;
    if (!to) return;

    // Verify ICE candidates are only exchanged between friends
    const areFriends = await isFriend(userId, to);
    if (!areFriends) {
      console.warn(`⚠️ [WebRTC] Blocked ICE candidate from non-friend: ${username} -> ${to}`);
      return;
    }

    const peerSocketId = onlineUsers.get(to);
    if (peerSocketId) {
      io.to(peerSocketId).emit('ice-candidate', {
        from: userId,
        candidate
      });
    }
  });

  // EVENT: disconnect
  socket.on('disconnect', () => {
    console.log(`🔌 [Socket] User disconnected: ${username} (${userId})`);
    
    // If the active socket for this user is a NEWER socket, ignore this stale disconnect
    if (onlineUsers.get(userId) !== socket.id) {
      console.log(`⚡ [Socket] Stale socket disconnected for ${username}, ignoring...`);
      return;
    }

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
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, password, and email are required' });
    }

    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Check if email already exists
    const existingEmail = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (existingEmail) {
      return res.status(400).json({ error: 'Email address is already in use' });
    }

    // Hash password & create user
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        passwordHash,
        email: cleanEmail,
        avatar: `avatar-${Math.floor(Math.random() * 10) + 1}`, // Random preset avatar id
        bio: 'Hey there! I am using Chapp.'
      }
    });

    const token = generateToken(user);
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, banner: user.banner, bio: user.bio } });
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
    res.json({ token, user: { id: user.id, username: user.username, avatar: user.avatar, banner: user.banner, bio: user.bio, email: user.email } });
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
    res.json({ token: sessionToken, user: { id: user.id, username: user.username, avatar: user.avatar, banner: user.banner, bio: user.bio, email: user.email } });
  } catch (err) {
    console.error('❌ [Google Login] Error:', err.message);
    res.status(500).json({ error: 'Server error during Google Authentication' });
  }
});

// Configure Mail Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
  port: parseInt(process.env.SMTP_PORT) || 2525,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  }
});

// Helper to send reset OTP email (falls back to console logging for ease of local testing)
const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: '"Chapp Security" <security@chapp.app>',
    to: email,
    subject: 'Chapp Password Reset Code',
    text: `Your Chapp password reset verification code is: ${otp}. It is valid for 10 minutes.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; max-width: 500px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #6366f1; margin-bottom: 20px;">Reset Your Chapp Password</h2>
        <p>Use the following 6-digit verification code to reset your account password:</p>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 8px; color: #1e293b; margin: 20px 0;">
          ${otp}
        </div>
        <p style="font-size: 12px; color: #64748b;">This code will expire in 10 minutes. If you did not request this code, you can safely ignore this email.</p>
      </div>
    `
  };

  const hasCredentials = process.env.SMTP_USER || (process.env.SMTP_HOST && process.env.SMTP_PORT);

  if (hasCredentials) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✉️ [Email] Password reset OTP sent to ${email} successfully.`);
      return true;
    } catch (err) {
      console.error(`⚠️ [Email] Failed to send email to ${email}:`, err.message);
    }
  }

  // Console fallback (for local development/testing)
  console.log('\n==================================================');
  console.log(`✉️  [MOCK EMAIL RESET CODE]`);
  console.log(`To: ${email}`);
  console.log(`OTP Code: ${otp}`);
  console.log('==================================================\n');
  return true;
};

// Request password reset OTP endpoint
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify user exists with this email
    const user = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'No user account found with that email address' });
    }

    // Generate 6-digit OTP code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in Redis/Cache
    await storeOtp(cleanEmail, otp);

    // Send email/log OTP
    await sendOTPEmail(cleanEmail, otp);

    res.json({ message: 'A verification code has been sent to your email address' });
  } catch (err) {
    console.error('❌ [Forgot Password] Error:', err.message);
    res.status(500).json({ error: 'Server error requesting password reset' });
  }
});

// Verify OTP and reset password endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, verification code, and new password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Verify OTP
    const isValid = await verifyOtp(cleanEmail, otp);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: { email: cleanEmail }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash and update password
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    res.json({ message: 'Your password has been reset successfully' });
  } catch (err) {
    console.error('❌ [Reset Password] Error:', err.message);
    res.status(500).json({ error: 'Server error resetting password' });
  }
});

// search users endpoint
app.get('/api/users/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const query = q.trim().toLowerCase();

    // Find users where username contains the query, excluding current user
    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: query,
          mode: 'insensitive'
        },
        NOT: {
          id: req.user.id
        }
      },
      select: {
        id: true,
        username: true,
        avatar: true,
        status: true
      },
      take: 10
    });

    res.json(users);
  } catch (err) {
    console.error('❌ [User Search] Error:', err.message);
    res.status(500).json({ error: 'Server error searching users' });
  }
});

// profile routes (protected)
app.get('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, avatar: user.avatar, banner: user.banner, bio: user.bio, socialLinks: user.socialLinks || {}, status: user.status, createdAt: user.createdAt, email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Server error fetching profile' });
  }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { bio, avatar, status, email, banner, socialLinks } = req.body;
    
    let emailUpdate = {};
    if (email !== undefined) {
      if (email === null || email.trim() === '') {
        emailUpdate = { email: null };
      } else {
        const cleanEmail = email.trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
          return res.status(400).json({ error: 'Invalid email address format' });
        }
        
        // Verify uniqueness
        const existingEmail = await prisma.user.findFirst({
          where: {
            email: cleanEmail,
            NOT: { id: req.user.id }
          }
        });
        if (existingEmail) {
          return res.status(400).json({ error: 'Email address is already in use' });
        }
        
        emailUpdate = { email: cleanEmail };
      }
    }
    
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(bio !== undefined && { bio }),
        ...(avatar !== undefined && { avatar }),
        ...(status !== undefined && { status }),
        ...(banner !== undefined && { banner }),
        ...(socialLinks !== undefined && { socialLinks }),
        ...emailUpdate
      }
    });

    res.json({ id: updated.id, username: updated.username, avatar: updated.avatar, banner: updated.banner, bio: updated.bio, socialLinks: updated.socialLinks || {}, status: updated.status, createdAt: updated.createdAt, email: updated.email });
  } catch (err) {
    console.error('❌ [Profile Update] Error:', err.message);
    res.status(500).json({ error: 'Server error updating profile' });
  }
});

// GET public profile of another user
app.get('/api/users/:id/profile', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sentRequests: {
          where: { status: 'ACCEPTED' }
        },
        receivedRequests: {
          where: { status: 'ACCEPTED' }
        }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const friendsCount = user.sentRequests.length + user.receivedRequests.length;

    res.json({
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      banner: user.banner,
      bio: user.bio,
      socialLinks: user.socialLinks || {},
      status: user.status,
      createdAt: user.createdAt,
      publicKey: user.publicKey || null,
      friendsCount
    });
  } catch (err) {
    console.error('❌ [User Public Profile GET] Error:', err.message);
    res.status(500).json({ error: 'Server error fetching user public profile' });
  }
});

// -------------------------------------------------------------
// E2EE PUBLIC KEY MANAGEMENT
// -------------------------------------------------------------

// Upload/update the authenticated user's ECDH public key
app.put('/api/keys/public', authenticateToken, async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: 'publicKey is required (JWK format JSON string)' });
    }

    // Validate that publicKey looks like a valid JWK
    try {
      const parsed = typeof publicKey === 'string' ? JSON.parse(publicKey) : publicKey;
      if (parsed.kty !== 'EC' || parsed.crv !== 'P-256') {
        return res.status(400).json({ error: 'publicKey must be an EC P-256 JWK' });
      }
    } catch (parseErr) {
      return res.status(400).json({ error: 'publicKey must be valid JSON (JWK format)' });
    }

    const keyString = typeof publicKey === 'string' ? publicKey : JSON.stringify(publicKey);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { publicKey: keyString }
    });

    console.log(`🔐 [E2EE] Public key uploaded for user: ${req.user.username}`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ [E2EE Key Upload] Error:', err.message);
    res.status(500).json({ error: 'Server error uploading public key' });
  }
});

// Fetch a friend's ECDH public key (requires accepted friendship)
app.get('/api/keys/public/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId: targetId } = req.params;
    const requesterId = req.user.id;

    // Verify they are accepted friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: requesterId, receiverId: targetId, status: 'ACCEPTED' },
          { senderId: targetId, receiverId: requesterId, status: 'ACCEPTED' }
        ]
      }
    });

    if (!friendship) {
      return res.status(403).json({ error: 'You can only fetch public keys of accepted friends' });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, publicKey: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: targetUser.id,
      username: targetUser.username,
      publicKey: targetUser.publicKey || null
    });
  } catch (err) {
    console.error('❌ [E2EE Key Fetch] Error:', err.message);
    res.status(500).json({ error: 'Server error fetching public key' });
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

// Web Push Notifications API Endpoints
app.get('/api/notifications/vapidPublicKey', (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

app.post('/api/notifications/subscribe', authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) {
    return res.status(400).json({ error: 'Subscription payload is required' });
  }
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        pushSubscription: JSON.stringify(subscription)
      }
    });
    res.json({ success: true, message: 'Subscribed to push notifications successfully' });
  } catch (err) {
    console.error('❌ [Push Subscribe] Error:', err.message);
    res.status(500).json({ error: 'Server error saving push subscription' });
  }
});

// Suggest friends based on mutual friends
app.get('/api/friends/suggestions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Get all friendships (PENDING, ACCEPTED, DECLINED) involving the user to build exclusion list
    const myFriendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      }
    });

    const excludeUserIds = new Set([userId]);
    myFriendships.forEach(f => {
      excludeUserIds.add(f.senderId);
      excludeUserIds.add(f.receiverId);
    });

    // 2. Identify the user's accepted friends
    const myFriendIds = myFriendships
      .filter(f => f.status === 'ACCEPTED')
      .map(f => f.senderId === userId ? f.receiverId : f.senderId);

    let suggestions = [];

    if (myFriendIds.length > 0) {
      // 3. Find accepted friendships of those friends (friends of friends)
      const peerFriendships = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: { in: myFriendIds } },
            { receiverId: { in: myFriendIds } }
          ]
        },
        include: {
          sender: true,
          receiver: true
        }
      });

      const candidatesMap = new Map();

      peerFriendships.forEach(f => {
        const isSenderFriend = myFriendIds.includes(f.senderId);
        const isReceiverFriend = myFriendIds.includes(f.receiverId);

        if (isSenderFriend && !isReceiverFriend) {
          const candidate = f.receiver;
          const friend = f.sender;
          if (!excludeUserIds.has(candidate.id)) {
            if (!candidatesMap.has(candidate.id)) {
              candidatesMap.set(candidate.id, {
                id: candidate.id,
                username: candidate.username,
                avatar: candidate.avatar,
                banner: candidate.banner,
                bio: candidate.bio,
                mutualFriends: []
              });
            }
            candidatesMap.get(candidate.id).mutualFriends.push(friend.username);
          }
        } else if (!isSenderFriend && isReceiverFriend) {
          const candidate = f.sender;
          const friend = f.receiver;
          if (!excludeUserIds.has(candidate.id)) {
            if (!candidatesMap.has(candidate.id)) {
              candidatesMap.set(candidate.id, {
                id: candidate.id,
                username: candidate.username,
                avatar: candidate.avatar,
                banner: candidate.banner,
                bio: candidate.bio,
                mutualFriends: []
              });
            }
            candidatesMap.get(candidate.id).mutualFriends.push(friend.username);
          }
        }
      });

      suggestions = Array.from(candidatesMap.values());
      // Sort by mutual friends count descending
      suggestions.sort((a, b) => b.mutualFriends.length - a.mutualFriends.length);
    }

    // 4. Fallback: If no suggestions found based on mutual friends, suggest random users
    if (suggestions.length === 0) {
      const otherUsers = await prisma.user.findMany({
        where: {
          id: { notIn: Array.from(excludeUserIds) }
        },
        take: 5,
        orderBy: { createdAt: 'desc' }
      });
      suggestions = otherUsers.map(u => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar,
        banner: u.banner,
        bio: u.bio,
        mutualFriends: []
      }));
    }

    res.json(suggestions);
  } catch (err) {
    console.error('❌ [Suggestions GET] Error:', err.message);
    res.status(500).json({ error: 'Server error fetching suggestions' });
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
          banner: targetUser.banner,
          bio: targetUser.bio,
          socialLinks: targetUser.socialLinks || {},
          status: targetUser.status,
          publicKey: targetUser.publicKey || null
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

// Secure Cloudinary signature generation endpoint (protected)
app.post('/api/cloudinary/sign', authenticateToken, (req, res) => {
  try {
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (!apiSecret || !apiKey || !cloudName) {
      console.warn('⚠️ [Cloudinary] Server credentials not configured fully in .env.');
      return res.status(500).json({ error: 'Cloudinary server credentials not configured.' });
    }

    const timestamp = Math.round((new Date()).getTime() / 1000);
    const folder = 'avatars';
    
    // Sort and calculate signature
    const paramString = `folder=${folder}&timestamp=${timestamp}`;
    const signature = crypto.createHash('sha1').update(paramString + apiSecret).digest('hex');

    res.json({
      signature,
      timestamp,
      folder,
      apiKey,
      cloudName
    });
  } catch (err) {
    console.error('❌ [Cloudinary Signature] Error:', err.message);
    res.status(500).json({ error: 'Server error generating signature' });
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
