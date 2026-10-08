import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PORTFOLIO_FREE, replacementWanted } from "@/lib/collection-server";
import { basketPreview, optimizeBasket, type BasketCard } from "@/lib/basket";
import { loadStoreListings } from "@/lib/basket-server";
import { basketStoresFor, postageContextFor, postageOptionsFrom } from "@/lib/shipping";

export const dynamic = "force-dynamic";

// What it would cost to BUY this collection again today, delivered.
//
// "Collection value" on /portfolio is the TCGplayer MARKET price of the finish held,
// converted to the viewer's currency and condition-adjusted. Postage is not in it, and the cheapest
// copy of a card is often one far-off store, so this answers the OTHER question
// (replacement cost) and leaves the headline alone.
//
// It reuses the Best Basket optimiser (lib/basket.ts): postage is charged per
// ORDER, not per card, so the collection goes to the same solver that
// minimises exactly that. The reads are lib/basket-server.ts's, the same as
// /api/basket's source=binder. Store listings only: eBay is left out because
// its postage is quoted per listing (CLAUDE.md).
//
// The total is free; the store-by-store plan is Premium. A non-Premium
// response carries only basketPreview()'s aggregate: no store names, lines or
// links, and the panel links to Best Basket (source=binder) for the plan.
//
// Behind a button and rate-limited per user: it reads every eligible listing
// for every card held, scoped as lib/db.ts requires (this user's card ids,
// REPLACEMENT_MAX_HOLDINGS cap, in stock, one market, an explicit select).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!isPremium(user) && !PORTFOLIO_FREE) return NextResponse.json({ error: "Premium required" }, { status: 403 });
  const rl = rateLimit(`replacement:${user.id}`, 12, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const full = isPremium(user, "premium");
  const country = getCountry();
  // The same postage model as Best Basket: each store's MEASURED checkout rate
  // for the buyer's region (?region=, remembered by the panel from the Best
  // Basket picker; absent = the highest regional figure), and ?tracked=1 to
  // skip untracked letters.
  const params = new URL(req.url).searchParams;
  const postageOpts = postageOptionsFrom(country, params.get("region"), params.get("tracked"));

  try {
    const { wanted, skipped, empty } = await replacementWanted(user.id, country);
    if (empty) return NextResponse.json({ error: "Nothing in your collection yet." }, { status: 400 });

    const stores = basketStoresFor(country, postageOpts);
    const listings = await loadStoreListings(
      wanted.map((w) => String(w.cardId)),
      country,
      Object.keys(stores),
    );
    const basketCards: BasketCard[] = wanted.map((w) => ({
      cardId: String(w.cardId),
      name: w.name,
      slug: w.slug,
      setCode: w.setCode,
      collectorNumber: w.collectorNumber,
      qty: w.qty,
      listings: listings.get(String(w.cardId)) ?? [],
    }));

    const plan = optimizeBasket(basketCards, stores, { loc: "/portfolio" });
    const shipping = postageContextFor(country, postageOpts);

    return NextResponse.json(
      {
        // Everyone: the aggregate, and its postage notes (store counts only).
        ...basketPreview(plan, [], { picked: !!shipping.region && !shipping.regionUnmeasured, unmeasured: shipping.regionUnmeasured }),
        // Premium only: the store-by-store plan behind the total.
        ...(full ? { plan } : {}),
        // What the SAME cards contribute to the headline "Collection value", so
        // the panel compares like with like.
        valuedCents: wanted.reduce((s, w) => s + w.valueCents, 0),
        pricedHoldings: wanted.length,
        skippedHoldings: skipped,
        shipping,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    console.error("[portfolio/replacement] query failed", e);
    return NextResponse.json({ error: "Store prices are unavailable right now. Try again in a few minutes." }, { status: 503 });
  }
}
