import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'embeddd',
  description: 'Коллекции референсов: ссылки, картинки, видео — в одной сетке',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#EDEBE4',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mediaOrigin = process.env.R2_PUBLIC_URL;
  return (
    <html lang="ru">
      {mediaOrigin && <head><link rel="preconnect" href={mediaOrigin} crossOrigin="anonymous" /></head>}
      <body>{children}</body>
    </html>
  );
}
