import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MyJunto — AI-Powered Newsletter Marketplace",
    template: "%s | MyJunto",
  },
  description:
    "Create and subscribe to AI-powered newsletters built from curated Twitter sources. Get daily intelligence briefings synthesized from the voices you trust.",
  keywords: [
    "AI newsletter",
    "newsletter marketplace",
    "crypto newsletter",
    "market intelligence",
    "AI briefing",
    "Twitter synthesis",
    "investment research",
    "curated intelligence",
  ],
  authors: [{ name: "MyJunto" }],
  creator: "MyJunto",
  metadataBase: new URL("https://www.myjunto.xyz"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.myjunto.xyz",
    siteName: "MyJunto",
    title: "MyJunto — AI-Powered Newsletter Marketplace",
    description:
      "Create and subscribe to AI-powered newsletters built from curated Twitter sources. Daily intelligence briefings from the voices you trust.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "MyJunto — Intelligence from the information tsunami",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyJunto — AI-Powered Newsletter Marketplace",
    description:
      "AI-powered newsletters from curated Twitter sources. Daily intelligence briefings from the voices you trust.",
    images: ["/opengraph-image"],
    creator: "@myjunto",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://www.myjunto.xyz",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={spaceGrotesk.variable}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
