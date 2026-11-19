// WHICH CREATOR OR POST brought a visitor (2026-11-20, paid creators; the same idea as DexCompare's lib/campaign.ts). Every link we
// give a creator carries ?utm_source=<platform>&utm_medium=creator&utm_campaign=<handle>. The tag is gone after the first page, so the
// tab's first-touch campaign is kept here and sent as `campaign` on GA4's click events (OutboundLink), so a creator's buy clicks can be
// counted. A tag, never a person: letters, digits, dash and underscore, 40 characters.
const KEY = "mc_campaign";

/** Pure: a safe campaign tag from a landing URL's query string, or undefined. */
export function cleanCampaign(search: string): string | undefined {
  const raw = (new URLSearchParams(search).get("utm_campaign") ?? "").trim().toLowerCase();
  return raw.replace(/[^a-z0-9_-]/g, "").slice(0, 40) || undefined;
}

/** Client: the tab's first-touch campaign (only the first call in a tab writes), or undefined. */
export function readCampaign(): string | undefined {
  try {
    if (sessionStorage.getItem(KEY) === null) sessionStorage.setItem(KEY, cleanCampaign(window.location.search) ?? "");
    return sessionStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}
