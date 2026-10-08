// PERSONAL PREMIUM NUDGES — what Deal Finder says about the cards THIS account
// watches. RiftCompare's lib/premium-nudge.ts, ported in wave 2 (2026-10-03).
//
// Every Plus pitch on the site is generic ("Deal Finder lists cards that are
// cheaper in one place than another"); the most persuasive line available is
// about the reader's own cards — "4 cards you watch are underpriced right now"
// — and the Deal Finder loader can answer it.
//
// COST, per call: one user-scoped, capped select (their watches,
// lib/watchlist-server.ts) and the Deal Finder ranks of THOSE ids from the
// paid loader (lib/data/deals.ts; the ranking is a tier-neutral cache entry,
// nothing here wraps it in another cache), plus one name for the example.
//
// WHAT IT REVEALS: counts, whether a card is inside the free top three, and
// one example card name. Never a price, a gap or a rank beyond "in the free
// top 3 or not" — those are what Plus sells. The ranking is NOT a file and no
// row of it reaches the page: the loader answers positions of the account's
// own ids and this module folds them into counts.
//
// Rising Cards (Premium) is not folded in: its picks beyond the free preview
// exist only behind the loader's gate, so the "rising" tallies stay empty and
// only the watched-deal nudge fires, as before the tools track landed.
import { getCardsByIds, getDealList } from "./data";
import * as dealLoaders from "./data";
import { uidOf, unitOfUid } from "./constants";
import { hrefFor } from "./deal-finder-href";
import { FREE_DEAL_ROWS } from "./plans";
import { watchedCardIds } from "./watchlist-server";
import type { Entitlement } from "./data/plane/entitlement";
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

/** A unit id: the product id and its finish (0 Normal, 1 Foil), the key of a Deal Finder row. */
const uidsOf = (ids: Iterable<number>): number[] => [...ids].flatMap((id) => [uidOf(id, "N"), uidOf(id, "F")]);

/**
 * Where each of these cards stands in the DEFAULT Deal Finder ranking of a market
 * (1-based, the better finish of a card), absent when it is not on the list.
 *
 * REQ-WP18-1 (to WP13): the loader `getDealRanksOf(country, uids)` answers this for
 * any viewer without returning a row. Until it exists in lib/data/deals.ts this
 * falls back to what the account's OWN slice shows (the free top rows, or the
 * page of a paid viewer), which can only undercount, never overstate. Reflect.get
 * keeps the build quiet about an export that may not exist yet.
 */
async function dealRanks(country: Country, ids: Set<number>, who: Entitlement): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const ranksOf = Reflect.get(dealLoaders, "getDealRanksOf") as ((c: Country, uids: readonly number[]) => Promise<Map<number, number>>) | undefined;
  if (typeof ranksOf === "function") {
    for (const [uid, rank] of await ranksOf(country, uidsOf(ids))) {
      const id = unitOfUid(uid).id;
      out.set(id, Math.min(rank, out.get(id) ?? Infinity));
    }
    return out;
  }
  const slice = await getDealList(country, {}, who);
  slice.rows.forEach((row, i) => {
    const id = unitOfUid(row.uid).id;
    if (ids.has(id) && !out.has(id)) out.set(id, i + 1);
  });
  return out;
}

export async function getPremiumNudge(userId: string, country: Country, who?: Entitlement): Promise<PremiumNudge | null> {
  const watched = new Set((await watchedCardIds(userId)).map((r) => r.cardId));
  if (!watched.size) return null;
  // The caller's own Entitlement when it has one; else this request's (auth is imported late so the pure rules above stay importable by node tests, which have no React cache).
  const viewer = who ?? (await import("./auth")).currentEntitlement();
  const dealRank = await dealRanks(country, watched, await viewer);
  // buildNudge is pure: a first pass learns WHICH card it would name, one lookup fetches that name, a second pass writes it.
  let picked: number | null = null;
  const first = buildNudge(watched, new Set(), dealRank, new Map(), (id) => ((picked = id), null));
  if (!first || picked == null) return first;
  const name = (await getCardsByIds([picked])).get(picked)?.name ?? null;
  return buildNudge(watched, new Set(), dealRank, new Map(), () => name);
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
    if (free) parts.push("Premium shows every pick, in every market.");
    return { heading, line: parts.join(" "), kind: "rising" };
  }
  return null;
}
