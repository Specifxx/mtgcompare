import { ADSENSE_CONFIGURED } from "@/lib/adsense";
import { GA_ENABLED, consentDefaultsScript } from "@/lib/ga";

// Google Consent Mode v2, default state (parity P32): an inline, synchronous script that sits first in <head> of the root layout, so the
// four signals are set before GA4 or the AdSense loader (which is async, so it cannot run before the parser has run this) read them.
// It renders only when something Google-shaped will load: a GA4 id or an AdSense publisher id. With neither there is no tag to
// consent for and no script on the page.
//
// The defaults are region-scoped, not blanket: the EEA, the UK and Switzerland start with analytics denied (cookieless pings), everywhere
// else it is granted, and ad storage is denied in every region (lib/ga.ts). The wait for a consent platform is long only when AdSense
// is configured, because Google's own message arrives with its loader; otherwise nothing could answer and nothing waits.
export function ConsentDefaults() {
  if (!GA_ENABLED && !ADSENSE_CONFIGURED) return null;
  return <script id="consent-defaults" dangerouslySetInnerHTML={{ __html: consentDefaultsScript(ADSENSE_CONFIGURED) }} />;
}
