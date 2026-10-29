// Envelope encryption for at-rest broker / venue secrets (Alpaca BYO secrets,
// Hyperliquid agent private keys).
//
// Cipher: AES-256-GCM, fresh random 96-bit IV per encryption.
//
// Formats (all segments base64):
//   v2 (current): "enc:v2:<kid>:<iv>:<tag>:<ciphertext>"   <- <kid> names the master key used
//   v1 (legacy) : "enc:v1:<iv>:<tag>:<ciphertext>"          <- no key id; tried against every key
//   anything else = legacy PLAINTEXT, passed through on read (unless
//   MANDATE_KEY_REQUIRE_ENCRYPTED=1, which makes plaintext reads throw).
//
// Master keys come from the environment only (never the DB):
//   MANDATE_KEY_ENCRYPTION_KEYS  "kid:base64key,kid2:base64key"  keyring. The FIRST entry
//                                is the current key (used to encrypt); the rest are old
//                                keys kept only so existing rows still decrypt.
//   MANDATE_KEY_ENCRYPTION_KEY   single 32-byte base64 key (original var). Used as kid "k1"
//                                when the keyring var is absent, and also still honoured as
//                                a decrypt-only fallback key when the keyring is set.
// Rotation: add a new key at the FRONT of MANDATE_KEY_ENCRYPTION_KEYS, deploy, run
// scripts/reencrypt-mandate-secrets.ts, then drop the old key.
//
// Nothing here ever logs or returns key material or plaintext except decryptSecret's result.

import crypto from 'crypto';

const V1 = 'enc:v1:';
const V2 = 'enc:v2:';
const LEGACY_KID = 'k1';
const KID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export interface Keyring {
  currentKid: string;
  keys: Map<string, Buffer>;
}

function parseKey(raw: string, label: string): Buffer {
  const key = Buffer.from(raw.trim(), 'base64');
  if (key.length !== 32) throw new Error(`${label} must decode to 32 bytes (base64-encoded).`);
  return key;
}

export function loadKeyring(env: NodeJS.ProcessEnv = process.env): Keyring {
  const keys = new Map<string, Buffer>();
  let currentKid: string | null = null;

  const ring = env.MANDATE_KEY_ENCRYPTION_KEYS?.trim();
  if (ring) {
    for (const part of ring.split(',')) {
      const idx = part.indexOf(':');
      if (idx < 1) throw new Error('MANDATE_KEY_ENCRYPTION_KEYS entries must look like "kid:base64key".');
      const kid = part.slice(0, idx).trim();
      if (!KID_RE.test(kid)) throw new Error('MANDATE_KEY_ENCRYPTION_KEYS has an invalid key id.');
      if (keys.has(kid)) throw new Error('MANDATE_KEY_ENCRYPTION_KEYS has a duplicate key id.');
      keys.set(kid, parseKey(part.slice(idx + 1), `MANDATE_KEY_ENCRYPTION_KEYS[${kid}]`));
      if (!currentKid) currentKid = kid;
    }
  }
  const single = env.MANDATE_KEY_ENCRYPTION_KEY?.trim();
  if (single) {
    const k = parseKey(single, 'MANDATE_KEY_ENCRYPTION_KEY');
    if (!keys.has(LEGACY_KID)) keys.set(LEGACY_KID, k);
    if (!currentKid) currentKid = LEGACY_KID;
  }
  if (!currentKid) {
    throw new Error(
      'MANDATE_KEY_ENCRYPTION_KEYS / MANDATE_KEY_ENCRYPTION_KEY is not configured — cannot encrypt/decrypt broker secrets.',
    );
  }
  return { currentKid, keys };
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(V2) || value.startsWith(V1);
}

/** Classify a stored value without decrypting it. */
export function secretFormat(value: string | null | undefined): 'null' | 'plaintext' | 'v1' | 'v2' {
  if (value == null || value === '') return 'null';
  if (value.startsWith(V2)) return 'v2';
  if (value.startsWith(V1)) return 'v1';
  return 'plaintext';
}

/** Key id a v2 value was encrypted under (null for v1 / plaintext). */
export function secretKid(value: string): string | null {
  if (!value.startsWith(V2)) return null;
  return value.slice(V2.length).split(':')[0] || null;
}

export function encryptSecret(plain: string, ring: Keyring = loadKeyring()): string {
  const key = ring.keys.get(ring.currentKid)!;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  // The key id is authenticated as AAD so it can't be swapped to force a wrong-key path.
  cipher.setAAD(Buffer.from(ring.currentKid, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return V2 + [ring.currentKid, ...[iv, tag, ct].map((b) => b.toString('base64'))].join(':');
}

function open(key: Buffer, ivB64: string, tagB64: string, ctB64: string, aad?: string): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  if (aad !== undefined) decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

export function decryptSecret(stored: string | null | undefined, ring?: Keyring): string | null {
  if (stored == null) return null;

  if (stored.startsWith(V2)) {
    const parts = stored.slice(V2.length).split(':');
    if (parts.length !== 4) throw new Error('Malformed encrypted secret.');
    const [kid, iv, tag, ct] = parts;
    const r = ring ?? loadKeyring();
    const key = r.keys.get(kid);
    if (!key) throw new Error(`No master key available for key id "${kid}".`);
    try {
      return open(key, iv, tag, ct, kid);
    } catch {
      throw new Error('Failed to decrypt secret (wrong key or tampered data).');
    }
  }

  if (stored.startsWith(V1)) {
    const parts = stored.slice(V1.length).split(':');
    if (parts.length !== 3) throw new Error('Malformed encrypted secret.');
    const [iv, tag, ct] = parts;
    const r = ring ?? loadKeyring();
    // v1 carries no key id: try every key (the legacy one first).
    const ordered = [...r.keys.entries()].sort(([a], [b]) => (a === LEGACY_KID ? -1 : b === LEGACY_KID ? 1 : 0));
    for (const [, key] of ordered) {
      try {
        return open(key, iv, tag, ct);
      } catch { /* try next key */ }
    }
    throw new Error('Failed to decrypt secret (wrong key or tampered data).');
  }

  // Legacy plaintext.
  if (process.env.MANDATE_KEY_REQUIRE_ENCRYPTED === '1') {
    throw new Error('Plaintext broker secret found while MANDATE_KEY_REQUIRE_ENCRYPTED=1 — run the re-encryption migration.');
  }
  return stored;
}
