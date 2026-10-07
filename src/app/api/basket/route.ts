import { sameOrigin } from "@/lib/admin-guard";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { DECK_LINE_CAP, mergeLines, parseDeckList, resolveDeck } from "@/lib/deck";
import { deckIndex } from "@/lib/deck-price";
import { BASKET_COLLECTION_SOURCES, clampQty, parseBasketRequest, type BasketRequest } from "@/lib/basket-request";
import { rateLimit } from "@/lib/rate-limit";
import type { Country } from "@/lib/country";
import { basketPreview, optimizeBasket, planBasket, type BasketCard, type PreviewRegion } from "@/lib/basket";
import {
  basketCardName,
  cardInfoFor,
  loadBinderHoldings,
  loadOwnedQty,
  loadSetGapLines,
  loadStoreListings,
  saveMinConditionPref,
  type BasketCardInfo,
} from "@/lib/basket-server";
import type { MinCondition } from "@/lib/basket-condition";
import { basketStoresFor, postageContextFor, postageOptionsFrom, type PostageOptions } from "@/lib/shipping";
import { NOT_STOCKED_LIST_CAP, nothingPricedMessage, setGapFields, type SetGapAnswer } from "@/lib/set-gap";
import { COUNTRIES } from "@/lib/country";

export const dynamic = "force-dynamic";

// Best Basket: turn a list into the cheapest delivered order across this
// market's stores (RiftCompare's /api/basket, lib/basket.ts's open-store
// search).
//
// WHO GETS WHAT. Premium only since 2026-10-07 (owner): anyone else gets a 403
// with premium: "required". The tiered preview below is kept for the code path
// but no longer reachable. Historically the answer was tiered here:
//   • Premium (isPremium(user, "premium")): the full plan — every store, every
//     line with its condition and link — beside the best one-store and
//     two-store orders, plus the unmatched and name-matched lines.
//   • Everyone else signed in (free and Plus): their own real numbers only —
//     delivered total, postage, store count, the naive cheapest-per-card total
//     and the saving, cards covered out of requested, the played-copies count
//     and the lines we couldn't match. No store names, lines or URLs are in the
//     response at all (withheld, not hidden). Click-only in the UI, and
//     five totals a day.
//
// WHAT CAN BE SENT. { source: "deck" } with a pasted `text` and/or exact
// `lines` ({ cardId, qty }); { source: "watchlist", ids } — the card ids the
// shared watchlist store holds (lib/use-watchlist.ts), one copy each. The
// binder source is the account's collection at the quantities held; "set"
// (Finish this set, `set` = the set's slug, with scope, rarity, maxPriceCents
// and a paging cursor) is the cards the account is MISSING from one released
// set, one copy each, in chunks of SET_GAP_CHUNK (lib/set-gap.ts).
//
// SOURCES. The tracked stores' fresh in-stock listings in the market and, in
// the US, TCGplayer's own cheapest listing — never eBay (CLAUDE.md), and never
// a TCGplayer market price converted for another market (that is a reference,
// not a listing). Read through the cached data.ts loader (lib/basket-server.ts).
//
// POSTAGE. Each store's MEASURED checkout rate (lib/shipping.ts), for the
// buyer's region (?region=) and, with ?tracked=1, never an untracked letter;
// an unmeasured store (and TCGplayer) is on the market's dearest measured
// one-card tracked rate, flagged "est.".
//
// MINIMUM CONDITION is Premium's: applied inside loadStoreListings and echoed
// on the Premium response. Anyone else is priced at "any" and told how many
// played copies the total includes.
//
// RATE LIMITS. Premium: 30 an hour. Without Premium: 5 TOTALS a day — a run
// that comes back without one hands its slot back — and 20 tries an hour,
// never refunded. In-memory per instance (lib/rate-limit.ts), so soft.

const HOUR = 3_600_000;

interface Outcome {
  res: NextResponse;
  priced: boolean;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // PREMIUM ONLY (owner, 2026-10-07): no free or Plus totals any more.
  if (!isPremium(user, "premium")) {
    return NextResponse.json({ error: "Best Basket is part of OP Compare Premium.", premium: "required" }, { status: 403 });
  }
  const full = true;
  const rl = rateLimit(`basket-premium:${user.id}`, 30, HOUR);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "That's a lot of baskets in an hour — give it a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const country = getCountry();
  const params = new URL(req.url).searchParams;
  const postageOpts = postageOptionsFrom(country, params.get("region"), params.get("tracked"));
  const request = parseBasketRequest(await req.json().catch(() => null));
  const out = await buildBasket(user.id, full, request, full ? request.minCondition : "any", country, postageOpts);
  if (full && request.saveMinCondition && out.res.status === 200) void saveMinConditionPref(user.id, request.minCondition);
  return out.res;
}

const fail = (error: string, status: number): Outcome => ({ res: NextResponse.json({ error }, { status }), priced: false });

async function buildBasket(
  userId: string,
  full: boolean,
  { source, skipOwned, text, picked, ids, setSlug, scope, rarity, maxPriceCents, after }: BasketRequest,
  minCondition: MinCondition,
  country: Country,
  postageOpts: PostageOptions,
): Promise<Outcome> {
  try {
    // 1. What was asked for → cardId → qty (+ what we know about each card).
    const wanted = new Map<string, number>();
    const info = new Map<string, BasketCardInfo>();
    const unmatched: { raw: string; qty: number }[] = [];
    const fuzzy: { raw: string; matchedAs: string }[] = [];
    let skippedHoldings = 0;
    let skippedOwned = 0;
    // Finish this set: what the chunk was cut from, for the answer's `setGap`.
    let setGap: SetGapAnswer | null = null;
    const add = (cardId: string, qty: number) => wanted.set(cardId, clampQty((wanted.get(cardId) ?? 0) + qty));

    if ((source === "binder" || source === "set") && !BASKET_COLLECTION_SOURCES) {
      return fail(source === "binder" ? "Pricing your binder arrives with the portfolio." : "Finish a set arrives with the set checklist.", 400);
    }

    if (source === "watchlist") {
      if (!ids.length) return fail("Your watchlist has no cards yet.", 400);
      for (const id of ids) add(id, 1);
    } else if (source === "set") {
      // Ranked and ceilinged on what THIS plan buys: the stores that post to this
      // buyer, at this floor (lib/set-gap.ts), not the checklist's any-condition price.
      const buyStores = Object.entries(basketStoresFor(country, postageOpts))
        .filter(([, st]) => !st.unavailable)
        .map(([key]) => key);
      const gap = await loadSetGapLines(userId, setSlug, scope, country, { rarity, maxPriceCents, after }, { stores: buyStores, minCondition });
      if (!gap.ok) return fail(gap.message, 400);
      const { plan, setName } = gap;
      const s = plan.summary;
      if (!s.gapTotal) return fail(`You already own every ${s.rarity ? `${s.rarity} ` : ""}card in this list for ${setName}.`, 400);
      if (!plan.chunk.length) {
        // Nothing to price: every missing card is unstocked, unpriceable, or over the ceiling.
        return fail(
          s.candidates === 0 && s.stocked > 0
            ? `Every missing card with a store listing is dearer than your per-card price limit (${s.overCeiling} ${s.overCeiling === 1 ? "card" : "cards"}).`
            : nothingPricedMessage(s, COUNTRIES[country].place),
          400,
        );
      }
      // The gap already excludes what is owned, so step 2 below is not run for a set.
      for (const c of plan.chunk) {
        const id = String(c.id);
        wanted.set(id, 1);
        info.set(id, { name: basketCardName(c), slug: c.slug, setCode: c.setCode, collectorNumber: c.number ?? "" });
      }
      skippedOwned = s.ownedInScope;
      setGap = {
        summary: s,
        setName,
        notStocked: plan.notStocked.slice(0, NOT_STOCKED_LIST_CAP).map((c) => ({ name: basketCardName(c), setCode: c.setCode, number: c.number })),
      };
    } else if (source === "binder") {
      const binder = await loadBinderHoldings(userId, country);
      if (binder.empty) return fail("Nothing in your binder yet.", 400);
      for (const h of binder.wanted) {
        wanted.set(h.cardId, h.qty);
        info.set(h.cardId, h);
      }
      skippedHoldings = binder.skipped;
    } else {
      for (const l of picked) add(l.cardId, clampQty(l.qty));
      // The pasted lines fill what the picked cards leave of the line cap.
      const lines = parseDeckList(text).slice(0, Math.max(0, DECK_LINE_CAP - picked.length));
      if (lines.length) {
        const { cat, idx } = await deckIndex();
        for (const r of mergeLines(resolveDeck(lines, idx))) {
          if (!r.card) {
            unmatched.push({ raw: r.line.raw, qty: r.line.qty });
            continue;
          }
          const id = String(r.card.id);
          add(id, r.line.qty);
          info.set(id, { name: basketCardName(r.card), slug: r.card.slug, setCode: cat.setById.get(r.card.setId)?.code ?? "", collectorNumber: r.card.number ?? "" });
          // A line matched by name alone, or by a part of a name, is a guess the page shows.
          if (r.how === "name" && (r.ambiguous || r.fuzzy)) fuzzy.push({ raw: r.line.raw, matchedAs: basketCardName(r.card) });
        }
      }
      if (!wanted.size && !unmatched.length) return fail("Paste a list or add a card first.", 400);
    }

    // 2. "Skip copies I already own."
    if (skipOwned && source !== "set" && wanted.size) {
      const owned = await loadOwnedQty(userId, [...wanted.keys()]);
      for (const [id, qty] of [...wanted]) {
        const have = Math.min(owned.get(id) ?? 0, qty);
        if (have <= 0) continue;
        skippedOwned += have;
        if (have >= qty) wanted.delete(id);
        else wanted.set(id, qty - have);
      }
      if (!wanted.size && !unmatched.length) return fail("You already own every card on this list.", 400);
    }

    // 3. Names for cards that arrived as bare ids (picker, watchlist), from the
    // cached catalogue. An id that isn't a card (stale watch, bad client) is dropped.
    const missing = [...wanted.keys()].filter((id) => !info.has(id));
    if (missing.length) {
      const named = await cardInfoFor(missing);
      for (const id of missing) {
        const c = named.get(id);
        if (c) info.set(id, c);
        else wanted.delete(id);
      }
      if (!wanted.size && !unmatched.length) return fail(source === "watchlist" ? "Your watchlist has no cards yet." : "Paste a list or add a card first.", 400);
    }

    // 4. This market's stores, each with its measured postage for this buyer,
    // and their in-stock listings. The read throws rather than pricing a
    // failed read as "nothing in stock".
    const stores = basketStoresFor(country, postageOpts);
    const listings = await loadStoreListings([...wanted.keys()], country, Object.keys(stores), minCondition);
    const basketCards: BasketCard[] = [...wanted].map(([cardId, qty]) => {
      const c = info.get(cardId)!;
      return { cardId, name: c.name, slug: c.slug, setCode: c.setCode, collectorNumber: c.collectorNumber, qty, listings: listings.get(cardId) ?? [] };
    });

    // 5. The answer, tiered.
    const shipping = postageContextFor(country, postageOpts);
    const region: PreviewRegion = { picked: !!shipping.region && !shipping.regionUnmeasured, unmeasured: shipping.regionUnmeasured };
    if (!full) {
      const preview = basketPreview(optimizeBasket(basketCards, stores), unmatched, region);
      return {
        // Counts only for the set source: how many were priced, how many are not
        // included, how many are not stocked. No name, store, line or link.
        res: NextResponse.json({ ...preview, shipping, ...(setGap ? setGapFields(false, setGap) : {}) }, { headers: { "Cache-Control": "no-store" } }),
        priced: preview.covered > 0,
      };
    }
    const { plan, alternatives } = planBasket(basketCards, stores, { loc: "/tools/best-basket" });
    return {
      res: NextResponse.json(
        { ...basketPreview(plan, unmatched, region), plan, alternatives, fuzzy, skippedOwned, skippedHoldings, source, shipping, minCondition, ...(setGap ? setGapFields(true, setGap) : {}) },
        { headers: { "Cache-Control": "no-store" } },
      ),
      priced: plan.coveredCopies > 0,
    };
  } catch (e) {
    console.error("[basket] query failed", e);
    return fail("Store prices are unavailable right now, so we can't build a basket. Try again in a few minutes.", 503);
  }
}
