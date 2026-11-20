// The loader behind the Black Friday / Cyber Monday "furthest under their own price" list (lib/real-drops.ts holds the rules).
// Reads the committed daily price history once, shortlists by the history's own latest price, then reads each shortlisted
// product's offers (at most SHORTLIST product reads, from the public data files) and keeps it only when the cheapest offer a
// shopper can order RIGHT NOW still passes the rules. Server only.
import { productPage, type OfferView } from "@/lib/data";
import { dailySeries, isoOfDay, readPriceHistory } from "@/lib/price-history";
import { headlineOffer } from "@/lib/sealed-offers";
import { rankDrops, realDrop, DROPS_WINDOW_DAYS, type PricedDay, type RealDrop } from "@/lib/real-drops";
import type { Market } from "@/lib/regions";

const SHORTLIST = 24;

export interface DropRow {
  slug: string;
  name: string;
  productType: string;
  imageUrl: string | null;
  drop: RealDrop;
  offer: OfferView;
}

export async function realDropRows(market: Market, today: string, take = 10): Promise<DropRow[]> {
  const h = readPriceHistory();
  if (!h) return [];
  const pre: { slug: string; days: PricedDay[]; drop: RealDrop; name: string }[] = [];
  for (const slug of Object.keys(h.series[market] ?? {})) {
    const days = dailySeries(h, market, slug, DROPS_WINDOW_DAYS + 2).map((d) => ({ day: isoOfDay(d.day), cents: d.cents }));
    const drop = realDrop(days, days[days.length - 1]?.cents, today);
    if (drop) pre.push({ slug, days, drop, name: slug });
  }
  const out: DropRow[] = [];
  for (const c of rankDrops(pre, SHORTLIST)) {
    const page = await productPage(c.slug, market).catch(() => null);
    const offer = page ? headlineOffer(page.offers) : null;
    const drop = offer ? realDrop(c.days, offer.priceCents, today) : null;
    if (page && offer && drop) out.push({ slug: c.slug, name: page.name, productType: page.productType, imageUrl: page.imageUrl, drop, offer });
  }
  return rankDrops(out, take);
}
