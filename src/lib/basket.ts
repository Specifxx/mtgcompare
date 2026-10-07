// RiftCompare's lib/basket.ts, ported verbatim for OP Compare (2026-10-03);
// only the store source differs (lib/stores.ts and TCGplayer's US listing, via
// lib/basket-server.ts). Card ids are strings here, as there: an OP Card.id
// (TCGplayer productId) travels as its decimal string.
//
// Best-Basket optimiser: the cheapest way to actually BUY a list of cards across
// the stores we track — minimising the grand total INCLUDING each store's postage
// for the order it would actually receive. Buying every card from its
// individually cheapest store usually spreads the order over many stores and
// racks up postage; consolidating onto fewer stores (or pushing one store over
// its free-shipping threshold) often wins overall. That trade-off is exactly
// what this solves.
//
// ── Postage is measured, per order (2026-09-25) ──────────────────────────────
// Each store supplies a `postage` function — lib/shipping.ts's shippingFor,
// bound to the buyer's region and tracked-only choice by basketStoresFor() —
// that prices an order by its subtotal AND its card count, from what the
// store's own checkout quoted. It replaced one flat guess per store: an
// Adelaide customer was shown "+ $2.00 post" here for a store whose only rate
// is $20.00, and a guessed "free over $50" zeroed postage the store never
// waives. A cheap letter rate now applies only to orders no bigger than the
// ones it was measured on, and a store that does not post to the buyer
// (`unavailable`) is left out before anything is priced, and listed.
//
// Every cost the search below weighs goes through that function: a store's
// order costs its quote, plus the top-up to any minimum order the store posts
// nothing below, plus — past the biggest order it was measured on, where
// postage was still rising with card count — the quote's riskCents, so piling a
// deck onto such a store is not free. The totals the plan REPORTS are the quote
// and the top-up alone (the shown "from $12" is what was measured). Quotes are
// memoised per run: the search asks for the same (store, subtotal, cards) many
// times.
//
// ── Why an open-store search (rebuilt 2026-09-25) ────────────────────────────
// This used to be a greedy start plus a hill-climb that moved ONE card at a
// time. That can never empty a store holding two or more cards, and never opens
// a store whose postage is at least the postage it would save, so on the shapes
// real orders take it returned the greedy split unchanged:
//   • 4 cards, two $5-postage stores, each store cheapest for two of them:
//     $14.00 across two orders, when everything from one store is $9.40;
//   • a 12-card list over six small stores plus one store stocking all twelve
//     at +3%: six orders for $109.20 when one order was $104.80;
//   • 100 cards each 1c cheaper at its own store than at one hub store: $400
//     instead of $105.
// (Reproduced in the 2026-09-25 audit; pinned in tests/best-basket-redesign.)
//
// The problem is uncapacitated facility location with a threshold twist, so
// this uses that problem's standard local search. The state is the set of OPEN
// stores; each card goes to its cheapest open store (a card no open store
// stocks force-opens its own cheapest store). Moves are ADD a store, DROP a
// store and SWAP one open store for a closed one, taking the best improving move
// until none helps, from several starts: the naive split, and single stores
// ranked by how much of the list they stock. The old single-card move survives
// as the final polish, with two multi-card moves beside it: a threshold fill
// that moves several cards onto a store at once to reach its measured
// free-postage cart (together with the one-card move, what crosses free-postage
// thresholds), and a drain that empties a store by sending each of its cards
// wherever it adds least to the landed total. The drain came with the measured
// postage model: with postage that rises with card count, sending a dropped
// store's cards to their cheapest open store by PRICE (what DROP does) can push
// that store off its letter rate, and routing each card by what it adds —
// postage included — is the move that avoids it. With ten or fewer candidate
// stores every open set is also tried outright.
//
// How many single-store starts: EVERY candidate store for a deck-sized list,
// and a work budget's worth — never fewer than ten, best-covering first — for
// the biggest ones (see START_BUDGET). That is the one departure from "a start
// from each single store": at the 200-line cap it keeps a request near half a
// second instead of ~1.4 s, and on the benchmark it was measured on it cost
// nothing (the capped and uncapped searches returned the same totals).
//
// Exact minimisation is NP-hard, so the answer is the best this search finds,
// not a proof. What it guarantees: the plan is never dearer than the naive
// split, the best single-store order (exact) or the two-store order returned
// beside it (the best split the search finds — also not a proof). Against
// brute force on 3,000 random lists of up to 6 cards and 5 stores it found the
// optimum every time; on threshold-heavy lists over more than ten stores it
// can still miss it (review, 2026-09-25). Pure CPU and deterministic. On the
// measured postage (synthetic lists over the real snapshot's stores, region
// unknown, 2026-09-25): 10–300 ms for a deck-sized list, 0.5–0.8 s at the
// 200-line cap across a market's 43–54 stores — which needs basketStoresFor's
// remembered quotes (lib/shipping.ts): without them a quote costs up to
// ~45 µs and the same 200-card list took over 6 s.

import { affiliateUrl } from "./affiliate";
import { planPostageNotes } from "./postage-display";
import type { PostageCart, PostageQuote } from "./shipping";
import { playedCopyCount } from "./basket-condition";

export interface BasketListing {
  retailer: string; // store key (lib/stores.ts), or "tcgplayer" in the US
  // Not used here — store names come from `stores` (lib/shipping.ts
  // basketStoresFor). Optional so a caller can leave it out (egress).
  retailerName?: string;
  priceCents: number; // cheapest in-stock unit price at this store
  url: string;
  // The store's own condition label for that listing ("Near Mint", "LP"…),
  // shown on every plan line so a cheap played copy is never passed off as NM.
  condition?: string | null;
}

export interface BasketCard {
  cardId: string;
  name: string;
  slug: string | null;
  qty: number;
  listings: BasketListing[]; // one (cheapest) listing per store that stocks it
  // The printing, when known, so a plan line can say which one it is: OP's set
  // code ("OP01") and card number ("OP01-024").
  setCode?: string;
  collectorNumber?: string;
}

export interface BasketStore {
  name: string;
  /** What this store charges to post an order of this size (lib/shipping.ts shippingFor). */
  postage: (cart: PostageCart) => PostageQuote;
  /** Set when the store does not post to this buyer at all: its listings are left out. */
  unavailable?: string;
}

export type BasketStores = Record<string, BasketStore>;

export interface BasketLine {
  cardId: string;
  name: string;
  slug: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  qty: number;
  unitCents: number;
  url: string;
  condition: string | null;
}

export interface BasketStoreGroup {
  key: string;
  name: string;
  lines: BasketLine[];
  subtotalCents: number;
  items: number; // physical cards in this store's order
  shippingCents: number;
  freeShipping: boolean;
  // The rate behind shippingCents — the store's own name, tracked or not,
  // measured or estimate, a free-postage cart within reach — so the page can
  // say what it is (lib/postage-display.ts).
  postage: PostageQuote;
  topUpCents: number; // spend needed to reach a minimum order the store posts nothing below (normally 0)
}

export interface BasketPlan {
  stores: BasketStoreGroup[]; // dearest subtotal first
  itemsCents: number;
  shippingCents: number;
  topUpCents: number;
  totalCents: number; // items + shipping + top-up
  storeCount: number;
  // Buying each card from its individually-cheapest store (no consolidation),
  // priced with the same postage model.
  naiveTotalCents: number;
  naiveStoreCount: number;
  savedCents: number; // naiveTotal − total (≥ 0)
  unbuyable: { name: string; qty: number }[]; // no in-stock listing at a store that posts here
  excludedStores: { key: string; name: string; reason: string }[]; // stocked a card but does not post here
  matchedCards: number; // distinct cards with at least one store listing
  coveredCopies: number; // copies this plan buys (qty summed)
}

export interface BasketAlternatives {
  // The cheapest order from ONE store that stocks every buyable card; null
  // when no single store does.
  singleStore: BasketPlan | null;
  // The cheapest order split across exactly TWO stores (both used) that the
  // search finds — a heuristic, not a proof, when free-postage thresholds are
  // in play — shown only when it beats singleStore. Null in three different
  // situations, which the page words differently — see twoStoresNone.
  twoStores: BasketPlan | null;
  // Why twoStores is null (null when it isn't, or when alternatives weren't
  // asked for):
  //   "no-pair"           no two stores between them stock every card;
  //   "one-card"          the list is a single card, so there is nothing to split;
  //   "one-store-cheaper" pairs do stock it all, but the best one-store order
  //                       costs no more than the best split found — so
  //                       singleStore (never null here) is the answer.
  // Telling these apart matters: "no two stores stock every card" was once
  // shown for a one-card list stocked everywhere (review, 2026-09-25).
  twoStoresNone: TwoStoresNone | null;
}

export type TwoStoresNone = "no-pair" | "one-card" | "one-store-cheaper";

export interface BasketResult {
  plan: BasketPlan;
  alternatives: BasketAlternatives;
}

export interface BasketOptions {
  // The page the store links are rendered on, for the affiliate sub-id
  // (affiliateUrl's `loc`). Without it every basket click reported "home".
  loc?: string;
}

// The aggregate a non-Premium caller is allowed to see: their own real numbers,
// with no store names, lines or links. Built server-side so the withheld parts
// never reach the response (the Deal Finder top-3 principle).
export interface BasketPreview {
  totalCents: number; // items + postage + top-up
  shippingCents: number;
  topUpCents: number; // spend added to reach a store's minimum order — in totalCents, so "cards" is total − postage − this
  storeCount: number;
  naiveTotalCents: number;
  savedCents: number;
  covered: number; // copies the plan buys
  requested: number; // copies asked for, incl. unbuyable and unmatched lines
  unmatched: { raw: string; qty: number }[];
  // Why the total is less certain than it looks — estimated postage, an order
  // bigger than any measured, a region not measured (planPostageNotes). Store
  // COUNTS and region names only: no note names a store.
  postageNotes: string[];
  // Copies in the plan that are below Lightly Played (lib/basket-condition.ts).
  // A count only, no store or line: the free total says "Includes N played
  // copies" so the cheapest price is never passed off as a Near Mint one.
  playedCopies: number;
}

// How the buyer's region was chosen, for the postage notes: `picked` — a
// MEASURED region; `unmeasured` — "Elsewhere" (a choice all the same, so the
// notes must not tell them to pick one).
export interface PreviewRegion {
  picked: boolean;
  unmeasured: boolean;
}

export function basketPreview(
  plan: BasketPlan,
  unmatched: { raw: string; qty: number }[] = [],
  region: PreviewRegion = { picked: false, unmeasured: false }
): BasketPreview {
  const unbuyableCopies = plan.unbuyable.reduce((n, u) => n + u.qty, 0);
  const unmatchedCopies = unmatched.reduce((n, u) => n + u.qty, 0);
  return {
    totalCents: plan.totalCents,
    shippingCents: plan.shippingCents,
    topUpCents: plan.topUpCents,
    storeCount: plan.storeCount,
    naiveTotalCents: plan.naiveTotalCents,
    savedCents: plan.savedCents,
    covered: plan.coveredCopies,
    requested: plan.coveredCopies + unbuyableCopies + unmatchedCopies,
    unmatched: unmatched.map((u) => ({ raw: u.raw, qty: u.qty })),
    postageNotes: planPostageNotes(plan, region.picked, region.unmeasured),
    playedCopies: playedCopyCount(plan.stores.flatMap((s) => s.lines)),
  };
}

// ── The solver ────────────────────────────────────────────────────────────────

// Everything indexed: cards 0..n-1, candidate stores 0..m-1 (only stores that
// post to the buyer and stock at least one wanted card). unit[i*m+s] is card
// i's unit price at store s, Infinity where s doesn't stock it.
interface Model {
  n: number;
  m: number;
  qty: number[];
  unit: Float64Array;
  opts: number[][]; // per card: stores that stock it, cheapest first
  cardsAt: number[][]; // per store: cards it stocks
  // Store s's postage quote for an order of `sub` cents and `items` cards —
  // its own `postage` function, memoised for this run.
  quote: (s: number, sub: number, items: number) => PostageQuote;
  // What the search weighs for that order on top of its cards: the quote, the
  // top-up to a minimum order, and the risk allowance past the measured sizes.
  weigh: (s: number, sub: number, items: number) => number;
  // Scratch space for changeDelta, reused so a move costs no allocation.
  subD: Float64Array;
  cntD: Int32Array;
  pcsD: Int32Array;
  shipN: Float64Array; // a touched store's postage after the move
  mark: Uint8Array;
  touched: number[];
}

// A full assignment and its bookkeeping. cost = items + Σ ship.
interface State {
  assign: Int32Array;
  sub: Float64Array; // per-store subtotal
  cnt: Int32Array; // per-store number of list lines assigned (> 0: the store is open)
  pcs: Int32Array; // per-store physical cards (qty summed) — what postage is priced on
  ship: Float64Array; // per-store weighed postage for its order as it stands (0 when closed)
  items: number;
  cost: number;
}

// The spend a minimum order adds on top of the cards (0 once the order clears it).
function topUp(q: PostageQuote, sub: number): number {
  return q.minOrderCents && sub < q.minOrderCents ? q.minOrderCents - sub : 0;
}

function postage(M: Model, s: number, sub: number, cnt: number, pcs: number): number {
  return cnt > 0 ? M.weigh(s, sub, pcs) : 0;
}

function stateFrom(M: Model, assign: Int32Array): State {
  const sub = new Float64Array(M.m);
  const cnt = new Int32Array(M.m);
  const pcs = new Int32Array(M.m);
  const ship = new Float64Array(M.m);
  let items = 0;
  for (let i = 0; i < M.n; i++) {
    const s = assign[i];
    const line = M.unit[i * M.m + s] * M.qty[i];
    items += line;
    sub[s] += line;
    cnt[s]++;
    pcs[s] += M.qty[i];
  }
  let cost = items;
  for (let s = 0; s < M.m; s++) {
    ship[s] = postage(M, s, sub[s], cnt[s], pcs[s]);
    cost += ship[s];
  }
  return { assign, sub, cnt, pcs, ship, items, cost };
}

function cloneState(st: State): State {
  return {
    assign: st.assign.slice(),
    sub: st.sub.slice(),
    cnt: st.cnt.slice(),
    pcs: st.pcs.slice(),
    ship: st.ship.slice(),
    items: st.items,
    cost: st.cost,
  };
}

// Every card to its cheapest store in `open`; a card no open store stocks
// force-opens its own cheapest store, which then competes for every card.
function assignToOpen(M: Model, open: Uint8Array): Int32Array {
  const isOpen = open.slice();
  for (let i = 0; i < M.n; i++) {
    if (!M.opts[i].some((s) => isOpen[s])) isOpen[M.opts[i][0]] = 1;
  }
  const assign = new Int32Array(M.n);
  for (let i = 0; i < M.n; i++) {
    const o = M.opts[i];
    let pick = o[0];
    for (const s of o) {
      if (isOpen[s]) {
        pick = s;
        break;
      }
    }
    assign[i] = pick;
  }
  return assign;
}

// The cost delta of a list of card moves, flattened as [card, store, card,
// store, …]; with `commit` the state is updated too.
function changeDelta(M: Model, st: State, changes: number[], commit: boolean): number {
  const { subD, cntD, pcsD, shipN, mark, touched } = M;
  touched.length = 0;
  let itemsD = 0;
  for (let k = 0; k < changes.length; k += 2) {
    const i = changes[k];
    const to = changes[k + 1];
    const from = st.assign[i];
    if (from === to) continue;
    const before = M.unit[i * M.m + from] * M.qty[i];
    const after = M.unit[i * M.m + to] * M.qty[i];
    itemsD += after - before;
    if (!mark[from]) {
      mark[from] = 1;
      touched.push(from);
    }
    if (!mark[to]) {
      mark[to] = 1;
      touched.push(to);
    }
    subD[from] -= before;
    subD[to] += after;
    cntD[from]--;
    cntD[to]++;
    pcsD[from] -= M.qty[i];
    pcsD[to] += M.qty[i];
  }
  let shipD = 0;
  for (const s of touched) {
    shipN[s] = postage(M, s, st.sub[s] + subD[s], st.cnt[s] + cntD[s], st.pcs[s] + pcsD[s]);
    shipD += shipN[s] - st.ship[s];
  }
  const delta = itemsD + shipD;
  if (commit) {
    for (let k = 0; k < changes.length; k += 2) st.assign[changes[k]] = changes[k + 1];
    for (const s of touched) {
      st.sub[s] += subD[s];
      st.cnt[s] += cntD[s];
      st.pcs[s] += pcsD[s];
      st.ship[s] = shipN[s];
    }
    st.items += itemsD;
    st.cost += delta;
  }
  for (const s of touched) {
    subD[s] = 0;
    cntD[s] = 0;
    pcsD[s] = 0;
    mark[s] = 0;
  }
  return delta;
}

// The same for one card, without the bookkeeping (the polish runs this a lot).
function singleDelta(M: Model, st: State, i: number, to: number): number {
  const from = st.assign[i];
  const q = M.qty[i];
  const before = M.unit[i * M.m + from] * q;
  const after = M.unit[i * M.m + to] * q;
  return (
    after -
    before +
    postage(M, from, st.sub[from] - before, st.cnt[from] - 1, st.pcs[from] - q) -
    st.ship[from] +
    postage(M, to, st.sub[to] + after, st.cnt[to] + 1, st.pcs[to] + q) -
    st.ship[to]
  );
}

// ADD / DROP / SWAP, best improvement first, until nothing lowers the total.
//
// What each move does to the cards: DROP r sends r's cards to their cheapest
// store still open (or, when none stocks one, force-opens that card's own
// cheapest store); ADD a pulls every card that is cheaper at a than where it
// sits; SWAP r→a is both at once. Each iteration precomputes, per card, its
// best open store other than the one it is in, and per closed store the cards
// it would pull, so a move costs only the cards it actually touches.
function localSearch(M: Model, st: State, visited: Map<string, number>, run: number): boolean {
  const second = new Int32Array(M.n);
  const reach = new Uint8Array(M.m);
  const before = (i: number, x: number, y: number) => {
    // Does store x beat store y for card i? Price, then index (opts order).
    const ux = M.unit[i * M.m + x];
    const uy = M.unit[i * M.m + y];
    return ux < uy || (ux === uy && x < y);
  };
  for (let iter = 0; iter < 400; iter++) {
    // Another start already walked through this exact assignment, and the walk
    // from here is deterministic — it ends where that one did. (Meeting our
    // own trail just means this walk has converged.)
    const key = st.assign.join(",");
    const seenBy = visited.get(key);
    if (seenBy !== undefined && seenBy !== run) return false;
    visited.set(key, run);
    const open: number[] = [];
    const closed: number[] = [];
    for (let s = 0; s < M.m; s++) (st.cnt[s] > 0 ? open : closed).push(s);
    const assignedTo: number[][] = Array.from({ length: M.m }, () => []);
    for (let i = 0; i < M.n; i++) {
      assignedTo[st.assign[i]].push(i);
      let t = -1;
      for (const s of M.opts[i]) {
        if (s !== st.assign[i] && st.cnt[s] > 0) {
          t = s;
          break;
        }
      }
      second[i] = t;
    }
    const gainers: number[][] = Array.from({ length: M.m }, () => []);
    for (const a of closed) {
      for (const i of M.cardsAt[a]) if (before(i, a, st.assign[i])) gainers[a].push(i);
    }

    let bestD = 0;
    let best: number[] | null = null;
    const consider = (r: number, a: number) => {
      const ch: number[] = [];
      if (r >= 0) {
        for (const i of assignedTo[r]) {
          const t2 = second[i];
          let target: number;
          if (a >= 0 && M.unit[i * M.m + a] !== Infinity && (t2 < 0 || before(i, a, t2))) target = a;
          else target = t2 >= 0 ? t2 : M.opts[i][0];
          if (target !== r) ch.push(i, target);
        }
      }
      if (a >= 0) for (const i of gainers[a]) if (st.assign[i] !== r) ch.push(i, a);
      if (!ch.length) return;
      const d = changeDelta(M, st, ch, false);
      if (d < bestD - 1e-9) {
        bestD = d;
        best = ch;
      }
    };
    if (open.length > 1) for (const r of open) consider(r, -1);
    for (const a of closed) if (gainers[a].length) consider(-1, a);
    for (const r of open) {
      // A swap whose new store stocks none of r's cards is just a DROP plus an
      // independent ADD, and neither of those improved on its own — skip it.
      reach.fill(0);
      for (const i of assignedTo[r]) for (const s of M.opts[i]) reach[s] = 1;
      for (const a of closed) if (reach[a]) consider(r, a);
    }
    if (!best) return true;
    changeDelta(M, st, best, true);
  }
  return true;
}

// The old hill-climb, kept as the polish: move ONE card to any store that
// stocks it when that lowers the total. When no single move helps, the
// threshold fill below gets a turn, then the drain. `allowed` restricts the
// target stores; `keep` names two stores neither of which may be emptied (the
// two-store order has to stay a two-store order).
function polish(M: Model, st: State, allowed?: Uint8Array, keep?: readonly [number, number]): void {
  for (let iter = 0; iter < 400; iter++) {
    let bestD = 0;
    let bestI = -1;
    let bestS = -1;
    for (let i = 0; i < M.n; i++) {
      const from = st.assign[i];
      if (keep && (from === keep[0] || from === keep[1]) && st.cnt[from] === 1) continue;
      for (const s of M.opts[i]) {
        if (s === from || (allowed && !allowed[s])) continue;
        const d = singleDelta(M, st, i, s);
        if (d < bestD - 1e-9) {
          bestD = d;
          bestI = i;
          bestS = s;
        }
      }
    }
    if (bestI >= 0) {
      changeDelta(M, st, [bestI, bestS], true);
      continue;
    }
    const fill = fillMove(M, st, allowed, keep);
    if (fill) {
      changeDelta(M, st, fill, true);
      continue;
    }
    // A two-store order has nothing but its two stores, neither of which may
    // be emptied: there is nothing to drain onto.
    if (keep) return;
    const drain = drainMove(M, st, allowed);
    if (!drain) return;
    changeDelta(M, st, drain, true);
  }
}

// The threshold fill: a store short of its free-postage cart pulls in the
// cards that cost least extra for the subtotal they bring, until it crosses.
// That is a move of two or more cards at once, which the one-card polish can
// never make when no single card clears the threshold on its own (review,
// 2026-09-25: four stores, $78.75 returned where the same two stores sold the
// list for $77.54 by moving two cards together). The threshold is the store's
// own: the quote's freeFromCents, the nearest measured free-postage cart for an
// order this size (or, for an empty store, for one card). A store qualifies
// when it is open, or — inside a restricted search — when it is allowed at
// all, so an empty store in the set can be filled. Whether the move pays is
// then priced like any other, by the store's postage for the cards it would
// really post. Returns the best improving move as [card, store, card, store,
// …], or null. Still a heuristic: which cards to pull is a knapsack, and this
// takes them greedily by extra cost per cent of subtotal, then drops any the
// threshold no longer needs.
function fillMove(M: Model, st: State, allowed?: Uint8Array, keep?: readonly [number, number]): number[] | null {
  let bestD = -1e-9;
  let best: number[] | null = null;
  const taken = new Map<number, number>();
  for (let s = 0; s < M.m; s++) {
    if (allowed ? !allowed[s] : st.cnt[s] === 0) continue;
    const q = st.cnt[s] > 0 ? M.quote(s, st.sub[s], st.pcs[s]) : M.quote(s, 0, 1);
    if (q.cents === 0 || q.freeFromCents == null) continue;
    const need = q.freeFromCents - st.sub[s];
    if (need <= 0) continue;
    const cand: { i: number; extra: number; gain: number }[] = [];
    for (const i of M.cardsAt[s]) {
      const from = st.assign[i];
      if (from === s) continue;
      const gain = M.unit[i * M.m + s] * M.qty[i];
      if (!(gain > 0)) continue;
      cand.push({ i, extra: gain - M.unit[i * M.m + from] * M.qty[i], gain });
    }
    cand.sort((x, y) => x.extra / x.gain - y.extra / y.gain || x.i - y.i);
    taken.clear();
    const picks: { i: number; extra: number; gain: number }[] = [];
    let got = 0;
    for (const c of cand) {
      if (got >= need) break;
      const from = st.assign[c.i];
      if (keep && (from === keep[0] || from === keep[1]) && st.cnt[from] - (taken.get(from) ?? 0) <= 1) continue;
      taken.set(from, (taken.get(from) ?? 0) + 1);
      picks.push(c);
      got += c.gain;
    }
    if (got < need || picks.length < 2) continue; // one card alone is the polish's move
    // Drop picks the threshold no longer needs, dearest first.
    const keepPick = new Set(picks);
    for (const c of [...picks].sort((x, y) => y.extra - x.extra || y.i - x.i)) {
      if (got - c.gain >= need) {
        keepPick.delete(c);
        got -= c.gain;
      }
    }
    const ch: number[] = [];
    for (const c of keepPick) ch.push(c.i, s);
    const d = changeDelta(M, st, ch, false);
    if (d < bestD) {
      bestD = d;
      best = ch;
    }
  }
  return best;
}

// The drain (it came with the measured postage model, 2026-09-25): empty one
// open store, sending each of its cards — in list order — to whichever other
// store it adds least to, counting the change in THAT store's postage for the
// order it would then post. DROP in the local search sends a dropped store's
// cards to their cheapest open store by price, which is right while postage
// only falls as an order grows; with a letter rate that stops at a card count
// it can tip the receiving store onto its parcel rate, and this routes around
// that (or opens a store whose postage the move still pays for). Returns the
// best improving drain as [card, store, …], or null. `allowed` restricts where
// the cards may go.
function drainMove(M: Model, st: State, allowed?: Uint8Array): number[] | null {
  let bestD = -1e-9;
  let best: number[] | null = null;
  const sub = new Float64Array(M.m);
  const cnt = new Int32Array(M.m);
  const pcs = new Int32Array(M.m);
  const ship = new Float64Array(M.m);
  for (let x = 0; x < M.m; x++) {
    if (st.cnt[x] === 0) continue;
    sub.set(st.sub);
    cnt.set(st.cnt);
    pcs.set(st.pcs);
    ship.set(st.ship);
    const ch: number[] = [];
    let stuck = false;
    for (const i of M.cardsAt[x]) {
      if (st.assign[i] !== x) continue;
      let pick = -1;
      let pickD = Infinity;
      for (const s of M.opts[i]) {
        if (s === x || (allowed && !allowed[s])) continue;
        const line = M.unit[i * M.m + s] * M.qty[i];
        const d = line + postage(M, s, sub[s] + line, cnt[s] + 1, pcs[s] + M.qty[i]) - ship[s];
        if (d < pickD) {
          pickD = d;
          pick = s;
        }
      }
      if (pick < 0) {
        stuck = true; // a card no other store (in reach) stocks
        break;
      }
      sub[pick] += M.unit[i * M.m + pick] * M.qty[i];
      cnt[pick]++;
      pcs[pick] += M.qty[i];
      ship[pick] = postage(M, pick, sub[pick], cnt[pick], pcs[pick]);
      ch.push(i, pick);
    }
    if (stuck || !ch.length) continue;
    const d = changeDelta(M, st, ch, false);
    if (d < bestD) {
      bestD = d;
      best = ch;
    }
  }
  return best;
}

function storesUsed(st: State): number {
  let k = 0;
  for (let s = 0; s < st.cnt.length; s++) if (st.cnt[s] > 0) k++;
  return k;
}

// Lower total wins; on a tie, fewer orders.
function better(a: State, b: State | null): boolean {
  if (!b) return true;
  if (a.cost < b.cost - 1e-9) return true;
  if (a.cost > b.cost + 1e-9) return false;
  return storesUsed(a) < storesUsed(b);
}

// How many single-store starts to try, best-covering first: as many as fit in
// this budget of card × store cells, and never fewer than ten. 200,000 means
// every store for anything up to ~60 cards across the biggest market's 54
// stores (a deck, typically), and ~18 of them for a 200-card list. A store that
// stocks little of the list starts from nearly the naive split anyway, and the
// visited set below cuts those walks short. Measured on synthetic lists of 15-200
// cards over 24-55 stores (2026-09-25): the same totals as starting from every
// store, in under half the time at the 200-card end.
const START_BUDGET = 200_000;
const MIN_SINGLE_STARTS = 10;
export function singleStartCount(n: number, m: number): number {
  return Math.min(m, Math.max(MIN_SINGLE_STARTS, Math.floor(START_BUDGET / Math.max(1, n * m))));
}
// Up to this many candidate stores (1,023 open sets) the search also tries
// every open set outright. Most lists in the smaller markets land here.
const EXHAUSTIVE_MAX_STORES = 10;

function solve(M: Model, naive: State): State {
  let best: State | null = null;
  const visited = new Map<string, number>();
  let runs = 0;
  const run = (start: State) => {
    const id = runs++;
    const st = cloneState(start);
    for (let round = 0; round < 6; round++) {
      const before = st.cost;
      if (!localSearch(M, st, visited, id)) return;
      polish(M, st);
      if (st.cost >= before - 1e-9) break;
    }
    if (better(st, best)) best = st;
  };

  run(naive);

  // Single-store starts, ranked by coverage, then by what the covered cards
  // cost there, then by key order (deterministic).
  const ranked = [...Array(M.m).keys()]
    .map((s) => {
      let items = 0;
      for (const i of M.cardsAt[s]) items += M.unit[i * M.m + s] * M.qty[i];
      return { s, cover: M.cardsAt[s].length, items };
    })
    .sort((x, y) => y.cover - x.cover || x.items - y.items || x.s - y.s)
    .slice(0, singleStartCount(M.n, M.m));
  for (const { s } of ranked) {
    const open = new Uint8Array(M.m);
    open[s] = 1;
    run(stateFrom(M, assignToOpen(M, open)));
  }

  // With only a handful of candidate stores, every open set can simply be
  // tried (each polished within itself, for the thresholds) — which catches
  // the threshold interactions a one-move-at-a-time walk can step around.
  if (M.m <= EXHAUSTIVE_MAX_STORES) {
    const allowed = new Uint8Array(M.m);
    for (let mask = 1; mask < 1 << M.m; mask++) {
      for (let s = 0; s < M.m; s++) allowed[s] = (mask >> s) & 1;
      const assign = new Int32Array(M.n);
      let covers = true;
      for (let i = 0; i < M.n && covers; i++) {
        let pick = -1;
        for (const s of M.opts[i]) {
          if (allowed[s]) {
            pick = s;
            break;
          }
        }
        if (pick < 0) covers = false;
        else assign[i] = pick;
      }
      if (!covers) continue;
      const st = stateFrom(M, assign);
      polish(M, st, allowed);
      if (better(st, best)) best = st;
    }
  }
  return best ?? naive;
}

function bestSingleStore(M: Model): State | null {
  let best: State | null = null;
  for (let s = 0; s < M.m; s++) {
    if (M.cardsAt[s].length !== M.n) continue;
    const st = stateFrom(M, new Int32Array(M.n).fill(s));
    if (better(st, best)) best = st;
  }
  return best;
}

// The best two-store order the search finds, or why none is shown. Every
// covering pair is searched for its cheapest assignment that really USES both
// stores (the polish may not empty either one); a pair whose cheapest-store
// start lands on one store first moves onto the other the card it costs least
// to move. The best split is then shown only when it beats the best
// single-store order — otherwise "one-store-cheaper", one rule for every pair.
// (Until 2026-09-25 a pair whose polish collapsed onto one store was dropped
// outright, taking its real splits with it, so the card could show a split
// $5.84 dearer than one it had thrown away.) Not exact: with free-postage
// thresholds each pair is a knapsack, and this is the polish's answer.
function bestTwoStores(M: Model, single: State | null): { best: State | null; none: TwoStoresNone | null } {
  let best: State | null = null;
  let anyPair = false;
  const allowed = new Uint8Array(M.m);
  for (let a = 0; a < M.m; a++) {
    for (let b = a + 1; b < M.m; b++) {
      const assign = new Int32Array(M.n);
      let covers = true;
      for (let i = 0; i < M.n; i++) {
        const ua = M.unit[i * M.m + a];
        const ub = M.unit[i * M.m + b];
        if (ua === Infinity && ub === Infinity) {
          covers = false;
          break;
        }
        assign[i] = ub < ua ? b : a;
      }
      if (!covers) continue;
      anyPair = true;
      if (M.n < 2) continue; // one card: nothing to split
      const st = stateFrom(M, assign);
      for (const y of [a, b]) {
        if (st.cnt[y] > 0) continue;
        let pick = -1;
        let pickD = Infinity;
        for (const i of M.cardsAt[y]) {
          const d = singleDelta(M, st, i, y);
          if (d < pickD) {
            pickD = d;
            pick = i;
          }
        }
        if (pick >= 0) changeDelta(M, st, [pick, y], true);
      }
      if (st.cnt[a] === 0 || st.cnt[b] === 0) continue;
      allowed.fill(0);
      allowed[a] = 1;
      allowed[b] = 1;
      polish(M, st, allowed, [a, b]);
      if (better(st, best)) best = st;
    }
  }
  if (!anyPair) return { best: null, none: "no-pair" };
  if (M.n < 2) return { best: null, none: "one-card" };
  if (best && (!single || best.cost < single.cost - 1e-9)) return { best, none: null };
  return { best: null, none: "one-store-cheaper" };
}

// The full answer: the cheapest plan found plus the one- and two-store orders.
export function planBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions = {}): BasketResult {
  return solveBasket(cards, stores, opts, true);
}

// Kept with its original signature (the portfolio's replacement cost calls it):
// the cheapest plan found, without the alternatives.
export function optimizeBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions = {}): BasketPlan {
  return solveBasket(cards, stores, opts, false).plan;
}

function solveBasket(cards: BasketCard[], stores: BasketStores, opts: BasketOptions, withAlternatives: boolean): BasketResult {
  // Stores that cannot deliver drop out before anything is priced, and are
  // listed with their reason; a listing at a store not in the map (another
  // market's) is ignored.
  const excluded = new Map<string, { key: string; name: string; reason: string }>();
  const usable = (key: string): boolean => {
    const st = stores[key];
    if (!st) return false;
    if (st.unavailable) {
      if (!excluded.has(key)) excluded.set(key, { key, name: st.name, reason: st.unavailable });
      return false;
    }
    return true;
  };
  const withStores = cards.map((c) => ({ ...c, listings: c.listings.filter((l) => usable(l.retailer) && Number.isFinite(l.priceCents)) }));
  const unbuyable = withStores.filter((c) => !c.listings.length).map((c) => ({ name: c.name, qty: c.qty }));
  const buyable = withStores.filter((c) => c.listings.length > 0);

  // Candidate stores, in key order so every tie breaks the same way.
  const keys = [...new Set(buyable.flatMap((c) => c.listings.map((l) => l.retailer)))].sort();
  const idx = new Map(keys.map((k, i) => [k, i]));
  const n = buyable.length;
  const m = keys.length;
  const unit = new Float64Array(n * m).fill(Infinity);
  // Cheapest listing per (card, store), for the plan's link and condition.
  const listingAt: Map<number, BasketListing>[] = buyable.map(() => new Map());
  buyable.forEach((c, i) => {
    for (const l of c.listings) {
      const s = idx.get(l.retailer)!;
      if (l.priceCents < unit[i * m + s]) {
        unit[i * m + s] = l.priceCents;
        listingAt[i].set(s, l);
      }
    }
  });
  const optsPer: number[][] = buyable.map((_, i) => {
    const o: number[] = [];
    for (let s = 0; s < m; s++) if (unit[i * m + s] !== Infinity) o.push(s);
    return o.sort((x, y) => unit[i * m + x] - unit[i * m + y] || x - y);
  });
  const cardsAt: number[][] = keys.map(() => []);
  optsPer.forEach((o, i) => o.forEach((s) => cardsAt[s].push(i)));

  // Postage is a pure function of (store, subtotal, cards) that the search
  // asks for many times over — memoised for this run, by card count and then
  // subtotal (two small-integer keys look up faster than one packed double).
  const postageOf = keys.map((k) => stores[k].postage);
  const memo = keys.map(() => new Map<number, Map<number, { q: PostageQuote; w: number }>>());
  const look = (s: number, sub: number, items: number) => {
    let bySub = memo[s].get(items);
    if (!bySub) {
      bySub = new Map();
      memo[s].set(items, bySub);
    }
    let e = bySub.get(sub);
    if (!e) {
      const q = postageOf[s]({ subtotalCents: sub, items });
      e = { q, w: q.cents + topUp(q, sub) + (q.riskCents ?? 0) };
      bySub.set(sub, e);
    }
    return e;
  };
  const M: Model = {
    n,
    m,
    qty: buyable.map((c) => c.qty),
    unit,
    opts: optsPer,
    cardsAt,
    quote: (s, sub, items) => look(s, sub, items).q,
    weigh: (s, sub, items) => look(s, sub, items).w,
    subD: new Float64Array(m),
    cntD: new Int32Array(m),
    pcsD: new Int32Array(m),
    shipN: new Float64Array(m),
    mark: new Uint8Array(m),
    touched: [],
  };

  // What an assignment REPORTS: cards, the quoted postage and any top-up —
  // without the search's risk allowance.
  const reported = (st: State): number => {
    let t = st.items;
    for (let s = 0; s < m; s++) {
      if (st.cnt[s] === 0) continue;
      const q = M.quote(s, st.sub[s], st.pcs[s]);
      t += q.cents + topUp(q, st.sub[s]);
    }
    return t;
  };

  const naive = stateFrom(M, Int32Array.from(optsPer.map((o) => o[0])));
  const naiveTotal = reported(naive);
  const naiveStoreCount = storesUsed(naive);

  const build = (st: State): BasketPlan => {
    const groups = new Map<number, BasketStoreGroup>();
    buyable.forEach((c, i) => {
      const s = st.assign[i];
      const key = keys[s];
      const listing = listingAt[i].get(s)!;
      let g = groups.get(s);
      if (!g) {
        g = {
          key,
          name: stores[key]?.name ?? key,
          lines: [],
          subtotalCents: 0,
          items: 0,
          shippingCents: 0,
          freeShipping: false,
          postage: undefined as unknown as PostageQuote, // set below, once the order is complete
          topUpCents: 0,
        };
        groups.set(s, g);
      }
      const u = unit[i * m + s];
      // Affiliate-tag the outbound line (eBay EPN / TCGplayer Impact / per-store).
      g.lines.push({
        cardId: c.cardId,
        name: c.name,
        slug: c.slug,
        setCode: c.setCode ?? null,
        collectorNumber: c.collectorNumber ?? null,
        qty: c.qty,
        unitCents: u,
        url: affiliateUrl(listing.url, key, opts.loc),
        condition: listing.condition ?? null,
      });
      g.subtotalCents += u * c.qty;
      g.items += c.qty;
    });
    for (const [s, g] of groups) {
      const q = M.quote(s, g.subtotalCents, g.items);
      g.postage = q;
      g.shippingCents = q.cents;
      g.freeShipping = q.cents === 0;
      g.topUpCents = topUp(q, g.subtotalCents);
    }
    const storeGroups = [...groups.values()].sort((a, b) => b.subtotalCents - a.subtotalCents || a.key.localeCompare(b.key));
    const itemsCents = storeGroups.reduce((s, g) => s + g.subtotalCents, 0);
    const shippingCents = storeGroups.reduce((s, g) => s + g.shippingCents, 0);
    const topUpCents = storeGroups.reduce((s, g) => s + g.topUpCents, 0);
    const totalCents = itemsCents + shippingCents + topUpCents;
    return {
      stores: storeGroups,
      itemsCents,
      shippingCents,
      topUpCents,
      totalCents,
      storeCount: storeGroups.length,
      naiveTotalCents: naiveTotal,
      naiveStoreCount,
      savedCents: Math.max(0, naiveTotal - totalCents),
      unbuyable,
      excludedStores: [...excluded.values()],
      matchedCards: n,
      coveredCopies: buyable.reduce((s, c) => s + c.qty, 0),
    };
  };

  if (n === 0) {
    return { plan: build(naive), alternatives: { singleStore: null, twoStores: null, twoStoresNone: null } };
  }

  let best = solve(M, naive);
  // The single-store order is exact; the two-store order is the best split the
  // search finds. The headline plan is never dearer than either one shown
  // beside it — take the cheapest of them all. "Dearer" is what the search
  // weighs: the reported totals leave out the risk allowance past the measured
  // order sizes, so where that allowance differs, a plan can REPORT a few
  // cents more than a riskier alternative (or the naive split — savedCents
  // floors at 0).
  const single = bestSingleStore(M);
  const two = withAlternatives || M.m <= 60 ? bestTwoStores(M, single) : null;
  for (const alt of [single, two?.best ?? null]) if (alt && better(alt, best)) best = alt;

  return {
    plan: build(best),
    alternatives: withAlternatives
      ? {
          singleStore: single ? build(single) : null,
          twoStores: two?.best ? build(two.best) : null,
          twoStoresNone: two?.none ?? null,
        }
      : { singleStore: null, twoStores: null, twoStoresNone: null },
  };
}
