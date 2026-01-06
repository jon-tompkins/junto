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
        
        const { error } = await supabase
          .from('users')
          .upsert({
            twitter_id: twitterProfile.data?.id,
            twitter_handle: twitterProfile.data?.username,
            display_name: twitterProfile.data?.name,
            avatar_url: twitterProfile.data?.profile_image_url,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'twitter_id',
          });

        if (error) console.error('Error saving user:', error);
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
