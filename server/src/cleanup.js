import fs from 'fs';
import path from 'path';

const UPLOADS_DIR = path.resolve('uploads');

/**
 * Scan uploads/ and delete files older than 24 hours
 */
export function purgeOldMedia() {
  console.log('🧹 [Cleanup] Scanning uploads folder for expired media...');
  
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    return;
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
