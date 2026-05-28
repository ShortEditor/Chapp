# Chapp — Privacy-First Realtime Messaging

Chapp is a sleek, modern, privacy-focused messaging app built around a **zero-server message storage philosophy**. All conversations are stored locally in the browser's IndexedDB — the server never sees your plaintext messages.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client [Client App - Next.js 16]
        A[(IndexedDB / Dexie.js)]
        B[Web Crypto API]
        C[PWA Service Worker]
        D[Socket.io Client]
        M[Next.js 16 UI]
    end

    subgraph Relay [Realtime Layer]
        E{Socket.io Server}
    end

    subgraph Server [Backend - Node.js / Express]
        F[(Upstash Redis)]
        G[(Supabase PostgreSQL)]
        H[Hourly Media Purge]
    end

    M -- REST: Auth / Profile / Groups --> Server
    D -- WebSocket: Send Message / Reactions --> E
    E -- Relay Online --> D
    E -- Buffer Offline (7d TTL) --> F
    F -- Deliver on Login --> D
    A -- Export --> B
    B -- PBKDF2 + AES-GCM --> G
    G -- Fetch Backup --> B
    B -- Decrypt + Merge --> A
```

---

## Tech Stack

### Frontend
| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Local DB | Dexie.js (IndexedDB) |
| Crypto | Web Crypto API (SubtleCrypto) |
| Realtime | Socket.io-client |
| Styling | Vanilla CSS + Tailwind CSS v4 |
| Icons | Lucide React |
| PWA | Service Workers + Web App Manifest |

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js + Express |
| Realtime | Socket.io |
| Database | Supabase (PostgreSQL via Prisma) |
| Cache / Queue | Upstash Redis (offline message buffer) |
| Media | Cloudinary (auto-purged after 1h) |
| Auth | JWT (jsonwebtoken) + bcrypt |
| Push Notifications | Web Push (VAPID) |

### Infrastructure
| Service | Provider | Tier |
|---|---|---|
| Frontend | Vercel | Free |
| Backend | Render | Free |
| Database | Supabase | Free |
| Media CDN | Cloudinary | Free |
| Cache | Upstash Redis | Free |

---

## Features

### 💬 Messaging
- **End-to-End Encrypted (E2EE)** — ECDH key exchange + AES-GCM per 1:1 conversation
- **Local-first storage** — messages live in IndexedDB, never persisted on server
- **Offline message queue** — messages buffered in Redis, delivered on reconnect (7-day TTL)
- **Read receipts** — single tick (sent) → single tick (delivered) → double tick (read)
- **Media sharing** — images, videos, files via Cloudinary (auto-purged after 1 hour)
- **WhatsApp-style reply** — swipe right on any message to reply with quoted preview
- **Emoji reactions** — 8 emoji reactions per message, real-time sync to other users
- **Typing indicators** — live typing status (1:1 conversations)
- **Message unsend** — delete for both sides in real-time

### 📸 Stories & Snaps
- **Horizontal Stories Bar** — Dynamic, circular story view matching premium design layouts with custom dashed containers for unposted self-stories, and glowing hot-pink gradients (`bg-gradient-to-tr from-[#7c3aed] to-[#FF4081]`) for active friend stories.
- **Self-Destructing Snaps** — View-once private media attachments that completely purge from the sender, receiver, and server upon closing (10s viewing limit).
- **24-Hour Snap Auto-Expiration** — Background cleanup engine that automatically deletes and self-destructs unopened Snaps older than 24 hours to preserve complete offline privacy.
- **Premium Snaps UI** — Breathtaking chat-bubble designs featuring neon-pink pulsing rings, glassmorphic backgrounds, animated camera icons, and custom status tracking.
- **Snap Screen Camera Overlay** — Ultra-modern full-screen dark camera card modal featuring real-time image filters (Original, Noir, Vintage), active camera flip mechanics, elegant double-ring shutter action, and authorization guides.

### 👥 Group Messaging
- **Group Chats** — create multi-member groups with a description and optional avatar
- **Realtime Fan-out** — socket server broadcasts messages and emoji reactions to all online group members
- **Offline Buffer Queues** — group messages for offline members are placed into their individual Redis queues and synchronized instantly upon reconnecting
- **Admin Control Panel** — group creators are designated admins who can add new friends, remove members, or delete the group
- **Leave / Delete Group** — users can leave any group, and admins can fully dissolve groups

### 👤 Profiles
- **Avatar upload** — via Cloudinary
- **Banner image** — click banner to upload/replace
- **Bio** — short personal description
- **Social links** — Instagram, Facebook, YouTube, X/Twitter, LinkedIn, GitHub, TikTok, Snapchat, WhatsApp, Phone (all optional, show as tappable icons)
- **User profile modal** — click any avatar/username to view their profile with Message + Add Friend actions

### 👥 Friends & Social
- **Friend requests** — send, accept, decline
- **Discover users** — search by username
- **Online presence** — real-time online/offline status
- **Friends tab** — live search, quick message/add actions

### 🔒 Privacy & Security
- **Zero knowledge backup** — chats encrypted client-side (PBKDF2 + AES-GCM + deflate compression) before upload; server stores only ciphertext
- **No plaintext on server** — ever
- **Password-protected restore** — passphrase never leaves the device
- **WebRTC Signaling Friend Checks** — WebRTC connection attempts require friendship validation to prevent signaling attacks from non-friends

### 📱 Mobile
- **PWA installable** — "Add to Home Screen" for app-like experience
- **Swipe to reply** — swipe right on message triggers reply with spring-back animation
- **Long-press action sheet** — bottom sheet with emoji reactions, reply, and delete
- **Push notifications** — Web Push for offline messages

### 📞 Voice Calls
- **P2P WebRTC voice calls** — direct peer-to-peer, no server relay
- **Mute / Speaker toggle**
- **Call duration timer**

---

## Project Structure

```
chapp/
├── client/                  # Next.js 16 frontend (Vercel)
│   ├── src/
│   │   ├── app/
│   │   │   ├── chat/        # Main chat page (~4200 lines, core UI)
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── forgot-password/
│   │   ├── context/
│   │   │   └── SocketContext.js   # Socket, E2EE, IndexedDB logic
│   │   └── lib/
│   │       └── crypto.js          # PBKDF2/AES-GCM backup encryption
│   └── public/
│       └── sw.js            # Service Worker (PWA + push)
│
└── server/                  # Express + Socket.io backend (Render)
    ├── src/
    │   └── server.js        # All REST + Socket.io handlers (~1600 lines)
    └── prisma/
        └── schema.prisma    # PostgreSQL schema
```

---

## Database Schema (Prisma)

```prisma
model User {
  id               String   @id @default(uuid())
  username         String   @unique
  email            String   @unique
  passwordHash     String
  avatarUrl        String?
  bannerUrl        String?
  bio              String?
  socialLinks      Json?    // { instagram, facebook, youtube, twitter, ... }
  publicKey        String?  // ECDH public key for E2EE
  encryptedPrivKey String?  // Private key encrypted with user password
  pushSubscription String?  // Web Push subscription object
  backupData       String?  // Encrypted backup ciphertext
  createdAt        DateTime @default(now())
  friendships      Friendship[]
  groupMemberships GroupMember[]
}

model Friendship {
  id         String   @id @default(uuid())
  userId     String
  friendId   String
  status     String   // "pending" | "accepted"
  createdAt  DateTime @default(now())
  user       User     @relation(...)
}

model Group {
  id          String        @id @default(uuid())
  name        String
  description String?
  avatar      String?
  createdById String
  createdAt   DateTime      @default(now())
  members     GroupMember[]
}

model GroupMember {
  id       String   @id @default(uuid())
  groupId  String
  userId   String
  role     String   // "admin" | "member"
  joinedAt DateTime @default(now())
  group    Group    @relation(fields: [groupId], onDelete: Cascade)
  user     User     @relation(fields: [userId], onDelete: Cascade)

  @@unique([groupId, userId])
}
```

---

## Local Setup

### Prerequisites
- Node.js 18+
- A Supabase project (PostgreSQL)
- A Upstash Redis database
- A Cloudinary account
- A Render account (or any Node host)

### Server

```bash
cd server
npm install

# Create .env
DATABASE_URL=postgresql://...
REDIS_URL=rediss://...
JWT_SECRET=your_secret
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

npx prisma generate
npx prisma db push
npm start
```

### Client

```bash
cd client
npm install

# Create .env.local
NEXT_PUBLIC_BACKEND_URL=https://your-render-service.onrender.com

npm run dev
```

---

## Backup System

Chapp's backup is fully zero-knowledge:

1. **Export** — all IndexedDB messages serialized to JSON
2. **Compress** — deflate-raw via browser-native `CompressionStream` (~70% size reduction)
3. **Encrypt** — PBKDF2 key derivation (100,000 iterations, SHA-256) + AES-GCM 256-bit encryption
4. **Upload** — encrypted ciphertext stored in Supabase under the user's row
5. **Restore** — download ciphertext → decrypt with passphrase → decompress → merge into IndexedDB

The server stores only the ciphertext string. Without the passphrase, it is computationally infeasible to recover the data.

---

## Capacity (Free Tier)

| Service | Limit | At 500 users |
|---|---|---|
| Supabase DB | 500 MB | ~75 MB ✅ |
| Render RAM | 512 MB | ~50-100 concurrent ✅ |
| Cloudinary | 1 GB storage | ~250-500 MB ✅ |
| Vercel | 100 GB/month | Not a concern ✅ |

---

## License

MIT
