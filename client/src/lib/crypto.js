/**
 * Zero-Knowledge client-side encryption using native Web Crypto API.
 * Password-based key derivation (PBKDF2) + AES-GCM symmetric encryption.
 */

// Helper to convert Uint8Array to hex string
function bufToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper to convert hex string to Uint8Array
function hexToBuf(hex) {
  const matches = hex.match(/.{1,2}/g);
  if (!matches) return new Uint8Array(0);
  return new Uint8Array(matches.map(byte => parseInt(byte, 16)));
}

// Helper to convert binary string to Uint8Array (Base64 decoding)
function base64ToBuf(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper to convert ArrayBuffer to Base64
function bufToBase64(buffer) {
  const binaryString = String.fromCharCode(...new Uint8Array(buffer));
  return btoa(binaryString);
}

/**
 * Encrypt data using a user-provided password
 * @param {string} dataJson Plaintext JSON string to encrypt
 * @param {string} password Secret passphrase
 * @returns {Promise<string>} Format: 'saltHex:ivHex:ciphertextBase64'
 */
export async function encryptData(dataJson, password) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // 1. Import raw password as key material for derivation
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // 2. Generate random 16-byte salt
  const salt = window.crypto.getRandomValues(new Uint8Array(16));

  // 3. Derive 256-bit AES key from password + salt
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // 4. Generate random 12-byte IV for AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  // 5. Encrypt plaintext JSON payload
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    encoder.encode(dataJson)
  );

  // 6. Format output: salt_hex:iv_hex:ciphertext_base64
  const saltHex = bufToHex(salt);
  const ivHex = bufToHex(iv);
  const ciphertextBase64 = bufToBase64(ciphertextBuffer);

  return `${saltHex}:${ivHex}:${ciphertextBase64}`;
}

/**
 * Decrypt data using a user-provided password
 * @param {string} backupString Format: 'saltHex:ivHex:ciphertextBase64'
 * @param {string} password Secret passphrase
 * @returns {Promise<string>} Decrypted plaintext JSON string
 */
export async function decryptData(backupString, password) {
  const parts = backupString.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid backup file structure.');
  }

  const [saltHex, ivHex, ciphertextBase64] = parts;
  const salt = hexToBuf(saltHex);
  const iv = hexToBuf(ivHex);
  const ciphertext = base64ToBuf(ciphertextBase64);

  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // 1. Import raw password as key material for derivation
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // 2. Derive 256-bit AES key from password + salt (must match derivation details in encrypt)
  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // 3. Decrypt ciphertext payload
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    aesKey,
    ciphertext
  );

  // 4. Decode array buffer back to JSON string
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
