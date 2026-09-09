import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title:       'TripPick — Vind jouw reis',
  description: 'Beantwoord vijf vragen. Ontvang drie bestaande reizen die echt bij je passen.',
  metadataBase: new URL('https://trippick.eu'),
  openGraph: {
    siteName: 'TripPick',
    type:     'website',
    locale:   'nl_NL',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;0,800;1,500&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
