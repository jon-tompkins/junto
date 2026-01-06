import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      twitterId?: string;
      twitterHandle?: string;
    };
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    twitterId?: string;
    twitterHandle?: string;
    accessToken?: string;
  }
}
