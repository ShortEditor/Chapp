# Chapp — Privacy-First Realtime Messaging Monorepo

Chapp is a sleek, modern, and privacy-focused messaging application designed around a **zero-server message storage philosophy**. Users completely own their conversation logs, saved in local-first database models directly inside their browser's IndexedDB.

---

## 📐 System Architecture Diagram

Below is the diagrammatic representation of Chapp's system architecture showing the components, interfaces, and overall runtime data-flow pipelines:

![Chapp System Architecture Diagram](file:///C:/Users/Admin/.gemini/antigravity/brain/4433129b-6e23-4278-9ee6-601212a12483/chapp_architecture_diagram_1779862489170.png)

### Architectural Flowchart
```mermaid
flowchart TD
    subgraph Client [Client App - Next.js 16 Web App]
        A[(IndexedDB / Dexie.js)]
        B[Web Crypto API]
        C[PWA Service Worker]
        D[Socket.io Client]
        M[Next.js 16 UI Pages]
    end

    subgraph Relaying [Transit & Realtime Layer]
        E{Socket.io Server}
    end

    subgraph Server [Backend Cloud - Node.js & Express]
        F[(Upstash Redis Cache)]
        G[(Supabase PostgreSQL)]
        H[Hourly Media Purge Worker]
    end

    M -- REST API: Signup / Login --> Server
    M -- REST API: Forgot Password (OTP) --> Server
    D -- WebSocket: Send Message --> E
    E -- Message Relayed (Online) --> D
    E -- Buffers Message (Offline, 7-Day TTL) --> F
    F -- Pull & Deliver on Login --> D
    
    A -- Local Database Export --> B
    B -- PBKDF2 + AES-GCM Encryption --> B
    B -- Sync Encrypted Backup Payload --> G
    G -- Fetch Backup --> B
    B -- Local Passphrase Decryption --> B
    B -- Merge Restored Data --> A
```

---

## 🛠️ Complete Technology Stack

### 1. Frontend & Client-side
* **Framework**: [Next.js 16 (App Router)](https://nextjs.org/) for highly performant server-side rendering, routing, and UI logic.
* **Local Database**: [Dexie.js](https://dexie.org/) (wrapper around native browser **IndexedDB**) for offline-first, local-only conversation storage.
* **Cryptography**: Native browser [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) (`SubtleCrypto`) for local zero-knowledge encryption of chat data.
* **Realtime Communication**: [Socket.io-client](https://socket.io/) configured to connect directly using WebSocket transport first (with fallback to polling).
* **Styling & Theme**: Vanilla CSS + [Tailwind CSS v4](https://tailwindcss.com/) for fluid glassmorphic layouts, dark mode accents, custom buttons, and smooth animations.
* **Icons**: [Lucide React](https://lucide.dev/) for crisp, scalable vectors.
* **Notifications & PWA**: Service Workers with progressive web app manifestation for installability, offline assets caching, and native standalone window layouts.

### 2. Backend & Server-side
* **Runtime**: [Node.js](https://nodejs.org/) & [Express.js](https://expressjs.com/) REST APIs.
* **Database ORM**: [Prisma](https://www.prisma.io/) to generate types and perform operations against the PostgreSQL database.
* **Realtime Communication**: [Socket.io](https://socket.io/) server integrated directly with Express HTTP servers to handle low-latency socket multiplexing.
* **Email Service**: [Nodemailer](https://nodemailer.com/) with an SMTP transporter for sending password reset verification codes (OTP).

### 3. Third-party Cloud Infrastructure
* **PostgreSQL Database**: [Supabase](https://supabase.com/) hosting the primary database.
* **Cache & Memory Queues**: [Upstash Redis](https://upstash.com/) for offline message buffers and 6-digit OTP code storage.
* **Media Uploads**: [Cloudinary](https://cloudinary.com/) for ephemeral image/video storage (cleaned up hourly by background cron scripts).

---

## 🔄 Core Working Flows & Pipelines

### 1. Zero-Server Storage Messaging Flow
1. **Send Message**: A user sends a message. The client generates a local message record in IndexedDB and broadcasts a `send-message` event via Socket.io.
2. **Server Relay**:
   * **If Recipient is Online**: The server immediately forwards the message to the recipient's active socket connection. Once the client confirms receipt (`ack` event), the message is instantly cleared from the server's memory.
   * **If Recipient is Offline**: The server writes the message block into a temporary queue inside **Upstash Redis** with an expiration **TTL of 7 Days**.
3. **Queue Draining**: As soon as the recipient logs back in, the client connects to Socket.io, causing the server to fetch, pop, and deliver all queued messages from Redis. Once received, the messages are deleted from Redis.

### 2. Zero-Knowledge Backup Sync Flow
1. **Export**: The client extracts all local conversation logs, message tables, and friend relationships from IndexedDB into a JSON blob.
2. **Derive Keys**: The browser prompts the user for a secret passphrase. The Web Crypto API derives a 256-bit AES key using `PBKDF2` (100,000 SHA-256 iterations and a random 16-byte salt).
3. **Encrypt**: The client encrypts the JSON blob locally using `AES-GCM` (utilizing a unique 12-byte initialization vector `IV`).
4. **Upload**: The final payload (`saltHex:ivHex:ciphertextBase64`) is transmitted via a secure PUT request to `/api/backup`. The server saves the string into PostgreSQL. **The server never receives the passphrase or the AES key, making the backup 100% private.**

### 3. Recovery Email & Forgot Password OTP Flow
1. **Signup Email Capture**: Users supply a recovery email during registration. This email is validated and stored securely in Supabase under a unique constraint.
2. **OTP Generation**: If a user forgets their password, they input their recovery email. The server verifies the account, generates a secure 6-digit random code, and caches it in Redis using the key structure `otp:email` with a **10-minute expiration TTL**.
3. **OTP Dispatch**: The server fires an email containing the OTP via Nodemailer. *(Falls back to standard console logging in local development environments).*
4. **Password Reset**: The user inputs the 6-digit OTP and their new password. The server checks the value against Redis. If verified, it hashes the new password with `bcryptjs`, updates the database record, and deletes the OTP code from Redis.

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
