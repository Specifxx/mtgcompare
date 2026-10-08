import { POSTS, postHref } from "@/lib/blog";
import { getCatalogStats } from "@/lib/data";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES } from "@/lib/stores";

// /llms.txt (https://llmstxt.org): what MTG Compare is and its key URLs, for
// AI search. Counts come from the plane's status file; nothing private is
// listed (no account, admin or API routes).
export const dynamic = "force-dynamic";

export async function GET() {
  let cards = 0;
  let sets = 0;
  let pricesAt = new Date().toISOString();
  try {
    const st = await getCatalogStats();
    cards = st.cards;
    sets = st.sets;
    pricesAt = st.pricesAt;
  } catch {
    /* no data yet: the counts are left out */
  }
  const u = (p: string) => `${SITE_URL}${p}`;
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} compares Magic: The Gathering prices across ${STORES.length} stores in six markets (the United States, Australia, the United Kingdom, Singapore, Canada and the EU), plus TCGplayer in the US. Store listings are matched to the exact printing and finish (Normal, Foil, Etched); a listing that cannot be placed with certainty is left out. Prices are in each market's own currency; TCGplayer's market price is shown as a reference, never as a listing.${cards ? ` The catalogue has ${cards} printings in ${sets} sets.` : ""}`,
    "",
    "## Prices",
    `- [Card database](${u("/browse")}): every printing, filterable by set, colour, rarity, type and finish`,
    `- [Price guide](${u("/price-guide")}): the most valuable cards with their cheapest store price and TCGplayer market price`,
    `- [Singles](${u("/singles")}): where to buy Magic singles, by market`,
    `- [Sealed products](${u("/sealed")}): booster boxes, bundles and Commander decks`,
    `- [Market index](${u("/market")}) and [weekly movers](${u("/movers")})`,
    `- [Stores we track](${u("/stores")}): every store, with a page per store`,
    "",
    "## Tools",
    `- [Deck price calculator](${u("/deck")}): paste a decklist (4 Lightning Bolt) and price every card, free`,
    `- [Selling fee calculator](${u("/tools/selling-fees")}): TCGplayer, eBay and Cardmarket fees`,
    `- [Box EV calculator](${u("/tools/box-ev")}), [Deal Finder](${u("/tools/deal-finder")}), [Best Basket](${u("/tools/best-basket")}); all tools: [${u("/tools")}](${u("/tools")})`,
    "",
    "## Guides",
    ...POSTS.map((p) => `- [${p.title({ cat: { pricesAt } })}](${u(postHref(p))}): ${p.description}`),
    "",
    "## About",
    `- [How we compare prices](${u("/methodology")}), [About](${u("/about")}), [Editorial policy](${u("/editorial-policy")})`,
    `- [Full reference for AI search](${u("/llms-full.txt")}): the same facts at length, with the most valuable cards, every released set and the stores per market`,
    `- Feeds: [RSS](${u("/feed.xml")}), [JSON Feed](${u("/feed.json")}); [sitemap](${u("/sitemap.xml")})`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
