// The buyer's postage choices — delivery region and "tracked postage only" —
// remembered in this browser so Best Basket and the portfolio's replacement
// cost price delivery the same way. localStorage can be missing or throw
// (private windows, blocked site data), so every access is guarded and a
// failure just means "not remembered".
//
// Three states for the region, because the page can now GUESS one from the
// visitor's location (lib/shipping.ts regionFromGeo): never chosen (no key —
// the geo guess applies), chosen "Not sure" (an empty string — stays unknown,
// priced at every store's HIGHEST regional rate, and the geo guess must not
// override it), or a region key.

export interface PostagePrefs {
  region: string | null; // a region key for the market, or null ("Not sure", or never chosen)
  regionChosen: boolean; // the buyer picked something here, "Not sure" included
  trackedOnly: boolean;
}

// MTG Compare's keys (RiftCompare's are rc:postage-region:<market> and
// rc:postage-tracked-only): one mc_postage prefix for both.
export const POSTAGE_PREFS_KEY = "mc_postage";
const regionKey = (market: string) => `${POSTAGE_PREFS_KEY}:region:${market}`;
const TRACKED_KEY = `${POSTAGE_PREFS_KEY}:tracked-only`;

export function readPostagePrefs(market: string): PostagePrefs {
  try {
    const ls = window.localStorage;
    const stored = ls.getItem(regionKey(market));
    return { region: stored || null, regionChosen: stored !== null, trackedOnly: ls.getItem(TRACKED_KEY) === "1" };
  } catch {
    return { region: null, regionChosen: false, trackedOnly: false };
  }
}

export function writePostagePrefs(market: string, prefs: { region: string | null; trackedOnly: boolean }): void {
  try {
    const ls = window.localStorage;
    ls.setItem(regionKey(market), prefs.region ?? "");
    ls.setItem(TRACKED_KEY, prefs.trackedOnly ? "1" : "0");
  } catch {
    // Not remembered — harmless.
  }
}

/**
 * The region to price with: the buyer's remembered choice, else the geo
 * guess, each only if it is one of this market's options.
 */
export function effectiveRegion(prefs: PostagePrefs, geoRegion: string | null | undefined, valid: (key: string) => boolean): string | null {
  if (prefs.regionChosen) return prefs.region && valid(prefs.region) ? prefs.region : null;
  return geoRegion && valid(geoRegion) ? geoRegion : null;
}
