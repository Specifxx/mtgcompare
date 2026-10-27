import { GUIDES, guideRegions } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { REGION_LIST, X_DEFAULT_REGION } from "@/lib/regions";
import { FAN_CONTENT_DISCLAIMER, SECTION_PATHS, SITE_NAME, SITE_URL } from "@/lib/site";
import { SETS } from "@/lib/sets";
import { STORES } from "@/lib/stores";

// /llms.txt (llmstxt.org): a plain map of the site for AI answer engines, as RiftCompare
// publishes, so "where do I compare Magic booster box prices" can be answered with a
// link here. Constants only (no database): built once per deploy.
export const dynamic = "force-static";

export function GET() {
  const d = X_DEFAULT_REGION;
  const u = (p: string) => `${SITE_URL}/${d}${p}`;
  const sets = SETS.filter((s) => !s.generic).sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 30);
  const md = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_NAME} is a free price comparison site for English-language Magic: The Gathering sealed product (Play and Collector Booster boxes, Bundles, Commander decks, Secret Lair drops). It reads ${STORES.length} independent stores in ${REGION_LIST.length} regions (${REGION_LIST.map((r) => r.region.toUpperCase()).join(", ")}) about twice a day and lists every product's offers in stock first, cheapest first, in the region's own currency. No account needed.`,
    "",
    "## Regions",
    ...REGION_LIST.map((r) => `- [${r.name}](${SITE_URL}/${r.region})`),
    "",
    "## Main pages (US shown; every region has the same paths)",
    `- [All sealed products](${u(SECTION_PATHS.sealed)})`,
    `- [Play Booster box prices](${u(SECTION_PATHS.boosterBoxes)})`,
    `- [Collector Booster box prices](${u(SECTION_PATHS.collectorBoxes)})`,
    `- [Bundle prices](${u(SECTION_PATHS.bundles)})`,
    `- [Commander deck prices](${u(SECTION_PATHS.commanderDecks)})`,
    `- [Secret Lair prices](${u(SECTION_PATHS.secretLair)})`,
    `- [Cheapest packs, per pack](${u(SECTION_PATHS.perPack)})`,
    `- [Deals](${u(SECTION_PATHS.deals)})`,
    `- [Price moves](${u(SECTION_PATHS.priceMoves)})`,
    `- [Sets](${u(SECTION_PATHS.sets)}) and [release dates](${u(SECTION_PATHS.releases)})`,
    `- [About and methodology](${SITE_URL}/about)`,
    "",
    "## Sets (sealed prices per set)",
    ...sets.map((s) => `- [${s.name}](${u(`/sets/${s.slug}`)})`),
    "",
    "## Tools",
    ...TOOLS.map((t) => `- [${t.title}](${u(`/tools/${t.slug}`)}): ${t.description}`),
    "",
    "## Guides",
    ...GUIDES.map((g) => {
      const r = guideRegions(g).includes(d) ? d : guideRegions(g)[0];
      return `- [${g.title}](${SITE_URL}/${r}/guides/${g.slug}): ${g.description}`;
    }),
    "",
    "## Legal",
    FAN_CONTENT_DISCLAIMER,
    "",
  ].join("\n");
  return new Response(md, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
