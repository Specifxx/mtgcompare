// Google AdSense. On by default with the owner's publisher ID (DEFAULT_ADSENSE_CLIENT, owner 2026-10-15: "add this meta tag",
// for the AdSense site review); NEXT_PUBLIC_ADSENSE_CLIENT overrides it with another ID, and "off" switches AdSense off (no Google
// script, /ads.txt a 404, the privacy page saying no advertising cookies are set). DEPLOY.md, "Google AdSense", has the steps.
// Pure: safe in the browser (NEXT_PUBLIC_ values are inlined at build).
//
// What it turns on:
//   • the AdSense script and the google-adsense-account meta in every page's <head> (app/layout.tsx): what AdSense's site review
//     looks for, and what Auto ads (if the owner enables them in the AdSense dashboard) run from;
//   • /ads.txt (app/ads.txt/route.ts): Google's authorised-seller line for the publisher ID;
//   • with NEXT_PUBLIC_ADSENSE_SLOT_GUIDE too, one in-article unit in each guide (content/guides/kit.tsx), well clear of its eBay strip;
//   • the AdSense paragraphs on the privacy and about pages.

/** The owner's AdSense publisher ID (the google-adsense-account meta the owner gave, 2026-10-15). */
export const DEFAULT_ADSENSE_CLIENT = "ca-pub-6842128782879909";

/** The publisher ID in use: NEXT_PUBLIC_ADSENSE_CLIENT ("pub-…" or "ca-pub-…"), else the default; null when the variable is "off". */
export const ADSENSE_CLIENT: string | null = resolveClient(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);

export function resolveClient(v: string | undefined): string | null {
  const s = v?.trim() ?? "";
  if (/^off$/i.test(s)) return null;
  return normaliseClient(s) ?? DEFAULT_ADSENSE_CLIENT;
}

/** The ad unit ID of the guides' in-article unit (AdSense → Ads → By ad unit → In-article), or null: no unit. */
export const ADSENSE_GUIDE_SLOT: string | null = ADSENSE_CLIENT ? normaliseSlot(process.env.NEXT_PUBLIC_ADSENSE_SLOT_GUIDE) : null;

/** The adsbygoogle.js URL for the client. */
export const adsenseScriptSrc = (client: string) => `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;

/** The ads.txt body for the client: Google's line (its certification authority ID is fixed: f08c47fec0942fa0). */
export function adsTxt(client: string | null): string | null {
  return client ? `google.com, ${client.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n` : null;
}

export function normaliseClient(v: string | undefined): string | null {
  const m = /^(?:ca-)?pub-(\d{10,20})$/.exec(v?.trim() ?? "");
  return m ? `ca-pub-${m[1]}` : null;
}

function normaliseSlot(v: string | undefined): string | null {
  const s = v?.trim() ?? "";
  return /^\d{6,20}$/.test(s) ? s : null;
}
