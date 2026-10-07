// PERSONAL PREMIUM NUDGES — what Deal Finder says about the cards THIS account
// watches. RiftCompare's lib/premium-nudge.ts, ported in wave 2 (2026-10-03).
//
// Every Plus pitch on the site is generic ("Deal Finder lists cards that are
// cheaper in one place than another"); the most persuasive line available is
// about the reader's own cards — "4 cards you watch are underpriced right now"
// — and the data to say it is already cached.
//
// COST, per call: one user-scoped, capped select (their watches,
// lib/watchlist-server.ts) and the Deal Finder ranking from its self-cached
// inputs (lib/data.ts getDealRankById — called directly, never inside another
// cache), plus the cached catalogue for one example name.
//
// WHAT IT REVEALS: counts, whether a card is inside the free top three, and
// one example card name. Never a price, a gap or a rank beyond "in the free
// top 3 or not" — those are what Plus sells.
//
// OP Compare differences: Rising Cards (tools track) and the portfolio
// (collection-alerts track) feed the "rising" and "owned" tallies when they
// land; until then those inputs are empty maps and only the watched-deal
// nudge can fire.
import { getCatalog, getDealRankById } from "./data";
import { hrefFor } from "./deal-finder-href";
import { FREE_DEAL_ROWS } from "./plans";
import { watchedCardIds } from "./watchlist-server";
import type { Country } from "./country";

/** A hit at or above this rank is one the free account can already see (Deal Finder's free rows). */
export const FREE_PREVIEW_ROWS = FREE_DEAL_ROWS;

export interface NudgeCounts {
  deals: number; // cards in Deal Finder's default view
  dealsFree: number; // …of which in the free top 3
  rising: number; // cards among Rising Cards' ranked picks
  risingFree: number; // …of which in the free top 3
}
export interface PremiumNudge {
  watched: NudgeCounts;
  owned: NudgeCounts;
  example: { name: string; kind: "deal" | "rising"; set: "watched" | "owned" } | null;
}

const EMPTY: NudgeCounts = { deals: 0, dealsFree: 0, rising: 0, risingFree: 0 };

/** Pure: tally one set of card ids against the two rankings. */
export function tally(ids: Iterable<number>, dealRank: Map<number, number>, risingRank: Map<number, number>): NudgeCounts {
  const c = { ...EMPTY };
  for (const id of ids) {
    const d = dealRank.get(id);
    if (d != null) {
      c.deals++;
      if (d <= FREE_PREVIEW_ROWS) c.dealsFree++;
    }
    const r = risingRank.get(id);
    if (r != null) {
      c.rising++;
      if (r <= FREE_PREVIEW_ROWS) c.risingFree++;
    }
  }
  return c;
}

export function hasNudge(n: PremiumNudge | null): n is PremiumNudge {
  return !!n && n.watched.deals + n.watched.rising + n.owned.rising > 0;
}

/** Pure: build the nudge from the account's ids and the rankings (the example's name from `nameOf`). */
export function buildNudge(
  watched: Set<number>,
  owned: Set<number>,
  dealRank: Map<number, number>,
  risingRank: Map<number, number>,
  nameOf: (id: number) => string | null,
): PremiumNudge | null {
  if (!watched.size && !owned.size) return null;
  const nudge: PremiumNudge = { watched: tally(watched, dealRank, risingRank), owned: tally(owned, new Map(), risingRank), example: null };
  if (!hasNudge(nudge)) return null;
  // One example, preferring a card the free account CANNOT already see.
  const locked = (rank: number | undefined) => rank != null && rank > FREE_PREVIEW_ROWS;
  const watchedDeal = [...watched].find((id) => locked(dealRank.get(id))) ?? [...watched].find((id) => dealRank.has(id));
  const watchedRise = [...watched].find((id) => locked(risingRank.get(id))) ?? [...watched].find((id) => risingRank.has(id));
  const ownedRise = [...owned].find((id) => locked(risingRank.get(id))) ?? [...owned].find((id) => risingRank.has(id));
  const pick: { id: number; kind: "deal" | "rising"; set: "watched" | "owned" } | null =
    watchedDeal != null
      ? { id: watchedDeal, kind: "deal", set: "watched" }
      : watchedRise != null
        ? { id: watchedRise, kind: "rising", set: "watched" }
        : ownedRise != null
          ? { id: ownedRise, kind: "rising", set: "owned" }
          : null;
  if (pick) {
    const name = nameOf(pick.id);
    if (name) nudge.example = { name, kind: pick.kind, set: pick.set };
  }
  return nudge;
}

export async function getPremiumNudge(userId: string, country: Country): Promise<PremiumNudge | null> {
  const watched = new Set((await watchedCardIds(userId)).map((r) => r.cardId));
  if (!watched.size) return null;
  const [dealRank, cat] = await Promise.all([getDealRankById(country), getCatalog()]);
  return buildNudge(watched, new Set(), dealRank, new Map(), (id) => cat.byId.get(id)?.name ?? null);
}

// ── Copy ─────────────────────────────────────────────────────────────────────
// Pure, so every sentence is testable. Returns null when there is nothing true
// and specific to say — the caller then renders nothing.
const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Where a member's nudge card links: the list it is talking about, never a wall. */
export function memberNudgeHref(kind: "deal" | "rising"): string {
  return kind === "deal" ? hrefFor({ view: "tcg", buy: null, sort: "saving", page: 1, mine: "watch" }) : "/tools/rising";
}

// Plus is ad-free, and every surface that describes Plus says so. While email
// is off Plus "flags" a card at your price rather than emailing.
export function plusGateLine(emailOn: boolean): string {
  return `Plus shows every one with no ads, and ${emailOn ? "can email you when one hits your price" : "flags one when it hits your price"}.`;
}

export function nudgeCopy(
  nudge: PremiumNudge,
  where: "watched" | "owned",
  audience: "free" | "member" = "free",
  emailOn = false,
): { heading: string; line: string; kind: "deal" | "rising" } | null {
  const c = nudge[where];
  const who = where === "watched" ? ["card you watch", "cards you watch"] : ["card you own", "cards you own"];
  const ex = nudge.example && nudge.example.set === where ? nudge.example : null;
  const free = audience === "free";

  if (where === "watched" && c.deals > 0) {
    const heading = `${n(c.deals, `${who[0]} is`, `${who[1]} are`)} underpriced right now`;
    const parts = [`Deal Finder shows ${c.deals === 1 ? "it" : "them"} selling below TCGplayer's market price${ex?.kind === "deal" ? ` — including ${ex.name}` : ""}.`];
    if (free && c.dealsFree > 0) parts.push(`${c.dealsFree === c.deals ? (c.deals === 1 ? "It's" : "All are") : n(c.dealsFree, "is", "are")} in your free top 3.`);
    if (c.rising > 0) parts.push(`${n(c.rising, "is also a Rising Cards pick", "are also Rising Cards picks")}.`);
    if (free) parts.push(plusGateLine(emailOn));
    return { heading, line: parts.join(" "), kind: "deal" };
  }
  if (c.rising > 0) {
    const heading = `${n(c.rising, `${who[0]} is a Rising Cards pick`, `${who[1]} are Rising Cards picks`)} right now`;
    const parts = [`Ranked by demand and price-timing signals${ex?.kind === "rising" ? ` — including ${ex.name}` : ""}.`];
    if (free && c.risingFree > 0) parts.push(`${c.risingFree === c.rising ? (c.rising === 1 ? "It's" : "All are") : n(c.risingFree, "is", "are")} in your free top 3.`);
    if (free) parts.push("Plus shows every pick, with no ads.");
    return { heading, line: parts.join(" "), kind: "rising" };
  }
  return null;
}
