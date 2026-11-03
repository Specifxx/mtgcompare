import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import "@/components/site-reviews/site-reviews.css";
// The site's own look on top of the shared one (src/content/site.css; empty
// on a site that needs none). Game-specific, so it lives outside the engine.
import "@/content/site.css";
import { SITE } from "@/site.config";
import { SITE_URL } from "@/lib/site";
import { themeCss } from "@/lib/theme-vars";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";
import { SEASON_BOOT_SCRIPT } from "@/lib/season";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { PreorderStrip } from "@/components/PreorderStrip";
import { PrefsProvider } from "@/components/ClientPrefs";
import { QuickView } from "@/components/QuickView";
import { RateCard } from "@/components/site-reviews/RateCard";
import { BuyClickTracker } from "@/components/BuyClickTracker";
import { ShareArrival } from "@/components/ShareArrival";
import { FooterCardAds } from "@/components/FooterCardAds";
import { adSearch, cardAds } from "@/lib/card-ads";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  keywords: SITE.keywords,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, url: "/" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/", types: { "application/rss+xml": "/feed.xml" } },
  // Large image previews and full snippets in Google (Search, Discover, Images), as RiftCompare does.
  // A page that sets its own `robots` (noindex) replaces this whole object.
  robots: { googleBot: { "max-image-preview": "large", "max-snippet": -1 } },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } : undefined,
  },
};

export const viewport: Viewport = { themeColor: SITE.theme.pageDark, colorScheme: "dark light" };

const ADSENSE = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const fontHref = `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=${encodeURIComponent(SITE.theme.displayFont)}:wght@700;900&display=swap`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const search = adSearch();
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT + SEASON_BOOT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={fontHref} />
        <link rel="preconnect" href="https://tcgplayer-cdn.tcgplayer.com" />
        {/* Impact's verifier reads the tag exactly as it issues it: `value`, not `content`. */}
        {SITE.impactSiteVerification && <meta name="impact-site-verification" {...{ value: SITE.impactSiteVerification }} />}
        {ADSENSE && <script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}`} crossOrigin="anonymous" />}
      </head>
      <body className="font-sans antialiased">
        <PrefsProvider>
          <Header />
          <PreorderStrip />
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
          <FooterCardAds ads={cardAds({ kind: "card", limit: 8 })} ebayQuery={search.ebayQuery} tcgplayerUrl={search.tcgplayerUrl} />
          <Footer />
          <QuickView />
          {/* Rate us (owner, 2026-11-03): the corner card, asking only after real use; RiftCompare keeps the ratings. */}
          <RateCard />
        </PrefsProvider>
        <Analytics />
        <BuyClickTracker />
        <ShareArrival />
      </body>
    </html>
  );
}
