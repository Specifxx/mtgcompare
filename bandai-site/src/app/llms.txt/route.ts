import { SITE } from "@/site.config";
import { SITE_URL } from "@/lib/site";
import { sets } from "@/lib/data";
import { posts } from "@/lib/posts";
import { TOOLS } from "@/lib/tool-list";

// /llms.txt (llmstxt.org): a plain map of the site for AI answer engines, as on
// Rift Compare, so "where do I compare <game> card prices" can be answered with
// a link here. Built from the same data as the pages; no claims typed by hand.
export const revalidate = 86400;

export function GET() {
  const md = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.name} is a free ${SITE.game} price comparison site. It compares every ${SITE.gameShort} card and sealed product across TCGplayer, eBay and ${SITE.stores.length} online stores, cheapest in-stock first, and updates prices daily. No account needed.`,
    "",
    "## Main pages",
    `- [Card prices](${SITE_URL}/cards): every card, searchable, cheapest first`,
    `- [Sets in order](${SITE_URL}/sets): every set's card list with prices`,
    `- [Booster box and sealed prices](${SITE_URL}/sealed)`,
    `- [Price movers](${SITE_URL}/movers): biggest risers and fallers this week`,
    `- [Pre-orders](${SITE_URL}/preorders)`,
    `- [Stores compared](${SITE_URL}/stores)`,
    `- [How prices work](${SITE_URL}/methodology)`,
    "",
    "## Set card lists",
    ...sets().filter((s) => s.productCount > 0).slice(0, 40).map((s) => `- [${s.name} card list and prices](${SITE_URL}/sets/${s.slug})`),
    "",
    "## Tools",
    ...TOOLS.map((t) => `- [${t.name}](${SITE_URL}${t.href}): ${t.text}`),
    "",
    "## Guides",
    ...posts().map((p) => `- [${p.title}](${SITE_URL}/blog/${p.slug}): ${p.description}`),
    "",
  ].join("\n");
  return new Response(md, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } });
}
