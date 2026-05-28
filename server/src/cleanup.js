import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.resolve('uploads');

/**
 * Scan uploads/ and delete files older than 24 hours,
 * BUT skip files that are currently used as user avatars.
 */
export async function purgeOldMedia() {
  console.log('🧹 [Cleanup] Scanning uploads folder for expired media...');

  // Purge expired stories from database
  try {
    const deletedStories = await prisma.story.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (deletedStories.count > 0) {
      console.log(`🗑️ [Cleanup] Purged ${deletedStories.count} expired story record(s) from database.`);
    }
  } catch (err) {
    console.error('⚠️ [Cleanup] Could not purge expired stories:', err.message);
  }
  
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    return;
  }

  // Collect all filenames currently used as avatar URLs in the database
  const protectedFilenames = new Set();
  try {
    const users = await prisma.user.findMany({
      where: { avatar: { contains: '/api/media/download/' } },
      select: { avatar: true }
    });
    users.forEach(u => {
      if (u.avatar) {
        // Extract filename from URL like ".../api/media/download/abc123.jpg"
        const parts = u.avatar.split('/');
        const filename = parts[parts.length - 1];
        if (filename) protectedFilenames.add(filename);
      }
    });
    if (protectedFilenames.size > 0) {
      console.log(`🛡️ [Cleanup] Protecting ${protectedFilenames.size} avatar file(s) from deletion.`);
    }
  } catch (err) {
    console.error('⚠️ [Cleanup] Could not fetch avatar references from DB:', err.message);
  }

  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) {
      console.error('❌ [Cleanup] Error reading uploads directory:', err.message);
      return;
    }

    let deletedCount = 0;

    files.forEach(file => {
      // Skip files that are in use as avatars
      if (protectedFilenames.has(file)) {
        return;
      }

      const filePath = path.join(UPLOADS_DIR, file);

      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error(`❌ [Cleanup] Error statting file ${file}:`, err.message);
          return;
        }

        const fileAgeMs = now - stats.mtimeMs;

        if (fileAgeMs > maxAgeMs) {
          fs.unlink(filePath, err => {
            if (err) {
              console.error(`❌ [Cleanup] Error deleting file ${file}:`, err.message);
            } else {
              deletedCount++;
              console.log(`🗑️ [Cleanup] Deleted expired media: ${file} (Age: ${Math.round(fileAgeMs / 3600000)} hours)`);
            }
          });
        }
      });
    });
  });
}

/**
 * Start the cleanup worker on an hourly interval
 */
export function startCleanupWorker() {
  // Run immediately on start
  purgeOldMedia();

  // Run every hour
  const hourlyMs = 60 * 60 * 1000;
  setInterval(purgeOldMedia, hourlyMs);
  
  console.log('⏰ [Cleanup] Temporary media cleanup service initialized (Hourly scan).');
}
