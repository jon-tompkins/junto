// Envelope encryption for at-rest broker secrets (BYO Alpaca keys).
// AES-256-GCM with a 32-byte key from MANDATE_KEY_ENCRYPTION_KEY (base64).
// Stored format: "enc:v1:<iv>:<tag>:<ciphertext>" (all base64).
// Values without the prefix are treated as legacy plaintext and passed through
// on read, so this can ship before any existing rows are migrated.

import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function getKey(): Buffer {
  const raw = process.env.MANDATE_KEY_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'MANDATE_KEY_ENCRYPTION_KEY is not configured — cannot encrypt/decrypt broker secrets.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('MANDATE_KEY_ENCRYPTION_KEY must decode to 32 bytes (base64-encoded).');
  }
  return key;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString('base64')).join(':');
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted secret.');
  const [ivB64, tagB64, ctB64] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}
