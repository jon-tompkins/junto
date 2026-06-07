import type { MetadataRoute } from 'next';

// Web App Manifest — turns myjunto.xyz into an installable PWA on iOS
// ("Add to Home Screen") and Android. Icons are generated dynamically by
// app/icon.svg and app/apple-icon.tsx (Next.js auto-serves them).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'MyJunto',
    short_name: 'MyJunto',
    description: 'Curate your sources. Get your dispatch.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080604',
    theme_color: '#080604',
    orientation: 'portrait',
    icons: [
      { src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      { src: '/apple-icon', type: 'image/png', sizes: '180x180' },
    ],
  };
}
