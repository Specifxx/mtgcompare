// The loader behind the Black Friday / Cyber Monday pages' one deal list (lib/sale-deals.ts). Candidates are the products the
// two old lists drew on: the deals under the median (dealsInMarket, capped) and the shortlist of products under their own 30-day
// price (the committed daily history, lib/real-drops.ts). Each candidate's offers are read once (public data files, at most
// MEDIAN_TAKE + SHORTLIST reads); its ONE row uses the cheapest offer a shopper can order now, and both discounts are measured
// against that price. Server only.
import { offerLink, offerRetailer, ebaySearchUrl, type Placement } from "@/lib/affiliate";
import { productPage } from "@/lib/data";
import { dealsInMarket, DEAL_MAX_RATIO, DEAL_MIN_RATIO, DEAL_MIN_STORES } from "@/lib/deals";
import { packsForLabel } from "@/lib/packs";
import { dailySeries, isoOfDay, readPriceHistory } from "@/lib/price-history";
import { rankDrops, realDrop, DROPS_WINDOW_DAYS, type PricedDay, type RealDrop } from "@/lib/real-drops";
import type { RegionInfo } from "@/lib/regions";
import { isPreorderSet } from "@/lib/release";
import type { SaleDealRow } from "@/lib/sale-deals";
import { headlineOffer } from "@/lib/sealed-offers";
import { shippingCell } from "@/lib/shipping";
import { money } from "@/lib/format";

const MEDIAN_TAKE = 48;
const SHORTLIST = 36;
const PLACEMENT: Placement = "bf-drops";

export async function saleDealRows(r: RegionInfo, today: string): Promise<SaleDealRow[]> {
  const market = r.market;
  const h = readPriceHistory();
  const days = new Map<string, PricedDay[]>();
  const series = (slug: string): PricedDay[] => {
    let d = days.get(slug);
    if (!d) {
      d = h ? dailySeries(h, market, slug, DROPS_WINDOW_DAYS + 2).map((x) => ({ day: isoOfDay(x.day), cents: x.cents })) : [];
      days.set(slug, d);
    }
    return d;
  };
  const pre: { slug: string; drop: RealDrop; name: string }[] = [];
  if (h) {
    for (const slug of Object.keys(h.series[market] ?? {})) {
      const d = series(slug);
      const drop = realDrop(d, d[d.length - 1]?.cents, today);
      if (drop) pre.push({ slug, drop, name: slug });
    }
  }
  const medianDeals = await dealsInMarket(market, { take: MEDIAN_TAKE }).catch(() => []);
  const slugs = [...new Set([...medianDeals.map((p) => p.slug), ...rankDrops(pre, SHORTLIST).map((p) => p.slug)])];
  const fmt = (c: number) => money(c, market);
  const out: SaleDealRow[] = [];
  for (const slug of slugs) {
    const page = await productPage(slug, market).catch(() => null);
    if (!page) continue;
    const offer = headlineOffer(page.offers);
    if (!offer) continue;
    const price = offer.priceCents;
    const stat = page.stats.find((s) => s.market === market);
    const med = stat?.medianOpenCents ?? null;
    const median =
      med && stat && stat.inStockStores >= DEAL_MIN_STORES && price <= med * DEAL_MAX_RATIO && price >= med * DEAL_MIN_RATIO
        ? { pct: Math.floor(((med - price) / med) * 100), cents: med }
        : null;
    const d = series(slug);
    const drop = realDrop(d, price, today);
    const typical = drop ? { pct: drop.pct, cents: drop.typicalCents, lowest: drop.lowest, sinceDay: drop.sinceDay } : null;
    if (!median && !typical) continue;
    const link = offerLink(offer.store, offer.url, r.region, PLACEMENT);
    const ship = offer.marketplace ? null : shippingCell(offer.store, market, price, fmt);
    out.push({
      slug,
      name: page.name,
      productType: page.productType,
      imageUrl: page.imageUrl,
      japanese: false, // MTG Compare lists English product only (sealed-title.ts refuses other languages)
      preorder: isPreorderSet(page.setCode),
      priceCents: price,
      storeName: offer.storeName,
      buyHref: link.href,
      buyRel: link.rel,
      retailer: offerRetailer(offer.store, offer.storeName, market),
      ebayHref: ebaySearchUrl(page.name, r.region, PLACEMENT),
      checkedAt: offer.lastSeen,
      shipMinCents: ship ? ship.min : null,
      shipText: ship ? ship.text : null,
      packs: packsForLabel(page.productType, page.setCode, page.name),
      median,
      typical,
      spark: d.filter((x) => x.day < today).slice(-DROPS_WINDOW_DAYS).map((x) => x.cents),
    });
  }
  return out;
}
