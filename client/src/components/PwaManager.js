'use client';

import { useEffect, useState } from 'react';

export default function PwaManager() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 1. Register custom service worker
    if ('serviceWorker' in navigator && window.location.hostname !== 'localhost') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((reg) => console.log('🤖 [PWA] Service Worker registered with scope:', reg.scope))
          .catch((err) => console.error('❌ [PWA] Service Worker registration failed:', err));
      });
    }

    // 2. Check if running in standalone display mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
      setIsInstallable(false);
    }

    // 3. Listen for browser install prompt trigger
    const handleBeforeInstallPrompt = (e) => {
      // Prevent default mini-infobar on mobile
      e.preventDefault();
      // Store event for custom UI button trigger
      setDeferredPrompt(e);
      setIsInstallable(true);

      // Expose to window so other components can access the install handler
      window.deferredPrompt = e;
      window.dispatchEvent(new CustomEvent('pwa-installable', { detail: true }));
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 4. Listen for successful installation event
    const handleAppInstalled = () => {
      console.log('🎉 [PWA] Chapp was successfully installed on the device!');
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
      window.dispatchEvent(new CustomEvent('pwa-installed'));
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforebeforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  return null; // Headless component providing app-level listeners
}

/**
 * Triggers the browser native PWA installation dialog
 */
export async function triggerPwaInstallation() {
  const prompt = window.deferredPrompt;
  if (!prompt) {
    console.warn('⚠️ [PWA] Install prompt is not available.');
    return false;
  }

  // Show prompt
  prompt.prompt();

  // Wait for user choices
  const { outcome } = await prompt.userChoice;
  console.log(`🤖 [PWA] User response to installation: ${outcome}`);

  if (outcome === 'accepted') {
    window.deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installable', { detail: false }));
    return true;
  }

  return false;
}
