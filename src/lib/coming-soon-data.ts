// The "Coming soon" block's read: the next set's price lists in a market (data.ts setOfferGroups, the pre-order hub's own read), turned
// into the block's lines (lib/coming-soon.ts). No set upcoming: no read.
import { featuredFor, nextUpcomingSet, type Featured } from "./coming-soon";
import { setOfferGroups } from "./data";
import { REGION_LIST, REGIONS, type Region } from "./regions";

export async function loadFeatured(region: Region, today: string = new Date().toISOString().slice(0, 10)): Promise<Featured | null> {
  const set = nextUpcomingSet(today);
  if (!set) return null;
  const r = REGIONS[region];
  const g = await setOfferGroups(r.market, set.code).catch(() => []);
  return featuredFor(r, g, today);
}

/** Every region's block, for the landing page's region switch. */
export async function loadFeaturedAll(today: string = new Date().toISOString().slice(0, 10)): Promise<Partial<Record<Region, Featured>>> {
  const out: Partial<Record<Region, Featured>> = {};
  await Promise.all(
    REGION_LIST.map(async (r) => {
      const f = await loadFeatured(r.region, today);
      if (f) out[r.region] = f;
    }),
  );
  return out;
}
