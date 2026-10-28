// The product page's questions and answers (2026-10-25, the indexing round: a product page was mostly the site's template around one
// or two store rows). Each answer is built from data the page already has — the import's counts for this market and the others, the
// cheapest open offer, the pack count, the daily price snapshots — and a question with no data behind it is left out, never padded.
// Pure: tests/product-faq.test.ts, which also sweeps every answer with BANNED_COPY (lib/copy-rules.ts): no "dropped", no "was A$…".
import { money, plural } from "./format";
import { isoOfDay, MIN_DAYS, type DayValue } from "./price-history";
import { formatRelease } from "./release";

export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqInput {
  /** "Magic: The Gathering Edge of Eternities Play Booster Box" (the page's heading). */
  heading: string;
  market: string;
  inName: string;
  adjective: string;
  preorder: boolean;
  /** This market's counts, from the import's ProductStat row (null: none). listedStores never counts TCGplayer. */
  here: { inStockStores: number; listedStores: number; marketplaceOpen: boolean } | null;
  /** The cheapest open offer on the page, if any. */
  cheapest: { cents: number; storeName: string; marketplace: boolean } | null;
  packs: number | null;
  /** The daily series the chart draws (lib/price-history.ts dailySeries): oldest first. */
  history: readonly DayValue[];
  /** The other regions with a stats row for the product, in REGION_LIST order. */
  elsewhere: readonly { name: string; market: string; inStockStores: number; marketplaceOpen: boolean; lowestPriceCents: number | null }[];
}

/** The window the history answer covers (the chart may show up to 90 days). */
export const FAQ_HISTORY_DAYS = 30;

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export function productFaq(o: FaqInput): FaqItem[] {
  const out: FaqItem[] = [];
  const m = (c: number) => money(c, o.market);
  const store = (n: number) => plural(n, `${o.adjective} store`);

  // In stock here?
  if (o.here) {
    const { inStockStores: open, listedStores: listed } = o.here;
    const verb = o.preorder ? "open for pre-order" : "in stock";
    let a: string;
    if (open > 0) {
      a = `Yes: ${open} of the ${store(listed)} we track that list it ${open === 1 ? "has" : "have"} it ${verb} at our latest check`;
      a += o.cheapest ? `, the cheapest at ${m(o.cheapest.cents)} ${o.cheapest.marketplace ? "on" : "at"} ${o.cheapest.storeName}.` : ".";
    } else if (o.here.marketplaceOpen) {
      a = `Not at a store we track${listed ? `: the ${store(listed)} that list it are sold out` : ""}, but TCGplayer's marketplace has it${o.cheapest ? ` from ${m(o.cheapest.cents)}` : ""} at our latest check.`;
    } else {
      a = listed ? `Not at our latest check: all ${store(listed)} that list it are sold out. The price table keeps each store's last price.` : `No store we track has it right now.`;
    }
    out.push({ q: `Is ${o.heading} ${o.preorder ? "available to pre-order" : "in stock"} in ${o.inName}?`, a: `${a} Stores are read about twice a day.` });
  }

  // Per pack.
  if (o.packs && o.cheapest) {
    out.push({
      q: `How much is ${o.heading} per booster pack?`,
      a: `It holds ${plural(o.packs, "booster pack")}, so the cheapest ${o.preorder ? "pre-order" : "in-stock"} price in ${o.inName}, ${m(o.cheapest.cents)}, works out to ${m(Math.round(o.cheapest.cents / o.packs))} a pack before shipping.`,
    });
  }

  // The last 30 days of snapshots, once there are MIN_DAYS of prices in them.
  const recent = o.history.slice(-FAQ_HISTORY_DAYS);
  const priced = recent.filter((d): d is DayValue & { cents: number } => d.cents != null);
  if (priced.length >= MIN_DAYS) {
    const lo = priced.reduce((a, b) => (b.cents < a.cents ? b : a));
    const hi = priced.reduce((a, b) => (b.cents > a.cents ? b : a));
    const last = recent[recent.length - 1];
    const gaps = recent.length - priced.length;
    const parts = [
      lo.cents === hi.cents
        ? `In our daily snapshots over the last ${plural(recent.length, "day")}, the cheapest in-stock price in ${o.inName} was ${m(lo.cents)} every day it was in stock.`
        : `In our daily snapshots over the last ${plural(recent.length, "day")}, the cheapest in-stock price in ${o.inName} ranged from ${m(lo.cents)} (${formatRelease(isoOfDay(lo.day))}) to ${m(hi.cents)} (${formatRelease(isoOfDay(hi.day))}), with a median of ${m(median(priced.map((d) => d.cents)))}.`,
      last.cents != null ? `The latest snapshot is ${m(last.cents)}.` : `Nothing was in stock at the latest snapshot.`,
      gaps > 0 ? `On ${plural(gaps, "day")} no store had it in stock.` : null,
      "Snapshots record what stores asked on those days; they do not predict the next price.",
    ];
    out.push({ q: `What has ${o.heading} cost recently in ${o.inName}?`, a: parts.filter(Boolean).join(" ") });
  }

  // The other regions, each in its own currency (never converted: no exchange rate is claimed).
  const priced2 = o.elsewhere.filter((e) => (e.inStockStores > 0 || e.marketplaceOpen) && e.lowestPriceCents != null);
  const sold = o.elsewhere.filter((e) => !(e.inStockStores > 0 || e.marketplaceOpen));
  if (o.elsewhere.length) {
    const list = priced2.map((e) => `${e.name} ${money(e.lowestPriceCents!, e.market)}${e.inStockStores > 0 ? ` (in stock at ${plural(e.inStockStores, "store")})` : " (TCGplayer)"}`);
    const a = [
      list.length ? `The cheapest open price in each region's own currency at our latest check: ${list.join("; ")}.` : null,
      sold.length ? `Sold out at the stores we track in ${sold.map((e) => e.name).join(", ")}.` : null,
      "Stores usually ship within their own region, so compare in the region you live in.",
    ];
    out.push({ q: `How much is ${o.heading} in other regions?`, a: a.filter(Boolean).join(" ") });
  }
  return out;
}
