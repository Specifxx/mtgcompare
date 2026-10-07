import type { MetadataRoute } from "next";
import { getCatalog, getLibraryDecks, getSealedCatalog } from "@/lib/data";
import { COLORS, COLOR_KEYS } from "@/lib/constants";
import { AUTHORS, POSTS, postHref } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";
import { getStoreStats } from "@/lib/data";
import { leaderSlug, PRINTING_FACETS, RARITY_FACETS, TYPE_FACETS } from "@/lib/facets";
import { KEYWORDS } from "@/lib/keywords";
import { STORES } from "@/lib/stores";

// Revalidated daily; reads the same cached loaders as the pages (egress rule 1).
// Private paths (the admin area, account pages) are never listed here.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed = [
    "", "/browse", "/price-guide", "/sealed", "/market", "/market/records", "/movers", "/stores", "/sets", "/leaders", "/colors", "/cards", "/cards/all",
    "/tools/deal-finder", "/tools/box-ev", "/tools/best-basket", "/tools/rising", "/tools/demand", "/trade", "/premium", "/release-dates", "/stores/suggest", "/feedback", "/blog", "/authors", "/editorial-policy", "/about", "/methodology", "/contact", "/privacy", "/terms",
    "/tools", "/deck", "/tools/selling-fees", "/singles", "/keywords", "/cards/rarity", "/alerts",
  ].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "daily" as const, priority: p === "" ? 1 : 0.7 }));
  // The five region homes (design track), each a market-locked copy of "/".
  const regions = ["/au", "/uk", "/ca", "/sg", "/eu"].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.9 }));
  fixed.push(...regions);
  const posts = POSTS.map((p) => ({ url: `${SITE_URL}${postHref(p)}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.8 }));
  // A build with no database yet (the very first deploy) still gets a sitemap;
  // the daily revalidation fills in the cards once the import has run.
  let data: [Awaited<ReturnType<typeof getCatalog>>, Awaited<ReturnType<typeof getSealedCatalog>>];
  try {
    data = await Promise.all([getCatalog(), getSealedCatalog()]);
  } catch {
    return [...fixed, ...posts, ...catalogueEntries(null, now)];
  }
  const [cat, sealed] = data;
  return [
    ...fixed,
    ...posts,
    ...COLOR_KEYS.map((k) => ({ url: `${SITE_URL}/colors/${COLORS[k].slug}`, lastModified: now })),
    ...cat.sets.map((s) => ({ url: `${SITE_URL}/sets/${s.slug}`, lastModified: now })),
    ...sealed.filter((s) => s.kind !== "Promo Pack").map((s) => ({ url: `${SITE_URL}/sealed/${s.slug}`, lastModified: now })),
    ...cat.cards.map((c) => ({ url: `${SITE_URL}/card/${c.slug}`, lastModified: now })),
    ...toolsTrackEntries(cat, await getStoreStats().catch(() => []), now),
    ...catalogueEntries(cat, now),
    ...(await deckEntries(now)),
  ];
}

// The public deck library (RiftCompare's sitemap-sections): /decks itself only
// once a deck is live (an empty library is noindexed too), then every live deck
// and each Leader's page. A failed read lists none rather than failing the map.
async function deckEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  const decks = await getLibraryDecks().catch(() => []);
  if (!decks.length) return [];
  const leaders = new Map<string, string>();
  for (const d of decks) if (!leaders.has(d.leaderSlug)) leaders.set(d.leaderSlug, d.createdAt);
  return [
    { url: `${SITE_URL}/decks`, changeFrequency: "daily", priority: 0.7, lastModified: new Date(decks[0].createdAt) },
    ...[...leaders].map(([slug, at]) => ({ url: `${SITE_URL}/decks/leader/${slug}`, changeFrequency: "weekly" as const, priority: 0.5, lastModified: new Date(at) })),
    ...decks.map((d) => ({ url: `${SITE_URL}/decks/${d.slug}`, changeFrequency: "weekly" as const, priority: 0.5, lastModified: new Date(d.createdAt) })),
  ];
}

// The tools track's landing pages: card facets, keywords, one page per Leader
// number and per store with stock (thin store pages are noindex, so not listed).
function toolsTrackEntries(cat: Awaited<ReturnType<typeof getCatalog>>, stats: Awaited<ReturnType<typeof getStoreStats>>, now: Date): MetadataRoute.Sitemap {
  const leaders = new Set(cat.cards.filter((c) => c.cardType === "Leader" && c.number).map((c) => leaderSlug(c.name, c.number)));
  const stocked = new Set(stats.filter((s) => s.inStock >= 10).map((s) => s.source));
  return [
    ...PRINTING_FACETS.map((f) => `/cards/printing/${f.slug}`),
    ...RARITY_FACETS.map((f) => `/cards/rarity/${f.slug}`),
    ...TYPE_FACETS.map((f) => `/cards/type/${f.slug}`),
    ...KEYWORDS.map((k) => `/keywords/${k.slug}`),
    ...[...leaders].map((s) => `/leaders/${s}`),
    ...STORES.filter((s) => stocked.has(`store:${s.key}`)).map((s) => `/stores/${s.key}`),
  ].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now }));
}

// The catalogue track's pages: the guides hub, the gallery hub and every set's
// gallery (a set with no revealed cards is noindex, so not listed), support,
// authors. The guides themselves are in `posts` through postHref.
function catalogueEntries(cat: Awaited<ReturnType<typeof getCatalog>> | null, now: Date): MetadataRoute.Sitemap {
  const withCards = cat ? new Set(cat.cards.map((c) => c.setId)) : new Set<number>();
  return [
    "/guides",
    "/gallery",
    "/support",
    "/learn",
    ...AUTHORS.map((a) => `/authors/${a.slug}`),
    ...(cat ? cat.sets.filter((s) => withCards.has(s.id)).map((s) => `/sets/${s.slug}/gallery`) : []),
  ].map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now }));
}
