import { readMeta } from "@/lib/store";
import { LIVE_GAMES, SITE } from "@/site.config";

export const dynamic = "force-dynamic";
// A plain description for AI answer engines: what the site is, where the prices come from, how the URLs are built.
export function GET() {
  const meta = readMeta();
  const lines = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.tagline}. Each card has one page with TCGplayer's market price in US dollars (what copies recently sold for), per printing, updated once a day, with its price history.`,
    "",
    "## Games",
    ...LIVE_GAMES.map((g) => `- [${g.name}](${SITE.url}/${g.slug}): ${meta.games[g.slug]?.cards ?? 0} cards in ${meta.games[g.slug]?.sets ?? 0} sets`),
    "",
    "## How to read a page",
    "- URL: /<game>/<set>/<card-name>-<collector-number>",
    "- The headline price is TCGplayer's market price for the most valuable printing; the table lists every printing.",
    "- Prices are in US dollars and carry the date they were last updated.",
    `- Data source: TCGplayer market prices via tcgcsv.com. Last update: ${meta.generatedAt || "not yet"}.`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
