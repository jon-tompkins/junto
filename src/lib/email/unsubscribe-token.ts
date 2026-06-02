import crypto from 'crypto';

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || 'dev-fallback-do-not-use';
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

// Token = base64url(payload).base64url(hmacSha256(payload))
// payload = `${userId}:${newsletterId}`
export function signUnsubscribeToken(userId: string, newsletterId: string): string {
  const payload = `${userId}:${newsletterId}`;
  const mac = crypto.createHmac('sha256', secret()).update(payload).digest();
  return `${b64url(Buffer.from(payload))}.${b64url(mac)}`;
}

export function verifyUnsubscribeToken(token: string): { userId: string; newsletterId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [p, m] = parts;
  const payload = fromB64url(p).toString('utf8');
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest();
  const provided = fromB64url(m);
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;
  const [userId, newsletterId] = payload.split(':');
  if (!userId || !newsletterId) return null;
  return { userId, newsletterId };
}
