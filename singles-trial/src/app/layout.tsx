import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { SearchBox } from "@/components/SearchBox";
import { LIVE_GAMES, SITE } from "@/site.config";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: "Look up what a single trading card is worth: TCGplayer market price per printing, price history and the week's biggest movers, updated daily.",
  openGraph: { siteName: SITE.name, type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="hdr">
          <div className="hdr-in">
            <a className="logo" href="/">
              TCG <b>Singles</b> DB
            </a>
            <nav className="nav" aria-label="Games">
              {LIVE_GAMES.map((g) => (
                <a key={g.slug} href={`/${g.slug}`}>
                  {g.name}
                </a>
              ))}
            </nav>
            <SearchBox />
          </div>
        </header>
        <main>{children}</main>
        <footer className="ftr">
          <div className="page">
            <nav aria-label="Site">
              <a href="/about">About</a>
              <a href="/terms">Terms</a>
              <a href="/privacy">Privacy</a>
            </nav>
            <p>Prices are TCGplayer market prices in US dollars, updated once a day. We may earn a commission when you buy through eBay or TCGplayer links.</p>
            <p>{SITE.disclaimer}</p>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
