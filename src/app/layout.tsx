import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'embeddd — коллекции референсов',
  description: 'Коллекции референсов: ссылки, картинки, видео — в одной сетке. Pinterest-подобная лента с коллекциями и заметками.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon', sizes: '32x32' }],
    shortcut: '/favicon.ico',
    apple: '/logo.svg',
  },
  robots: { index: false },
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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
