import Script from "next/script";
import { GA_ID } from "@/lib/gtag";

// Vercel Web Analytics is OFF (owner, 2026-10-22: the site must cost a couple of dollars a month at most; Web Analytics bills
// every page view and event); src/lib/track.ts is its matching no-op. Google Analytics 4 is free (owner, 2026-10-23) and loads only
// when NEXT_PUBLIC_GA_ID is set at build, after the page is idle (lazyOnload), so it never competes with the page's own content.
// Without the id this renders nothing and lib/gtag.ts gaEvent() is a no-op.
export function SiteAnalytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="lazyOnload" />
      <Script id="ga4" strategy="lazyOnload">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});`}
      </Script>
    </>
  );
}
