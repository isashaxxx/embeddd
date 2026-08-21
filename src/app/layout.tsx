import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'embeddd',
  description: 'Коллекции референсов: ссылки, картинки, видео — в одной сетке',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/logo.svg', type: 'image/svg+xml' }],
    shortcut: '/logo.svg',
    apple: '/logo.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mediaOrigin = process.env.R2_PUBLIC_URL;
  return (
    <html lang="ru">
      {mediaOrigin && <head><link rel="preconnect" href={mediaOrigin} crossOrigin="anonymous" /></head>}
      <body
        className={geist.className}
        style={{ letterSpacing: '-0.005em' }}
      >
        {children}
      </body>
    </html>
  );
}
