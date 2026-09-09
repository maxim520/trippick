'use client';

import { MatchWidget } from 'navago-widget';
import type { MatchResult } from 'navago-widget';

const API_BASE = process.env['NEXT_PUBLIC_API_BASE'] ?? '';

function handleDeeplinkClick(result: MatchResult) {
  const sessionId = (() => {
    try { return sessionStorage.getItem('tp_session') ?? crypto.randomUUID(); } catch { return 'unknown'; }
  })();
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
    <>
      {/* NAV */}
      <div className="navwrap">
        <div className="nav">
          <a href="/" className="logo">
            <img src="/TripPick_logo.svg" alt="TripPick.eu" style={{ height: '26px', display: 'block' }} />
          </a>
          <nav>
            <a href="/hoe-het-werkt.html">Hoe het werkt</a>
            <a href="/bestemmingen">Bestemmingen</a>
            <a href="/artikelen/index.html">Artikelen</a>
            <a href="/zakelijk.html" className="biz-link">
              <svg viewBox="0 0 20 20" fill="none" style={{ width: '14px', height: '14px' }}>
                <path d="M4 17V8l6-4 6 4v9" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M8 17v-5h4v5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Voor reisorganisaties</span>
            </a>
            <a href="#tool" className="btn">Start jouw match</a>
          </nav>
        </div>
      </div>

      {/* HERO */}
      <section className="hero" id="tool">
        <div className="wrap hero-grid">
          <div>
            <span className="pill mono">
              <span className="dot"></span>Onafhankelijk · niet verbonden aan één reisorganisatie
            </span>
            <h1>Vind de vakantie<br />die écht bij je <span>past</span>.</h1>
            <p className="lede">
              Beantwoord een paar vragen en ontvang de vakanties die het best bij je passen.
              Jij kiest. Wij doen het zoekwerk.
            </p>
            <div className="cta-row">
              <a href="#tool" className="btn">Start jouw match →</a>
              <a href="#hoe" className="btn-t">Bekijk hoe het werkt</a>
            </div>
            <div className="micro">
              <span>
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Geen account nodig
              </span>
              <span>
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Klaar in ruim een minuut
              </span>
            </div>
          </div>

          <div className="stack">
            <div className="tool">
              <div className="stage">
                <MatchWidget
                  apiBase={API_BASE}
                  brand={{ primaryColor: '#17BEBB', siteName: 'TripPick' }}
                  onDeeplinkClick={handleDeeplinkClick}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ONAFHANKELIJK */}
      <section className="wrap" style={{ paddingBottom: '84px' }}>
        <div className="dark two">
          <div>
            <span className="eyebrow mono">Onafhankelijk</span>
            <h2>Wij hebben geen eigen reizen te verkopen. Daarom zeggen we ook <span>wat niet past</span>.</h2>
          </div>
          <div className="ilist">
            <div><b>01</b><strong>Alle aanbieders tegelijk</strong><span>We zoeken bij alle aangesloten reisorganisaties, niet in de catalogus van één merk.</span></div>
            <div><b>02</b><strong>Alleen bestaande, boekbare reizen</strong><span>Elke reis is actueel en direct te boeken. Niets wordt verzonnen, ook de foto&apos;s niet.</span></div>
            <div><b>03</b><strong>Ook de nadelen erbij</strong><span>Bij elke match staat waarom die past én waar het schuurt.</span></div>
          </div>
        </div>
      </section>

      {/* WERKWIJZE */}
      <section className="how" id="hoe" style={{ paddingTop: '0' }}>
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow mono">Zo werkt het</span>
            <h2>Van twijfel naar drie concrete opties</h2>
            <p>Een zoekfilter vraagt je om te weten wat je wilt. Wij vragen naar je situatie en rekenen zelf uit welke reizen daaruit volgen.</p>
          </div>
          <div className="steps">
            <div className="step"><div className="snum">01</div><h3>Een paar vragen over je situatie</h3><p>Wanneer je weg kunt, met wie, wat er te besteden is en hoe je wilt reizen.</p></div>
            <div className="step"><div className="snum">02</div><h3>Matchen op echte voorraad</h3><p>Je profiel wordt gescoord tegen bestaande, geprijsde reizen. Geen taalmodel dat bestemmingen bedenkt.</p></div>
            <div className="step"><div className="snum">03</div><h3>Zie wat je daadwerkelijk boekt</h3><p>Drie matches met foto van de accommodatie zelf, niet een sfeerbeeld van de regio.</p></div>
          </div>
        </div>
      </section>

      {/* VERGELIJK */}
      <section className="cmp">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow mono">Vergelijking</span>
            <h2>Zoekfilter, chatbot of TripPick</h2>
          </div>
          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Zoekfilter op een reissite</th>
                  <th>Algemene AI-chatbot</th>
                  <th>TripPick</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>Werkt zonder bestemming in je hoofd</td><td>Nee, je moet zelf filteren</td><td>Ja</td><td>Ja</td></tr>
                <tr><td>Toont alleen bestaande reizen</td><td>Ja</td><td>Nee, verzint regelmatig</td><td>Ja</td></tr>
                <tr><td>Foto van de echte accommodatie</td><td>Ja</td><td>Nee</td><td>Ja</td></tr>
                <tr><td>Legt uit waarom iets past</td><td>Nee</td><td>Soms, niet controleerbaar</td><td>Ja, per criterium</td></tr>
                <tr><td>Onafhankelijk van één aanbieder</td><td>Nee</td><td>Ja</td><td>Ja</td></tr>
                <tr><td>Aantal opties dat je krijgt</td><td>Honderden</td><td>Wisselend</td><td>Drie</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* TECH */}
      <section className="tech">
        <div className="wrap">
          <div className="dark" style={{ padding: '32px 36px', display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '11px 17px', flex: 'none' }}>
              <img src="/Logo_Navago.png" alt="Navago" style={{ height: '38px', display: 'block' }} />
            </div>
            <div style={{ flex: '1', minWidth: '240px' }}>
              <h3 style={{ fontSize: '18px', marginBottom: '5px', color: '#EEF2F6' }}>Gebouwd op Navago</h3>
              <p style={{ color: 'rgba(238,242,246,.66)', fontSize: '14px', maxWidth: '60ch', margin: '0' }}>
                TripPick draait op <b style={{ color: '#EEF2F6' }}>Navago</b>, onze matchingtechnologie die situaties
                vertaalt naar concrete, bestaande reizen. Navago berekent deterministisch tegen een geverifieerde
                catalogus, inclusief actuele foto&apos;s van de accommodatie zelf.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ARTIKELEN */}
      <section className="art-preview">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow mono">Meer weten</span>
            <h2>Artikelen over reizen kiezen</h2>
            <p>Nuchter en feitelijk. Over bestemmingen, reistijden en wat AI wel en niet kan bij het plannen van een vakantie.</p>
          </div>
          <div className="agrid">
            <a href="/artikelen/waarom-mensen-spijt-krijgen.html" className="acard">
              <span className="atag">Keuze maken</span>
              <h3>Waarom mensen spijt krijgen van hun bestemming</h3>
              <p>Bijna altijd is er één vraag die vooraf niet gesteld is. Over hitte in augustus, drukte in juli, of vier uur reistijd die zwaarder viel dan verwacht.</p>
              <span className="alink">Lees artikel →</span>
            </a>
            <a href="/artikelen/waar-naartoe-in-mei.html" className="acard">
              <span className="atag">Bestemmingen · mei</span>
              <h3>Waar naartoe in mei zonder massatoerisme</h3>
              <p>Puglia, Alentejo, Slovenië en Noord-Griekenland. Vier bestemmingen die in mei specifiek goed werken, met concrete temperaturen, drukte en één aandachtspunt per bestemming.</p>
              <span className="alink">Lees artikel →</span>
            </a>
            <a href="/artikelen/zonvakantie-met-kinderen.html" className="acard">
              <span className="atag">Gezin · jonge kinderen</span>
              <h3>Zonvakantie met kinderen onder de vier: de reistijd</h3>
              <p>Bij kinderen onder de vier is vliegtijd de beslissende variabele. Wat twee versus vier uur vliegen in de praktijk betekent, en wanneer de auto een reëel alternatief is.</p>
              <span className="alink">Lees artikel →</span>
            </a>
            <a href="/artikelen/reisadvies-ai.html" className="acard">
              <span className="atag">AI en reizen</span>
              <h3>Reisadvies van AI: waar het misgaat</h3>
              <p>Een groot deel van de Nederlanders gebruikt AI bij het plannen van een reis en krijgt onjuiste informatie. Dit is waarom dat structureel zo werkt, en wat je altijd zelf checkt.</p>
              <span className="alink">Lees artikel →</span>
            </a>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow mono">Veelgestelde vragen</span>
            <h2>Goed om te weten</h2>
          </div>
          <div className="faqs">
            <details open><summary>Waarom krijg ik maar drie resultaten?</summary><p>Omdat vijftien resultaten hetzelfde probleem opleveren als vijftienhonderd. Drie opties met uitleg en een echte foto dwingen tot een concrete afweging.</p></details>
            <details><summary>Zijn de foto&apos;s echt van de accommodatie?</summary><p>Ja. Dit zijn geen sfeerbeelden van de regio, maar de foto uit de feed van de aanbieder zelf. Wat je ziet, is wat je boekt.</p></details>
            <details><summary>Gebruiken jullie AI, en waar dan?</summary><p>Bij het omzetten van je antwoorden naar een profiel, en bij het schrijven van de uitleg per resultaat. De keuze zelf is Navago&apos;s berekening op een geverifieerde database.</p></details>
            <details><summary>Kan ik direct bij jullie boeken?</summary><p>Nee. Je boekt bij de aanbieder zelf, onder hun voorwaarden en met hun garantieregeling.</p></details>
            <details><summary>Hoe verdienen jullie geld?</summary><p>Via een vergoeding als je doorklikt en boekt, en via TripPick als betaalde module voor reisorganisaties. De vergoeding zit niet in het scoringsmodel.</p></details>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta">
        <div className="wrap">
          <div className="dark cta-in">
            <div>
              <h2>Je hoeft nog niet te weten<br />waar je <span>heen wilt</span>.</h2>
              <p>Daar komen we samen achter. Een paar vragen, ruim een minuut.</p>
            </div>
            <div>
              <a href="#tool" className="btn">Start jouw match →</a>
              <small>Geen account nodig · geen verplichtingen</small>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="fgrid">
            <div>
              <a href="/" style={{ display: 'inline-flex', background: '#fff', borderRadius: '10px', padding: '8px 12px' }}>
                <img src="/TripPick_logo.svg" alt="TripPick.eu" style={{ height: '22px', display: 'block' }} />
              </a>
              <p>Onafhankelijk platform voor het kiezen van een reisbestemming. Niet verbonden aan één reisorganisatie.</p>
              <div className="micro" style={{ marginTop: '14px' }}>
                <span className="techtag"><i></i>Aangedreven door Navago</span>
              </div>
            </div>
            <div className="fcol">
              <span className="mono">Platform</span>
              <a href="#tool">Keuzehulp</a>
              <a href="/hoe-het-werkt.html">Hoe het werkt</a>
              <a href="/bestemmingen">Bestemmingen</a>
            </div>
            <div className="fcol">
              <span className="mono">Zakelijk</span>
              <a href="/zakelijk.html">Voor reisorganisaties</a>
              <a href="/zakelijk.html#contact">Demo aanvragen</a>
              <a href="/#technologie">Over Navago</a>
            </div>
            <div className="fcol">
              <span className="mono">Informatie</span>
              <a href="/artikelen/index.html">Artikelen</a>
              <a href="/hoe-het-werkt.html">Hoe we werken</a>
              <a href="/contact.html#over">Over ons</a>
              <a href="/privacy.html">Privacy en cookies</a>
              <a href="/contact.html">Contact</a>
            </div>
          </div>
          <div className="fbot mono">
            <span>TripPick · onderdeel van OnlineKoers · KvK 75082888</span>
            <span>trippick.eu</span>
          </div>
        </div>
      </footer>
    </>
  );
}

declare function gtag(command: string, action: string, params?: Record<string, unknown>): void;
