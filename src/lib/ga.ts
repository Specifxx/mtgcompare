// Google Analytics 4. OP Compare needs its OWN GA4 property / web data stream
// (do not reuse RiftCompare's measurement id — the two sites' traffic would
// mix). Nothing renders until NEXT_PUBLIC_GA_ID is set to a "G-…" id.
export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
export const GA_ENABLED = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

// Consent Mode v2: analytics and ad storage start DENIED in the EEA, the UK and
// Switzerland (GA sends cookieless pings there) and analytics is granted
// elsewhere. Ads storage is denied everywhere — the site runs no ads.
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH",
];
