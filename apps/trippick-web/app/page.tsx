'use client';

import { MatchWidget } from 'navago-widget';
import type { MatchResult } from 'navago-widget';
import styles from './page.module.css';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? '';

function handleDeeplinkClick(result: MatchResult) {
  const sessionId = (() => {
    try { return sessionStorage.getItem('tp_session') ?? crypto.randomUUID(); } catch { return 'unknown'; }
  })();

  // Fire-and-forget click tracking — doesn't block navigation
  void fetch(`${API_BASE}/api/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ offerId: result.offerId, deeplink: result.deeplink, sessionId }),
    keepalive: true,
  });

  if (typeof gtag !== 'undefined') {
    gtag('event', 'match_deeplink_click', {
      destination_id:   result.destinationId,
      destination_name: result.destinationName,
      offer_id:         result.offerId,
      price_cents:      result.cheapestCents,
    });
  }
}

export default function HomePage() {
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>TripPick</div>
        <p className={styles.tagline}>De vakantie die bij jou past, in drie stappen gevonden.</p>
      </header>

      <section className={styles.widgetSection}>
        <MatchWidget
          apiBase={API_BASE}
          brand={{ primaryColor: '#17BEBB', siteName: 'TripPick' }}
          onDeeplinkClick={handleDeeplinkClick}
        />
      </section>
    </main>
  );
}

// Required for gtag reference without a separate @types/gtag declaration
declare function gtag(command: string, action: string, params?: Record<string, unknown>): void;
