// /llms-full.txt (https://llmstxt.org): the longer, quotable snapshot for AI
// search: what OP Compare is, how prices are made, the sets, the most valuable
// cards, the stores per market and the guides. Built from the cached loaders by
// the route; this file is the pure formatter so tests pin it.
import type { CardLite, SetLite } from "./data";
import { money } from "./format";
import { COUNTRIES, MARKETS } from "./country";

export interface LlmsFullInput {
  siteName: string;
  siteUrl: string;
  description: string;
  cards: CardLite[];
  sets: SetLite[];
  storesByMarket: Record<string, number>;
  guides: { title: string; href: string; description: string }[];
  index: { day: string; value: number } | null;
  pricesAt: string;
}

export function llmsFull(i: LlmsFullInput): string {
  const u = (p: string) => `${i.siteUrl}${p}`;
  const top = [...i.cards].filter((c) => c.marketUsd != null).sort((a, b) => b.marketUsd! - a.marketUsd!).slice(0, 25);
  const today = i.pricesAt.slice(0, 10);
  const released = i.sets.filter((s) => s.releasedOn && s.releasedOn <= today && ["booster", "extra", "premium"].includes(s.kind)).sort((a, b) => b.releasedOn!.localeCompare(a.releasedOn!));
  const upcoming = i.sets.filter((s) => s.releasedOn && s.releasedOn > today).sort((a, b) => a.releasedOn!.localeCompare(b.releasedOn!));
  const lines = [
    `# ${i.siteName}: full reference`,
    "",
    `> ${i.description}`,
    "",
    `Prices as of ${i.pricesAt.slice(0, 10)}. Store prices are the cheapest in-stock listing in each market, in that market's own currency; TCGplayer's market price is a US-dollar reference built from recent sales, never a listing. ${i.cards.length} printings across ${i.sets.length} sets.`,
    "",
    "## How prices are made",
    `- Each store is read twice a day and every listing is matched to ONE printing or left out; a listing not refreshed for 72 hours counts as sold out. See ${u("/methodology")}.`,
    "- A card has one row per printing (standard, Parallel, Manga, SP, Treasure Rare, reprint, promo); each is priced separately.",
    "",
    "## Stores per market",
    ...MARKETS.map((m) => `- ${COUNTRIES[m].label} (${COUNTRIES[m].currency}): ${i.storesByMarket[m] ?? 0} stores`),
    "",
    ...(i.index ? ["## Market index", `- The OP Compare Index was ${i.index.value.toFixed(1)} on ${i.index.day} (1,000 on its first day): ${u("/market")}`, ""] : []),
    "## Most valuable cards (TCGplayer market price, US$)",
    ...top.map((c, n) => `${n + 1}. [${c.name}${c.variant ? ` (${c.variant})` : ""} ${c.number ?? ""}](${u(`/card/${c.slug}`)}): ${money(c.marketUsd, "US")}`.replace(/\s+\]/, "]")),
    "",
    "## Released sets, newest first",
    ...released.slice(0, 30).map((s) => `- [${s.name} (${s.code})](${u(`/sets/${s.slug}`)}), released ${s.releasedOn}`),
    ...(upcoming.length ? ["", "## Upcoming", ...upcoming.slice(0, 10).map((s) => `- [${s.name} (${s.code})](${u(`/sets/${s.slug}`)}), ${s.releasedOn}`)] : []),
    "",
    "## Guides and posts",
    ...i.guides.map((g) => `- [${g.title}](${u(g.href)}): ${g.description}`),
    "",
  ];
  return lines.join("\n");
}
