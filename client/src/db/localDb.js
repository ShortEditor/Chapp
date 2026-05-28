import Dexie from 'dexie';

// Initialize the local-first client Dexie database
const db = new Dexie('ChappDatabase');

// Define database schema
// Database stores conversations and contacts only on the user's device.
// Keys are defined as: primaryKey, index1, index2...
db.version(1).stores({
  friends: 'id, username, avatar, bio, status',
  chats: 'friendId, lastMessageText, lastMessageTime, unreadCount',
  messages: 'id, chatId, senderId, receiverId, text, mediaUrl, mediaType, timestamp, status'
});

db.version(2).stores({
  e2eeKeys: 'id'
});

db.version(3).stores({
  groups: 'id, name, avatar, description, createdById'
});

export default db;
