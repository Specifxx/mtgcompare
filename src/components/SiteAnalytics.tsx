import Script from "next/script";
import { GA_ID } from "@/lib/gtag";
import { VercelPageViews } from "./VercelPageViews";

// Vercel Web Analytics counts PAGE VIEWS only (back on 2026-10-25 after being off for cost since 2026-10-22; components/
// VercelPageViews); custom events stay off (src/lib/track.ts is a no-op). Google Analytics 4 is free (owner, 2026-10-23) and loads only
// when NEXT_PUBLIC_GA_ID is set at build, after the page is idle (lazyOnload), so it never competes with the page's own content.
// Without the id this renders nothing and lib/gtag.ts gaEvent() is a no-op.
export function SiteAnalytics() {
  if (!GA_ID) return <VercelPageViews />;
  return (
    <>
      <VercelPageViews />
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`} strategy="lazyOnload" />
      <Script id="ga4" strategy="lazyOnload">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(GA_ID)});`}
      </Script>
    </>
  );
}
