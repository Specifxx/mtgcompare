import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { SiteAnalytics } from "@/components/SiteAnalytics";
import { IMPACT_SITE_VERIFICATIONS } from "@/lib/affiliate";
import { ADSENSE_CLIENT, adsenseScriptSrc } from "@/lib/adsense";
import { SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { jsonLd, siteJsonLd } from "@/lib/seo";
import "./globals.css";

// Font display is optional, not swap: both faces are preloaded, so a warm visit renders in them from the first paint, and a slow
// first visit keeps the size-adjusted fallback for that page instead of re-wrapping every line when the font lands (that swap
// measured CLS 0.209 on /us/type/booster-boxes; 0 with "optional").
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "optional" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", display: "optional", weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — Pokémon sealed prices & stock`, template: `%s | ${SITE_NAME}` },
  description: SITE_TAGLINE,
  applicationName: SITE_NAME,
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17181d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <head>
        {/* Product photos: 96% are on Shopify's CDN, most of the rest on TCGplayer's.
            Warming those two connections is the cheapest LCP win there is. */}
        <link rel="preconnect" href="https://cdn.shopify.com" />
        <link rel="dns-prefetch" href="https://tcgplayer-cdn.tcgplayer.com" />
        {/* Impact / TCGplayer affiliate site-ownership verification. Impact looks for
            the non-standard `value` attribute, so spread it past the meta typing. */}
        {IMPACT_SITE_VERIFICATIONS.map((value) => (
          <meta key={value} {...({ name: "impact-site-verification", value } as React.MetaHTMLAttributes<HTMLMetaElement>)} />
        ))}
        {/* Google AdSense (lib/adsense.ts): the owner's publisher ID unless NEXT_PUBLIC_ADSENSE_CLIENT says otherwise ("off": none).
            The meta and the script are what AdSense's site review looks for; ads only show in the units the site places, or wherever
            Auto ads put them if enabled in AdSense. */}
        {ADSENSE_CLIENT && (
          <>
            <meta name="google-adsense-account" content={ADSENSE_CLIENT} />
            <script async src={adsenseScriptSrc(ADSENSE_CLIENT)} crossOrigin="anonymous" />
          </>
        )}
      </head>
      <body className="flex min-h-screen flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">
          Skip to content
        </a>
        {/* Each layout under this one (and the 404 and error pages) draws the Header, its <main> and the Footer itself: the
            footer's links depend on the page's region. */}
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(siteJsonLd()) }} />
        <SiteAnalytics />
      </body>
    </html>
  );
}
