import { NextAuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import GoogleProvider from "next-auth/providers/google";
import { getSupabase } from "@/lib/db/client";
import { NEW_USER_BONUS_CREDITS } from "@/lib/pricing";

export const authOptions: NextAuthOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        if (account.provider === 'twitter') {
          const twitterProfile = profile as { data?: { id: string; username: string } };
          token.twitterId = twitterProfile.data?.id;
          token.twitterHandle = twitterProfile.data?.username;
        } else if (account.provider === 'google') {
          const googleProfile = profile as { sub?: string; email?: string };
          token.googleId = googleProfile.sub;
          token.email = googleProfile.email;
        }
        token.provider = account.provider;
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).twitterId = token.twitterId as string;
      (session.user as any).twitterHandle = token.twitterHandle as string;
      (session.user as any).googleId = token.googleId as string;
      (session.user as any).provider = token.provider as string;
      (session as any).accessToken = token.accessToken as string;
      return session;
    },
    async signIn({ account, profile }) {
      try {
        const supabase = getSupabase();
        if (account?.provider === 'twitter') {
          return await handleTwitterSignIn(supabase, profile);
        } else if (account?.provider === 'google') {
          return await handleGoogleSignIn(supabase, profile);
        }
      } catch (err) {
        console.error('SignIn callback error:', err);
      }
      return true;
    },
  },
  pages: {
    signIn: "/login",
  },
};

async function handleTwitterSignIn(supabase: ReturnType<typeof getSupabase>, profile: any): Promise<boolean> {
  const twitterProfile = profile as { data?: { id: string; username: string; name: string; profile_image_url: string } };
  const twitterId = twitterProfile.data?.id;
  const twitterHandle = twitterProfile.data?.username;

  console.log('SignIn: Twitter user', twitterHandle, 'twitter_id:', twitterId);

  let existingUser = null;
  if (twitterId) {
    const { data } = await supabase.from('users').select('id').eq('twitter_id', twitterId).single();
    if (data) existingUser = data;
  }
  if (!existingUser && twitterHandle) {
    const { data } = await supabase.from('users').select('id').eq('twitter_handle', twitterHandle).single();
    if (data) existingUser = data;
  }
  if (!existingUser && twitterHandle) {
    const { data } = await supabase.from('users').select('id').eq('name', twitterHandle).single();
    if (data) existingUser = data;
  }

  const userData = {
    twitter_id: twitterId,
    twitter_handle: twitterHandle,
    display_name: twitterProfile.data?.name,
    avatar_url: twitterProfile.data?.profile_image_url,
    auth_provider: 'twitter',
    updated_at: new Date().toISOString(),
  };

  if (existingUser) {
    const { error } = await supabase.from('users').update(userData).eq('id', existingUser.id);
    if (error) console.error('SignIn: Error updating user:', error);
  } else {
    await createNewUser(supabase, { ...userData, credit_balance: NEW_USER_BONUS_CREDITS, is_pro: true }, 'twitter_id', twitterId);
  }
  return true;
}

async function handleGoogleSignIn(supabase: ReturnType<typeof getSupabase>, profile: any): Promise<boolean> {
  const googleProfile = profile as { sub?: string; email?: string; name?: string; picture?: string };
  const googleId = googleProfile.sub;
  const email = googleProfile.email;

  console.log('SignIn: Google user', email, 'google_id:', googleId);

  let existingUser = null;
  if (googleId) {
    const { data } = await supabase.from('users').select('id').eq('google_id', googleId).single();
    if (data) existingUser = data;
  }
  if (!existingUser && email) {
    const { data } = await supabase.from('users').select('id').eq('email', email).single();
    if (data) existingUser = data;
  }

  const userData = {
    google_id: googleId,
    email,
    display_name: googleProfile.name,
    avatar_url: googleProfile.picture,
    auth_provider: 'google',
    updated_at: new Date().toISOString(),
  };

  if (existingUser) {
    const { error } = await supabase.from('users').update(userData).eq('id', existingUser.id);
    if (error) console.error('SignIn: Error updating user:', error);
  } else {
    await createNewUser(supabase, { ...userData, credit_balance: NEW_USER_BONUS_CREDITS, is_pro: true }, 'google_id', googleId);
  }
  return true;
}

async function createNewUser(
  supabase: ReturnType<typeof getSupabase>,
  userData: Record<string, any>,
  conflictKey: string,
  lookupValue: string | undefined,
) {
  console.log('SignIn: Creating new user with', NEW_USER_BONUS_CREDITS, 'bonus credits');
  const { error } = await supabase.from('users').upsert(userData, { onConflict: conflictKey });
  if (error) {
    console.error('SignIn: Error creating user:', error);
    return;
  }

  const { data: newUser } = await supabase.from('users').select('id').eq(conflictKey, lookupValue).single();
  if (newUser) {
    await supabase.from('credit_transactions').insert({
      user_id: newUser.id,
      amount: NEW_USER_BONUS_CREDITS,
      type: 'bonus',
      description: 'Welcome bonus — new account signup',
    });
  }
}
