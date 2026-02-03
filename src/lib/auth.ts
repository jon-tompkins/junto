import { NextAuthOptions } from "next-auth";
import TwitterProvider from "next-auth/providers/twitter";
import { getSupabase } from "@/lib/db/client";

export const authOptions: NextAuthOptions = {
  providers: [
    TwitterProvider({
      clientId: process.env.TWITTER_CLIENT_ID!,
      clientSecret: process.env.TWITTER_CLIENT_SECRET!,
      version: "2.0",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const twitterProfile = profile as { data?: { id: string; username: string } };
        token.twitterId = twitterProfile.data?.id;
        token.twitterHandle = twitterProfile.data?.username;
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as any).twitterId = token.twitterId as string;
      (session.user as any).twitterHandle = token.twitterHandle as string;
      (session as any).accessToken = token.accessToken as string;
      return session;
    },
    async signIn({ profile }) {
      try {
        const twitterProfile = profile as { data?: { id: string; username: string; name: string; profile_image_url: string } };
        const supabase = getSupabase();
        const twitterId = twitterProfile.data?.id;
        const twitterHandle = twitterProfile.data?.username;
        
        console.log('SignIn: Processing user', twitterHandle, 'twitter_id:', twitterId);
        
        // First, try to find existing user by twitter_id OR twitter_handle OR name
        let existingUser = null;
        
        if (twitterId) {
          const { data } = await supabase
            .from('users')
            .select('id')
            .eq('twitter_id', twitterId)
            .single();
          if (data) existingUser = data;
        }
        
        if (!existingUser && twitterHandle) {
          const { data } = await supabase
            .from('users')
            .select('id')
            .eq('twitter_handle', twitterHandle)
            .single();
          if (data) existingUser = data;
        }
        
        if (!existingUser && twitterHandle) {
          const { data } = await supabase
            .from('users')
            .select('id')
            .eq('name', twitterHandle)
            .single();
          if (data) existingUser = data;
        }
        
        const userData = {
          twitter_id: twitterId,
          twitter_handle: twitterHandle,
          display_name: twitterProfile.data?.name,
          avatar_url: twitterProfile.data?.profile_image_url,
          updated_at: new Date().toISOString(),
        };
        
        let error;
        if (existingUser) {
          // Update existing user
          console.log('SignIn: Updating existing user', existingUser.id);
          const result = await supabase
            .from('users')
            .update(userData)
            .eq('id', existingUser.id);
          error = result.error;
        } else {
          // Try upsert for new users (with twitter_id conflict handling)
          console.log('SignIn: Creating new user via upsert');
          const result = await supabase
            .from('users')
            .upsert(userData, {
              onConflict: 'twitter_id',
            });
          error = result.error;
        }

        if (error) console.error('SignIn: Error saving user:', error);
        else console.log('SignIn: User saved successfully');
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
