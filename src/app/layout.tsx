import { AdSenseLoader } from "@/components/AdSenseLoader";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Fraunces } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";
import dynamic from "next/dynamic";
import { FooterAds } from "@/components/AffiliateAds";
import { CountryProvider } from "@/components/CountryProvider";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { GAPageViewTracker } from "@/components/GAPageViewTracker";
import { ConsentDefaults } from "@/components/ConsentDefaults";
import { ConsentGatedAnalytics } from "@/components/ConsentGatedAnalytics";
import { OutboundBeacon } from "@/components/OutboundBeacon";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";
import QuickViewProvider from "@/components/QuickViewProvider";
import { SealedQuickViewProvider } from "@/components/SealedQuickView";
import { SideNav } from "@/components/SideNav";
import { PlanProvider } from "@/components/PlanProvider";
import { CommandLauncherProvider } from "@/components/CommandLauncher";
import { MegaMenuProvider } from "@/components/MegaMenuProvider";
import { WatchlistDrawerProvider } from "@/components/WatchlistDrawerProvider";
import { SignupWelcome } from "@/components/SignupWelcome";
import { ReferralCapture } from "@/components/ReferralCapture";
import { PriceAlertModalGate } from "@/components/PriceAlertModalGate";
import { EmailOnly } from "@/components/EmailOnly";
import { NewsletterSignup } from "@/components/NewsletterSignup";
import { stripeEnabled } from "@/lib/stripe";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { enabledProviders } from "@/lib/oauth";
import { CONTACT_EMAIL, DISCORD_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { THEME_BOOT_SCRIPT } from "@/lib/theme-shared";
import { OG_BASE } from "@/lib/og/meta";
import { AD_FREE_BOOT_SCRIPT } from "@/lib/ad-free";

// RiftCompare's font block, verbatim (wave 2, 2026-10-03; owner: "the font and
// everything needs to be the same"). Headings — Fraunces: a sharp,
// high-contrast, slightly flared serif at a heavy weight. Body/UI — Inter.
// Prices — JetBrains Mono. Exposed as CSS vars on <html>, wired into Tailwind.
// display: "swap" — the brand fonts ALWAYS render rather than "optional", which
// silently keeps the system fallback whenever the font misses the ~100ms
// first-paint window; adjustFontFallback size-matches the fallback so the
// swap-in causes negligible layout shift. The homepage alone adds Archivo as
// --font-riftbound (its `.rb-display-sans` wrapper, globals.css).
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// preload: false — the mono face only dresses numbers, never the H1 that is the
// LCP, so it arrives with the stylesheet and swaps in. Inter (body) and
// Fraunces (the H1) stay preloaded.
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap", preload: false });
// Client-only corner widgets, as on RiftCompare: each renders nothing on the
// server (it needs /api/me or browser storage first), so ssr:false keeps their
// JS off the first paint without changing the HTML.
const LaunchPromoPopup = dynamic(() => import("@/components/LaunchPromoPopup").then((m) => m.LaunchPromoPopup), { ssr: false });
const PremiumSlideIn = dynamic(() => import("@/components/PremiumSlideIn").then((m) => m.PremiumSlideIn), { ssr: false });
const AnnualSwitchNudge = dynamic(() => import("@/components/AnnualSwitchNudge").then((m) => m.AnnualSwitchNudge), { ssr: false });
// The feedback launcher: never auto-opens, works signed out, hides over the
// hero and the footer ad zone (#mc-hero, #mc-ad-zone).
const FeedbackWidget = dynamic(() => import("@/components/FeedbackWidget").then((m) => m.FeedbackWidget), { ssr: false });

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["600", "700", "900"],
  style: ["normal"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `Magic: The Gathering Card Prices — Compare Every Store | ${SITE_NAME}`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // No og:url here: every page inherits this object, so a url would point each
  // share at the homepage. The image is src/app/opengraph-image.tsx (the price
  // guide); twitter:image copies it, so there is no twitter-image file.
  openGraph: { ...OG_BASE },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
  manifest: "/manifest.webmanifest",
  // Search Console's "HTML tag" verification and Bing Webmaster Tools'. Each
  // renders only when its variable is set in Vercel (a placeholder would just
  // fail verification).
  verification: {
    ...(process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_SITE_VERIFICATION } } : {}),
  },
};

// Brand chrome colour for the browser UI / installed-PWA theme: the dark
// palette's page colour (THEME_COLOR.dark), since dark is MTG Compare's
// default (as on RiftCompare). ThemeToggle re-stamps the meta for a
// light-theme visitor.
export const viewport: Viewport = { themeColor: "#0c0b14" };

// RiftCompare's site-wide Organization node (its layout.tsx orgJsonLd), with
// MTG Compare's facts: the entity and the six markets it serves, no per-locale URLs.
// No sameAs until a real profile URL exists (only the owner's Discord invite, when set).
const orgJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: SITE_NAME,
      alternateName: ["MTGCompare", "MTG Compare App"],
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      ...(DISCORD_URL ? { sameAs: [DISCORD_URL] } : {}),
      knowsAbout: ["Magic: The Gathering", "Magic: The Gathering card price comparison", "Trading card game prices", "Sealed trading card products"],
      areaServed: ["United States", "Australia", "United Kingdom", "Singapore", "Canada", "European Union"].map((name) => ({ "@type": "Country", name })),
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL, availableLanguage: "English" },
    },
    { "@type": "WebSite", "@id": `${SITE_URL}/#website`, url: SITE_URL, name: SITE_NAME, publisher: { "@id": `${SITE_URL}/#org` },
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/browse?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // No cookie, header or session read here (RiftCompare's static layout): the
  // chrome renders for DEFAULT_COUNTRY and CountryProvider resolves the real
  // market on the client (cookie, then /api/geo). Pages that price
  // server-side call getCountry() themselves.
  return (
    <html lang="en" data-theme="dark" className={`${inter.variable} ${jetbrainsMono.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: AD_FREE_BOOT_SCRIPT }} />
        {/* Consent Mode v2 defaults first, then GA4: nothing measures before the defaults are set. */}
        <ConsentDefaults />
        <GoogleAnalytics />
      </head>
      <body className="min-h-screen bg-ink-950">
        {/* Skip link: lets keyboard/AT users bypass the navbar and jump straight
            to content. Visually hidden until focused (WCAG 2.4.1 Level A). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:flex focus:min-h-11 focus:items-center focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-brand-400 focus:ring-2 focus:ring-brand-400"
        >
          Skip to main content
        </a>
        {/* Route-change progress bar: the dark brand-400 amethyst, 2px, no spinner.
            zIndex 200 matches the skip link — it wins over every overlay. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }} />
        <NextTopLoader color="#c394f4" height={2} showSpinner={false} shadow={false} zIndex={200} />
        {/* The Plus/Premium dialog and its account state (RiftCompare's
            PremiumProvider + PremiumDialogProvider). checkoutOpen is an
            environment read (is Stripe configured?), not a session read: who
            the visitor is comes from /api/me, client-side. */}
        <PlanProvider checkoutOpen={stripeEnabled()} providers={enabledProviders()}>
        <CountryProvider initial={DEFAULT_COUNTRY}>
          {/* Card QuickView (CardQuickLink): a client island; reads no session. */}
          <QuickViewProvider providers={enabledProviders()}>
            {/* The watchlist drawer (the header heart's slide-over); client-only state. */}
            <WatchlistDrawerProvider>
            <SealedQuickViewProvider>
            <CommandLauncherProvider>
              <MegaMenuProvider>
                <Navbar />
                <SideNav />
                {/* RiftCompare's shell: the rail reservation on an OUTER wrapper,
                    the content container on <main> (a pl-* and container-app's
                    px-* on one element fight over padding-left). Pages never add
                    their own outer container-app or py-*. */}
                <div className="pl-[var(--sidenav-w)]">
                  <main id="main-content" className="container-app min-w-0 py-6">
                    {children}
                  </main>
                </div>
                <LaunchPromoPopup providers={enabledProviders()} />
                <PremiumSlideIn />
                <AnnualSwitchNudge />
                <FeedbackWidget />
                {/* sign_up + "Your free account is ready" on ?welcome=, and a watch
                    stashed before OAuth (client-only; renders a toast at most). */}
                <SignupWelcome />
                {/* ?ref= and the first-touch traffic bucket (client-only, renders nothing). */}
                <ReferralCapture />
              </MegaMenuProvider>
            </CommandLauncherProvider>
            </SealedQuickViewProvider>
            </WatchlistDrawerProvider>
          </QuickViewProvider>
          {/* The ad zone needs the same rail reservation as <main>. It reads the
              market from CountryProvider, so it sits inside it. */}
          <div id="mc-ad-zone" className="pl-[var(--sidenav-w)]">
            <FooterAds />
          </div>
          {/* Email-only price alerts: renders nothing unless email is on AND
              NEXT_PUBLIC_ANON_ALERTS=1 (reads one cached Meta row, never the session). */}
          <PriceAlertModalGate />
        </CountryProvider>
        {/* The newsletter signup sits atop the footer; it renders nothing while email is off. */}
        <Footer
          newsletter={
            <EmailOnly>
              <NewsletterSignup siteName={SITE_NAME} />
            </EmailOnly>
          }
        />
        </PlanProvider>
        <AdSenseLoader />
        {/* Vercel Analytics behind the consent signal (RiftCompare's
            ConsentGatedAnalytics); GA4 with explicit page views. */}
        <ConsentGatedAnalytics />
        <GAPageViewTracker />
        {/* The outbound click log (contract 10.32): one listener, POST /api/click, written in the half-hour batch; renders nothing. */}
        <OutboundBeacon />
      </body>
    </html>
  );
}
