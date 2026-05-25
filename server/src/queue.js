import IORedis from 'ioredis';
import { Redis as UpstashRedis } from '@upstash/redis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

let redisClient = null;
let isUpstashRest = false;
const inMemoryQueue = new Map();

// Initialize Redis based on environment variables
if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
  try {
    // 1. Initialize Upstash HTTP/REST Redis client (Zero-TCP configuration)
    redisClient = new UpstashRedis({
      url: UPSTASH_REDIS_REST_URL,
      token: UPSTASH_REDIS_REST_TOKEN
    });
    isUpstashRest = true;
    console.log('🔌 [Queue] Connected to Upstash Redis via HTTP REST Client.');
  } catch (err) {
    console.error('⚠️ [Queue] Failed to initialize Upstash REST client:', err.message);
    redisClient = null;
  }
} else if (REDIS_URL) {
  try {
    // 2. Initialize standard TCP Redis client
    redisClient = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });

    redisClient.on('connect', () => {
      console.log('🔌 [Queue] Connected to Redis Queue via TCP client successfully.');
    });

    redisClient.on('error', (err) => {
      console.error('⚠️ [Queue] Redis TCP connection error, falling back to local memory queue:', err.message);
      redisClient = null;
    });
  } catch (err) {
    console.error('⚠️ [Queue] Failed to initialize Redis TCP client:', err.message);
    redisClient = null;
  }
} else {
  console.log('ℹ️ [Queue] No Redis credentials found. Running with high-reliability local in-memory queue fallback.');
}

/**
 * Temporarily queue a message for an offline user.
 * Messages automatically expire after 7 days to conserve space and respect user privacy.
 */
export async function enqueueMessage(receiverId, message) {
  const ttlSeconds = 7 * 24 * 60 * 60; // 7 days in seconds
  const messageStr = JSON.stringify(message);

  if (redisClient) {
    try {
      const key = `offline_queue:${receiverId}`;
      if (isUpstashRest) {
        // Upstash REST client API
        await redisClient.rpush(key, messageStr);
        await redisClient.expire(key, ttlSeconds);
      } else {
        // ioredis TCP client API
        await redisClient.rpush(key, messageStr);
        await redisClient.expire(key, ttlSeconds);
      }
      return true;
    } catch (err) {
      console.error('❌ [Queue] Redis enqueue error, falling back to in-memory queue:', err.message);
    }
  }

  // Fallback in-memory implementation
  if (!inMemoryQueue.has(receiverId)) {
    inMemoryQueue.set(receiverId, []);
  }
  
  const userQueue = inMemoryQueue.get(receiverId);
  userQueue.push({
    data: message,
    expiresAt: Date.now() + (ttlSeconds * 1000)
  });

  return true;
}

/**
 * Fetch and remove all temporarily queued messages for a newly online user.
 */
export async function dequeueMessages(receiverId) {
  if (redisClient) {
    try {
      const key = `offline_queue:${receiverId}`;
      if (isUpstashRest) {
        // Upstash REST client API (rpush/lrange returns array of strings/objects depending on format)
        const messages = await redisClient.lrange(key, 0, -1);
        await redisClient.del(key);
        // Upstash REST client automatically parses strings into objects if JSON was sent, 
        // but we double-parse safely to be absolutely robust
        return messages.map(msg => typeof msg === 'string' ? JSON.parse(msg) : msg);
      } else {
        // ioredis TCP client API
        const messages = await redisClient.lrange(key, 0, -1);
        await redisClient.del(key);
        return messages.map(msg => JSON.parse(msg));
      }
    } catch (err) {
      console.error('❌ [Queue] Redis dequeue error, falling back to in-memory queue:', err.message);
    }
  }

  // Fallback in-memory implementation
  if (!inMemoryQueue.has(receiverId)) {
    return [];
  }

  const now = Date.now();
  const rawQueue = inMemoryQueue.get(receiverId);
  
  const validMessages = [];
  for (const item of rawQueue) {
    if (item.expiresAt > now) {
      validMessages.push(item.data);
    }
  }

  inMemoryQueue.delete(receiverId);
  return validMessages;
}

/**
 * Get the count of pending offline messages for a user
 */
export async function getQueueLength(receiverId) {
  if (redisClient) {
    try {
      const key = `offline_queue:${receiverId}`;
      return await redisClient.llen(key);
    } catch (err) {
      // ignore, use fallback
    }
  }

  if (!inMemoryQueue.has(receiverId)) {
    return 0;
  }
  return inMemoryQueue.get(receiverId).length;
}
