import { COUNTRIES, type Country } from "@/lib/country";
import { CHEAPER_ABROAD_SLUG, COUNTRY_GUIDE_SLUGS } from "@/lib/seo";

// The homepage's hand-picked reads (RiftCompare's lib/content/featured.ts):
// the EditorialHub's "Start here" and "Market updates" columns. Slugs are OP
// Compare blog posts (lib/blog); a slug that stops resolving simply drops out.
export type HomePick = { slug: string; line: string };

const GENERAL_BUYING_GUIDE = "where-to-buy-one-piece-cards";

export const START_HERE: readonly HomePick[] = [
  { slug: GENERAL_BUYING_GUIDE, line: "How the stores in each of the six markets compare for singles and sealed." },
  { slug: "one-piece-card-rarities-explained", line: "What C, UC, R, SR, SEC and L mean, and how Parallel, Manga, SP and Treasure Rare differ." },
  { slug: "cheapest-one-piece-leaders", line: "The cheapest Leader in every colour, to start a deck without spending much." },
];

export const MARKET_READS: readonly HomePick[] = [
  { slug: "most-expensive-one-piece-cards", line: "The priciest cards right now, in a table drawn from our own price data." },
  { slug: CHEAPER_ABROAD_SLUG, line: "Whether buying from another market still saves money once postage is added." },
  { slug: "one-piece-booster-box-prices", line: "Every booster box side by side, with the cost per pack." },
];

/** "Start here" for a region home: its own buying guide first (in its currency), then the general picks. */
export function startHereFor(market?: Country): HomePick[] {
  if (!market) return [...START_HERE];
  const { place, currency } = COUNTRIES[market];
  return [
    { slug: COUNTRY_GUIDE_SLUGS[market], line: `Where to buy in ${place}, with prices in ${currency}.` },
    ...START_HERE.filter((p) => p.slug !== COUNTRY_GUIDE_SLUGS[market]),
  ];
}

// Owner-curated reading lists: the "Editor's picks" on /blog and /guides
// (RiftCompare's lib/content/featured.ts). Curated, never "most read": nothing on
// the site counts views per article, so that label could not be kept true. Rules
// for a pick: evergreen and substantial, set-agnostic (no slug names a set), and
// published in the category its list says (tests/guides.test.ts pins it).
export const BLOG_PICKS: readonly string[] = ["are-one-piece-cards-cheaper-abroad", "most-expensive-one-piece-cards", "cheapest-one-piece-leaders"];
export const GUIDE_PICKS: readonly string[] = ["one-piece-card-rarities-explained", "where-to-buy-one-piece-cards"];
