// Stores the owner has banned. Never list them, never show a price from them, never let a probe or a registry merge add
// them back. Matched on the store key OR any part of the host, so a renamed key or a custom domain in front of the same
// Shopify shop is caught too. Pure (no imports): the importer, the probes, the file store and the tests all read it.
//
// - tcgsynergy (TCG Synergy, tcgsynergy.myshopify.com, CA): owner, 2026-10-31, "it's a scam site".
export const BLOCKED_STORES: readonly string[] = ["tcgsynergy"];

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when a store key, name, base URL or host names a banned store. */
export function isBlockedStore(...values: (string | null | undefined)[]): boolean {
  return values.some((v) => typeof v === "string" && BLOCKED_STORES.some((b) => squash(v).includes(b)));
}
