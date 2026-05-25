# Chapp — Privacy-First Realtime Messaging PWA

Chapp is a sleek, modern, cinematic, and privacy-focused messaging platform where **users fully own their conversations**. 

### 🛡️ Privacy Architecture:
* **Zero Server Storage**: Chats, messages, and contacts are stored exclusively inside the user's browser-based **IndexedDB** using **Dexie.js**.
* **Temporary Queue**: The server acts strictly as a transport layer. If a recipient is offline, messages are queued temporarily in **Upstash Redis** (with an automatic 7-day TTL expiration). Upon delivery, messages are immediately purged from the server database/queue.
* **Ephemeral Media sharing**: Attachments are uploaded to the backend server and auto-deleted by a background cron-worker after 24 hours. The client downloads them instantly and caches them as binary Blobs locally in IndexedDB.

---

## 🚀 Step 1: External Services Setup Guide

Chapp leverages three free-tier services to maintain scalability and low costs. Set them up using the guidelines below:

### 1. Supabase (Persistent Database)
Supabase hosts user profiles and friend relationships.
1. Sign up/Log in at [Supabase](https://supabase.com).
2. Create a new free project (choose a database password and save it).
3. Once the database is ready, go to **Project Settings** ➔ **Database** ➔ **Connection String** ➔ **URI**.
4. Copy the connection string. It will look like this:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxx.supabase.co:5432/postgres?pgbouncer=true`
5. Keep this URL ready for the **Server Environment Config**.

### 2. Firebase Console (Google Authentication)
Firebase handles secure, passwordless one-click "Continue with Google" sign-in.
1. Sign up/Log in at [Firebase Console](https://console.firebase.google.com).
2. Click **Add Project** and follow the prompt (Google Analytics can be disabled).
3. Once created, click the **Web icon (</>)** in the center of your project dashboard to register a new Web App (name it `Chapp`).
4. Copy the initialized `firebaseConfig` object containing:
   * `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
5. In the left sidebar of the Firebase console, go to **Build** ➔ **Authentication** ➔ click **Get Started**.
6. Under the **Sign-in method** tab, click **Google** ➔ enable it ➔ choose a project support email ➔ click **Save**.
7. Keep these keys ready for the **Client Environment Config**.

### 3. Upstash (Temporary Redis Queue)
Upstash Redis queues offline messages temporarily.
1. Sign up/Log in at [Upstash Console](https://console.upstash.com).
2. Under the **Redis** tab, click **Create Database** (Select standard free tier, select region closest to you).
3. Scroll down to the **Connection Details** section, locate the **UPSTASH_REDIS_REST_URL** or **REDIS_URL**.
4. Copy the `rediss://...` connection string.
5. Keep this URL ready for the **Server Environment Config**.

---

## ⚙️ Step 2: Environment Configurations

Create and fill the `.env` files in both directories:

### A. Backend Configuration: `/server/.env`
Create a `.env` file inside the `server/` directory and configure the variables:
```env
PORT=5000
DATABASE_URL="YOUR_SUPABASE_CONNECTION_STRING_HERE"
JWT_SECRET="generate_a_random_secure_secret_string"
REDIS_URL="YOUR_UPSTASH_REDIS_CONNECTION_STRING_HERE"
FIREBASE_PROJECT_ID="YOUR_FIREBASE_PROJECT_ID_HERE"
```

### B. Frontend Configuration: `/client/.env`
Create a `.env` file inside the `client/` directory and configure the variables:
```env
NEXT_PUBLIC_BACKEND_URL="http://localhost:5000"

# Firebase Client SDK Configuration
NEXT_PUBLIC_FIREBASE_API_KEY="your-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-auth-domain"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-storage-bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"
```
*(Note: If the Firebase variables are left blank, Chapp will automatically load in **Developer Demo Mode** to allow local sign-ins without Google popup errors).*

---

## 📦 Step 3: Run the Application

### 1. Initialize and Start the Backend
Open a terminal in the `/server` folder:
```bash
# Install server dependencies
npm install

# Push database schema to Supabase and generate Prisma client
npx prisma db push

# Start backend in development mode (nodemon hot reloading)
npm run dev
```
* **Endpoint:** `http://localhost:5000`
* Check the logs to verify it successfully connects to Supabase and Upstash Redis.

### 2. Start the Next.js Frontend
Open a new, separate terminal in the `/client` folder:
```bash
# Install client dependencies
npm install

# Start Next.js development server
npm run dev
```
* **Endpoint:** [http://localhost:3000](http://localhost:3000)

Open [http://localhost:3000](http://localhost:3000) in your browser to start chatting securely and install Chapp as a PWA!
