# Chapp — Privacy-First Realtime Messaging Monorepo

Chapp is a sleek, modern, and privacy-focused messaging application designed around a **zero-server message storage philosophy**. Users completely own their conversation logs, saved in local-first database models directly inside their browser's IndexedDB.

## 📐 System Architecture & Flowchart

The overall architecture, data-flow pipelines, and security layers are structured as follows:

![Chapp System Architecture Flowchart](file:///C:/Users/Admin/.gemini/antigravity/brain/4433129b-6e23-4278-9ee6-601212a12483/chapp_flowchart_1779708950428.png)

```mermaid
flowchart TD
    subgraph Client App [Next.js Client - Local-First]
        A[(IndexedDB / Dexie.js)]
        B[Web Crypto API]
        C[PWA Service Worker]
        D[Next.js UI & WebSockets]
    end

    subgraph Transport [Transit / Relay]
        E{Socket.IO Server}
    end

    subgraph Server Cloud [Node.js Backend & Storage]
        F[(Upstash Redis Queue)]
        G[(Supabase PostgreSQL)]
        H[Hourly Media Cleanup Worker]
    end

    D -- 1. Sends Chat --> E
    E -- 2a. Recipient Online: Relay Message --> D
    E -- 2b. Recipient Offline: Buffer Set (7-Day TTL) --> F
    F -- 3. Recipient Log In: Drain & Deliver --> D
    
    A -- 4. Local Database Dump --> B
    B -- 5. PBKDF2 + AES-GCM Encryption --> B
    B -- 6. Sync Encrypted Backup Payload --> G
    G -- 7. Fetch & Decrypt with Password --> B
    B -- 8. Merge Restored Data --> A
```

---

## 🛡️ Privacy & Technical Features

1. **Zero-Server Storage Philosophy**:
   - The Express backend serves as a transient memory pipe. When a message is sent, the server relays it to the online recipient and deletes it instantly.
   - If a recipient is offline, messages are stored in Upstash Redis as temporary queues with a **7-Day TTL (automatic deletion)**. They are popped and written to the client's local database the moment the recipient logs in.

2. **Zero-Knowledge Cloud Backup**:
   - Chat logs can be backed up to the cloud securely. The client uses the native browser **Web Crypto API** (`SubtleCrypto`) to encrypt the IndexedDB payload locally using a user-defined passphrase.
   - We derive a 256-bit AES-GCM key using `PBKDF2` (SHA-256, 100,000 iterations, random 16-byte salt) and encrypt the data with `AES-GCM` (random 12-byte IV).
   - The server only stores the string `saltHex:ivHex:ciphertextBase64` inside PostgreSQL. The server never sees your password and cannot decrypt your chats.

3. **Offline-First Dexie.js Database**:
   - Chats, messages, and friend relationships are stored locally in the browser's IndexedDB.

4. **Double-Checkmark Delivery Ticks**:
   - `sending` ➔ Gray Clock.
   - `delivered` ➔ Single Gray Tick (reaches server/Redis queue).
   - `ack` ➔ Neon Cyan Double Tick (written to recipient's local DB).

5. **PWA Integration**:
   - Install prompt banners, offline caching, andStandalone viewport windows.

6. **Mobile UI Optimizations**:
   - Responsive layout splits toggling automatically between sidebar lists and active chats. Includes native navigation controls and dynamic sizing (`100dvh`).

---

## ⚙️ Monorepo Configurations

Create and fill the `.env` files in both directories:

### A. Backend Configuration: `/server/.env`
Create a `.env` file inside the `server/` directory:
```env
PORT=5000
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres?pgbouncer=true"
JWT_SECRET="generate_a_random_secure_secret_string"
REDIS_URL="YOUR_UPSTASH_REDIS_CONNECTION_STRING_HERE"
FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID_HERE"
```

### B. Frontend Configuration: `/client/.env`
Create a `.env` file inside the `client/` directory:
```env
NEXT_PUBLIC_BACKEND_URL="https://chapp-oxa7.onrender.com"

# Firebase Client SDK Configuration (Optional - Falls back to Demo Mode if empty)
NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-auth-domain"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
```

---

## 🚀 Running the Application Locally

### 1. Start the Express Backend
Open a terminal in the `/server` folder:
```bash
# Install dependencies
npm install

# Push database schema to Supabase & generate client
npx prisma db push

# Start server in development mode
npm run dev
```

### 2. Start the Next.js Frontend
Open a separate terminal in the `/client` folder:
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser and start chatting securely!
