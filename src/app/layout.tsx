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
    creator: "@myjunto_xyz",
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
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${oswald.variable} ${ibmPlexMono.variable}`}>
        {/* Apply the saved theme before paint to avoid a flash of the wrong palette. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');}catch(e){}`,
          }}
        />
        <AuthProvider>{children}</AuthProvider>
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
        <footer style={{ background: "#080604", borderTop: "1px solid rgba(176,141,87,0.14)", padding: "16px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "20px", marginBottom: "12px" }}>
            <a
              href="https://x.com/myjunto_xyz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="myjunto on X"
              style={{ color: "rgba(245,239,224,0.45)", display: "inline-flex", transition: "color 0.15s" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a
              href="https://discord.gg/rmdEwc44d"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="myjunto on Discord"
              style={{ color: "rgba(245,239,224,0.45)", display: "inline-flex", transition: "color 0.15s" }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.864-.608 1.249a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.249.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
          </div>
          <p style={{ margin: 0, fontSize: "11px", lineHeight: 1.5, color: "rgba(245,239,224,0.32)", maxWidth: "640px", marginLeft: "auto", marginRight: "auto" }}>
            myjunto is for informational purposes only and is not financial, investment, or trading advice.
            Do your own research before making any financial decision.
          </p>
        </footer>
      </body>
    </html>
  );
}
