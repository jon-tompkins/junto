import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { getSupabase } from './db/client';

/**
 * Admin authorization. Uses `ADMIN_EMAILS` env var (comma-separated list)
 * as the source of truth — no DB migration required to bootstrap.
 *
 * Example: ADMIN_EMAILS="jonto2121@gmail.com,foo@bar.com"
 */

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Returns true if the current session belongs to a platform admin.
 * Resolves the user's email from the session or falls back to a DB lookup.
 */
export async function isAdminSession(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return false;

  const adminEmails = getAdminEmails();
  if (adminEmails.size === 0) return false;

  // NextAuth session.user.email is set for Google. For Twitter OAuth it may
  // be null — fall back to looking up the user row by provider id.
  let email = (session.user.email || '').toLowerCase();

  if (!email) {
    try {
      const supabase = getSupabase();
      const twitterId = (session.user as any).twitterId;
      const googleId = (session.user as any).googleId;
      if (twitterId) {
        const { data } = await supabase.from('users').select('email').eq('twitter_id', twitterId).single();
        email = (data?.email || '').toLowerCase();
      } else if (googleId) {
        const { data } = await supabase.from('users').select('email').eq('google_id', googleId).single();
        email = (data?.email || '').toLowerCase();
      }
    } catch {
      return false;
    }
  }

  return email ? adminEmails.has(email) : false;
}
