// /llms-full.txt (https://llmstxt.org): the longer, quotable snapshot for AI
// search: what MTG Compare is, how prices are made, the sets, the most valuable
// cards, the stores per market and the guides. Built from the loaders by the
// route; this file is the pure formatter so tests pin it.
import type { CardLite, SetLite } from "./data";
import { RELEASE_SET_KINDS } from "./constants";
import { money } from "./format";
import { COUNTRIES, MARKETS } from "./country";

export interface LlmsFullInput {
  siteName: string;
  siteUrl: string;
  description: string;
  cards: Pick<CardLite, "slug" | "name" | "number" | "label" | "marketUsd">[];
  sets: Pick<SetLite, "slug" | "name" | "code" | "kind" | "releasedOn">[];
  totals?: { cards: number; sets: number };
  storesByMarket: Record<string, number>;
  guides: { title: string; href: string; description: string }[];
  index: { day: string; value: number } | null;
  pricesAt: string;
}

export function llmsFull(i: LlmsFullInput): string {
  const u = (p: string) => `${i.siteUrl}${p}`;
  const top = [...i.cards].filter((c) => c.marketUsd != null).sort((a, b) => b.marketUsd! - a.marketUsd!).slice(0, 25);
  const today = i.pricesAt.slice(0, 10);
  const kinds: readonly string[] = RELEASE_SET_KINDS;
  const released = i.sets.filter((s) => s.releasedOn && s.releasedOn <= today && kinds.includes(s.kind)).sort((a, b) => b.releasedOn!.localeCompare(a.releasedOn!));
  const upcoming = i.sets.filter((s) => s.releasedOn && s.releasedOn > today && kinds.includes(s.kind)).sort((a, b) => a.releasedOn!.localeCompare(b.releasedOn!));
  const counts = i.totals ?? { cards: i.cards.length, sets: i.sets.length };
  const lines = [
    `# ${i.siteName}: full reference`,
    "",
    `> ${i.description}`,
    "",
    `Prices as of ${today}. Store prices are the cheapest in-stock listing in each market, in that market's own currency; TCGplayer's market price is a US-dollar reference built from recent sales, never a listing. ${counts.cards} printings across ${counts.sets} sets.`,
    "",
    "## How prices are made",
    `- Each store is read regularly and every listing is matched to ONE printing and finish or left out; a listing not refreshed for 72 hours counts as sold out. See ${u("/methodology")}.`,
    "- A card has one price per printing and finish (Normal, Foil, Etched); each is priced separately.",
    "",
    "## Stores per market",
    ...MARKETS.map((m) => `- ${COUNTRIES[m].label} (${COUNTRIES[m].currency}): ${i.storesByMarket[m] ?? 0} stores`),
    "",
    ...(i.index ? ["## Market index", `- The ${i.siteName} Index was ${i.index.value.toFixed(1)} on ${i.index.day} (1,000 on its first day): ${u("/market")}`, ""] : []),
    "## Most valuable cards (TCGplayer market price, US$)",
    ...top.map((c, n) => `${n + 1}. [${c.name}${c.label ? ` (${c.label})` : ""} ${c.number ?? ""}](${u(`/card/${c.slug}`)}): ${money(c.marketUsd, "US")}`.replace(/\s+\]/, "]")),
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
