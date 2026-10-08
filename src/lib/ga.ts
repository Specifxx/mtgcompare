// Google Analytics 4. MTG Compare needs its OWN GA4 property / web data stream
// (do not reuse a sister site's measurement id — the sites' traffic would
// mix). Nothing renders until NEXT_PUBLIC_GA_ID is set to a "G-…" id.
export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
export const GA_ENABLED = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

// Consent Mode v2: analytics and ad storage start DENIED in the EEA, the UK and
// Switzerland (GA sends cookieless pings there) and analytics is granted
// elsewhere. Ads storage, ad user data and personalisation are denied everywhere:
// any ad that AdSense serves is non-personalised until Google's consent message
// (or the visitor) grants more.
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];

/** How long Google's tags hold their first hit while a consent platform answers. It must be at least CMP_GRACE_MS (use-consent.ts, 2,500 ms): that is how long useConsent() waits before it decides no platform is present. Hard-coded here because that module is "use client". */
export const CONSENT_WAIT_WITH_CMP_MS = 3000;
/** With no consent platform on the page nothing will ever update the defaults, so the tags are not held back. */
export const CONSENT_WAIT_NO_CMP_MS = 500;

/**
 * The Consent Mode v2 defaults (parity P32), a plain script for <head> that runs before any measurement or ad tag. The four signals are
 * decided here and nowhere else (GoogleAnalytics no longer repeats them): ads storage, ad user data and personalisation are DENIED
 * everywhere; analytics storage is denied in the EEA, the UK and Switzerland (GA then sends cookieless pings) and granted elsewhere.
 * `adsense` says a consent platform can exist (Google's own message is delivered by the AdSense loader), which is what the wait is for.
 */
export function consentDefaultsScript(adsense: boolean): string {
  const wait = adsense ? CONSENT_WAIT_WITH_CMP_MS : CONSENT_WAIT_NO_CMP_MS;
  return (
    "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;" +
    `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:${JSON.stringify(CONSENT_REGIONS)},wait_for_update:${wait}});` +
    "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});" +
    "gtag('set','ads_data_redaction',true);"
  );
}
