import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Oswald, IBM_Plex_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { PageViewTracker } from "@/components/page-view-tracker";
import { Suspense } from "react";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MyJunto — Curate Your Sources. Get Your Dispatch.",
    template: "%s | MyJunto",
  },
  description:
    "Build a junto of the voices you trust. Get a daily AI-synthesized dispatch — signal, not noise.",
  keywords: [
    "AI newsletter",
    "curated intelligence",
    "crypto dispatch",
    "market intelligence",
    "AI briefing",
    "Twitter synthesis",
    "investment research",
    "junto",
  ],
  authors: [{ name: "MyJunto" }],
  creator: "MyJunto",
  metadataBase: new URL("https://www.myjunto.xyz"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.myjunto.xyz",
    siteName: "MyJunto",
    title: "MyJunto — Curate Your Sources. Get Your Dispatch.",
    description:
      "Build a junto of the voices you trust. Get a daily AI-synthesized dispatch — signal, not noise.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "MyJunto — Curate Your Sources. Get Your Dispatch.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MyJunto — Curate Your Sources. Get Your Dispatch.",
    description:
      "Build a junto of the voices you trust. Get a daily AI-synthesized dispatch — signal, not noise.",
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
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MyJunto",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#080604",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${oswald.variable} ${ibmPlexMono.variable}`}>
        <AuthProvider>{children}</AuthProvider>
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <footer style={{ background: "#080604", borderTop: "1px solid rgba(176,141,87,0.14)", padding: "16px", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.5, color: "rgba(245,239,224,0.32)", maxWidth: "640px", marginLeft: "auto", marginRight: "auto" }}>
            myjunto is for informational purposes only and is not financial, investment, or trading advice.
            Do your own research before making any financial decision.
          </p>
        </footer>
      </body>
    </html>
  );
}
