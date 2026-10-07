import { POSTS, postHref } from "@/lib/blog";
import { getCatalog } from "@/lib/data";
import { KEYWORDS } from "@/lib/keywords";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { STORES } from "@/lib/stores";

// /llms.txt (https://llmstxt.org): what OP Compare is and its key URLs, for
// AI search. Counts come from the cached catalogue; nothing private is listed
// (no account, admin or API routes).
export const revalidate = 86400;

export async function GET() {
  let cards = 0;
  let sets = 0;
  let titles = new Map<string, string>();
  try {
    const cat = await getCatalog();
    cards = cat.cards.length;
    sets = cat.sets.length;
    titles = new Map(POSTS.map((p) => [p.slug, p.title({ cat })]));
  } catch {
    /* no database yet: the counts are left out */
  }
  const u = (p: string) => `${SITE_URL}${p}`;
  const lines = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `${SITE_NAME} compares One Piece Card Game prices across ${STORES.length} stores in six markets (the United States, Australia, the United Kingdom, Singapore, Canada and the EU), plus TCGplayer in the US. Store listings are read twice a day and matched to the exact printing (standard, Parallel, Manga, SP, Treasure Rare, reprints and promos); a listing that cannot be placed with certainty is left out. Prices are in each market's own currency; TCGplayer's market price is shown as a reference, never as a listing.${cards ? ` The catalogue has ${cards} printings in ${sets} sets.` : ""}`,
    "",
    "## Prices",
    `- [Card database](${u("/browse")}): every printing, filterable by set, colour, rarity, type and printing`,
    `- [Price guide](${u("/price-guide")}): the most valuable cards with their cheapest store price and TCGplayer market price`,
    `- [Singles](${u("/singles")}): where to buy One Piece singles, by market`,
    `- [Sealed products](${u("/sealed")}): booster boxes, packs and starter decks`,
    `- [Market index](${u("/market")}) and [weekly movers](${u("/movers")})`,
    `- [Stores we track](${u("/stores")}): every store, with a page per store`,
    "",
    "## Card lists",
    `- [Sets](${u("/sets")}), [Leaders](${u("/leaders")}), [colours](${u("/colors")}), [rarities](${u("/cards/rarity")}), [types and printings](${u("/cards")})`,
    `- [Keywords](${u("/keywords")}): ${KEYWORDS.slice(0, 8).map((k) => k.name).join(", ")} and more, each with every card whose text has it`,
    "",
    "## Tools",
    `- [Deck price calculator](${u("/deck")}): paste a decklist (4xOP01-016) and price every card, free`,
    `- [Selling fee calculator](${u("/tools/selling-fees")}): TCGplayer, eBay and Cardmarket fees`,
    `- [Box EV calculator](${u("/tools/box-ev")}), [Deal Finder](${u("/tools/deal-finder")}), [Best Basket](${u("/tools/best-basket")}); all tools: [${u("/tools")}](${u("/tools")})`,
    "",
    "## Guides",
    ...POSTS.map((p) => `- [${titles.get(p.slug) ?? p.slug}](${u(postHref(p))}): ${p.description}`),
    "",
    "## About",
    `- [How we compare prices](${u("/methodology")}), [About](${u("/about")}), [Editorial policy](${u("/editorial-policy")})`,
    `- [Full reference for AI search](${u("/llms-full.txt")}): the same facts at length, with the most valuable cards, every released set and the stores per market`,
    `- Feeds: [RSS](${u("/feed.xml")}), [JSON Feed](${u("/feed.json")}); [sitemap](${u("/sitemap.xml")})`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
