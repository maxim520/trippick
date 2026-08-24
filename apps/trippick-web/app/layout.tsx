import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title:       'TripPick — Vind jouw reis',
  description: 'TripPick matcht jouw reismaand, budget en wensen aan de best passende vakantiebestemming.',
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
      <body>{children}</body>
    </html>
  );
}
