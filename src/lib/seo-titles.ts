// The <title>s and meta descriptions of the price pages, as search results show them. Every page's generateMetadata builds its
// words here, so one rule holds site-wide (tests/seo-titles.test.ts):
//   • A rendered title (with the layout's " | MTG Compare" when it fits) is at most 60 characters; a description at most 160.
//   • A title leads with the query people type ("MTG Play Booster Box prices in the US", "MTG Bloomburrow Collector Booster Box
//     price", "Where to buy Magic sealed product in Australia"), then the live extras (the from-price) while they fit.
//   • It is written as candidates, most specific first: the first that fits goes out (fitFirst). Long names and long region names
//     lose the extras, never the words people search.
//   • Every number is the caller's, from the data the page loaded: nothing here invents a price, a count or a date.
// Pure: no database and no React.
import { money, plural } from "./format";
import type { RegionInfo } from "./regions";
import { withMtg } from "./seo";
import { SITE_NAME } from "./site";

export const SEO_TITLE_SUFFIX = ` | ${SITE_NAME}`;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 160;

export type SeoTitle = string | { absolute: string };

/** The template's suffix when the whole fits in 60, else the words alone as title.absolute. */
export function seoTitle(text: string): SeoTitle {
  return text.length + SEO_TITLE_SUFFIX.length <= SEO_TITLE_MAX ? text : { absolute: text };
}

/** What a results page shows for a title. */
export function shownTitle(t: SeoTitle): string {
  return typeof t === "string" ? `${t}${SEO_TITLE_SUFFIX}` : t.absolute;
}

/** The words of a title, without the suffix (og:title, twitter:title). */
export function seoTitleText(t: SeoTitle): string {
  return typeof t === "string" ? t : t.absolute;
}

/** The first candidate that fits in 60 characters (the last one when none does), with the suffix when that still fits. */
export function fitFirst(...candidates: string[]): SeoTitle {
  return seoTitle(candidates.find((c) => c.length <= SEO_TITLE_MAX) ?? candidates[candidates.length - 1]);
}

/** The first description that fits in 160 characters, else the last candidate cut at a word. */
export function fitDescription(...candidates: string[]): string {
  const fit = candidates.find((c) => c.length <= SEO_DESCRIPTION_MAX);
  if (fit) return fit;
  const last = candidates[candidates.length - 1];
  const cut = last.slice(0, SEO_DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,:;–—-]+$/, "")}…`;
}

/**
 * A product name short enough for a title: store noise taken out ("Secret Lair Drop Secret Lair x …" → "Secret Lair x …", "English",
 * a trailing "Edition", a repeated "Magic: The Gathering" / "MTG"), then cut at a word to `max` characters with "MTG " in front.
 * It only ever removes words.
 */
export function shortName(name: string, max: number): string {
  if (withMtg(name).length <= max) return name;
  let n = name
    .replace(/\bSecret Lair Drop(?: Series)?\s+(?=Secret Lair\b)/i, "")
    .replace(/\s*\b(?:English|EN)\b/g, "")
    .replace(/\s*-?\s*\b(?:Magic:? The Gathering|MTG)\b\s*(?=$|-)/gi, "")
    .replace(/\s+Edition\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const room = max - (withMtg(n) === n ? 0 : 4);
  if (n.length <= room) return n;
  const cut = n.slice(0, room + 1);
  const at = cut.lastIndexOf(" ");
  n = (at > 20 ? cut.slice(0, at) : cut.slice(0, room)).replace(/[\s,:;–—&-]+$/, "");
  return n;
}

type R = Pick<RegionInfo, "inName" | "adjective" | "market" | "currency">;
const fromText = (cents: number | null, market: string) => (cents != null ? money(cents, market) : null);

// ─── Region pages ──────────────────────────────────────────────────────────────

export const seoCopy = {
  /** /<region>: "MTG booster box prices in Australia: 60 stores compared". */
  homeTitle: (r: R, stores: number) =>
    fitFirst(`MTG booster box prices in ${r.inName}: ${stores} stores compared`, `Magic sealed prices in ${r.inName}: ${stores} stores`, `Magic sealed prices in ${r.inName}`),
  homeDescription: (r: R, stores: number, inStock: number) =>
    fitDescription(
      `Compare Magic booster boxes, Collector Boosters, bundles and Commander decks across ${plural(stores, `${r.adjective} store`)}${r.market === "US" ? " and TCGplayer" : ""}: ${inStock.toLocaleString("en")} in stock today, in ${r.currency}.`,
      `Compare Magic booster boxes, bundles and Commander decks across ${plural(stores, `${r.adjective} store`)}: ${inStock.toLocaleString("en")} in stock today.`,
    ),

  dealsTitle: (r: R) => fitFirst(`MTG booster box & bundle deals in ${r.inName}`, `MTG sealed deals in ${r.inName}`),
  dealsDescription: (r: R, deals: number, bestPct: number | null) =>
    deals > 0
      ? fitDescription(
          `${plural(deals, "Magic sealed product")} priced at least 10% under the median of 3+ ${r.adjective} stores today${bestPct ? `, up to ${bestPct}% under` : ""}. Booster boxes, Collector boxes, bundles and more, in ${r.currency}.`,
          `${plural(deals, "Magic sealed product")} priced at least 10% under the median of 3+ ${r.adjective} stores today${bestPct ? `, up to ${bestPct}% under` : ""}. Booster boxes, bundles and more.`,
          `${plural(deals, "Magic sealed product")} priced at least 10% under the median of 3+ ${r.adjective} stores today.`,
        )
      : fitDescription(`The cheapest Magic booster packs per pack in ${r.inName} today, and any sealed product priced 10% under the median of 3+ ${r.adjective} stores.`),

  packsTitle: (r: R) => fitFirst(`Cheapest MTG booster packs in ${r.inName}: price per pack`, `Cheapest MTG booster packs in ${r.inName}`),
  packsDescription: (r: R, best: { name: string; perPack: number } | null) =>
    best
      ? fitDescription(
          `MTG booster boxes, bundles and packs in ${r.inName}, ranked by price per pack today. Cheapest right now: ${best.name} at ${money(best.perPack, r.market)} a pack.`,
          `MTG booster boxes, bundles and packs ranked by price per pack in ${r.inName} today. Cheapest: ${best.name}, ${money(best.perPack, r.market)} a pack.`,
          `MTG sealed ranked by price per pack in ${r.inName} today. Cheapest: ${shortName(best.name, 60)}, ${money(best.perPack, r.market)} a pack.`,
        )
      : `MTG booster boxes, bundles and packs in ${r.inName}, ranked by price per pack today.`,

  digestTitle: (r: R) => fitFirst(`This week in Magic sealed: ${r.inName}`),

  guidesTitle: (r: R) => fitFirst(`Magic sealed buying guides for ${r.inName}`, `Magic sealed buying guides`),
  guidesDescription: (r: R) =>
    fitDescription(`Plain-English guides to buying Magic sealed product in ${r.inName}: cost per pack, Play vs Collector Boosters, Commander decks, pre-orders, with today’s prices.`),

  storesTitle: (r: R, n: number) => fitFirst(`Where to buy Magic sealed product in ${r.inName}: ${n} stores`, `Where to buy Magic sealed in ${r.inName}: ${n} stores`, `Where to buy Magic sealed in ${r.inName}`),
  storesDescription: (r: R, n: number) =>
    fitDescription(
      `${n} ${r.adjective} stores that sell Magic: The Gathering sealed online, compared: who has the most in stock today, when we last read each, prices in ${r.currency}.`,
      `${n} ${r.adjective} stores that sell Magic: The Gathering sealed online, compared: who has the most in stock today and when we last read each.`,
    ),

  setsIndexTitle: (r: R) => fitFirst(`Every MTG set in order: release dates & prices in ${r.inName}`, `Every MTG set in order: release dates & prices`),
  releasesTitle: (r: R, year: number) => fitFirst(`MTG release dates ${year}: new sets & pre-orders in ${r.inName}`, `MTG release dates ${year}: upcoming sets & pre-orders`),

  // ─── Hubs ──────────────────────────────────────────────────────────────────

  /** /<region>/type/<type>: "MTG Play Booster Box prices in the US: from $98.95". */
  typeTitle: (t: { label: string }, r: R, open: number, fromCents: number | null) => {
    const base = `${withMtg(t.label)} prices in ${r.inName}`;
    const from = open > 0 ? fromText(fromCents, r.market) : null;
    return fitFirst(...(from ? [`${base}: from ${from}`] : []), base, `${t.label} prices in ${r.inName}`);
  },
  typeDescription: (t: { plural: string }, r: R, c: { open: number; total: number }, fromCents: number | null) => {
    const name = withMtg(t.plural);
    const where = `${r.adjective} stores${r.market === "US" ? " and TCGplayer" : ""}`;
    const now = c.open > 0 && fromCents != null ? `${c.open} in stock today from ${money(fromCents, r.market)}, cheapest first` : "none in stock today";
    return fitDescription(
      `${name} compared across ${where}: ${now}, with ${plural(c.total, "product")} listed in ${r.inName}. Prices in ${r.currency}.`,
      `${name} compared across ${where}: ${now}, with ${plural(c.total, "product")} listed in ${r.inName}.`,
      `${name} across ${where}: ${now}, ${plural(c.total, "product")} listed in ${r.inName}.`,
    );
  },

  /**
   * /<region>/sets/<set>. Upcoming: the pre-order wording and the date. Sold without a booster box: never "booster box". Otherwise
   * "MTG Bloomburrow booster box & sealed prices in the US", shortening as the set's name and the region's grow.
   */
  setTitle: (set: { name: string; releaseDate: string }, r: R, o: { preorder: boolean; withoutBox: boolean; date: string }) => {
    const name = withMtg(set.name);
    if (o.preorder) {
      return fitFirst(
        ...(o.withoutBox ? [] : [`${name} booster box pre-orders in ${r.inName}: out ${o.date}`]),
        `${name} pre-orders in ${r.inName}: out ${o.date}`,
        `${name} pre-orders in ${r.inName}`,
        `${set.name} pre-orders in ${r.inName}`,
        `${set.name} pre-orders`,
      );
    }
    if (o.withoutBox) return fitFirst(`${name} sealed prices in ${r.inName}`, `${set.name} sealed prices in ${r.inName}`, `${set.name} prices in ${r.inName}`, `${set.name} sealed prices`, `${set.name} prices`);
    return fitFirst(
      `${name} booster box & sealed prices in ${r.inName}`,
      `${name} booster box prices in ${r.inName}`,
      `${name} sealed prices in ${r.inName}`,
      `${set.name} sealed prices in ${r.inName}`,
      `${set.name} prices in ${r.inName}`,
      `${set.name} sealed prices`,
    );
  },

  // ─── Products ──────────────────────────────────────────────────────────────

  /** /<region>/p/<slug>: "MTG Bloomburrow Collector Booster Box price in the US: from $245". */
  productTitle: (o: { name: string; market: string; inName: string; cheapestCents: number | null }) => {
    const name = withMtg(shortName(o.name, SEO_TITLE_MAX - " price".length));
    const from = fromText(o.cheapestCents, o.market);
    return fitFirst(...(from ? [`${name} price in ${o.inName}: from ${from}`, `${name} price: from ${from}`] : []), `${name} price in ${o.inName}`, `${name} price`, name);
  },
  /** The product description, cut to 160: the page's own sentence (product-copy.ts productDescription) with a short name when needed. */
  productDescription: (full: string, short: () => string) => fitDescription(full, short()),

  /** /<region>/stores/<store>: "Balance Martial Arts and Gaming: Magic sealed prices". */
  storeTitle: (storeName: string, page: number) => {
    const p = page > 1 ? ` (page ${page})` : "";
    return fitFirst(`${storeName}: Magic sealed prices & stock${p}`, `${storeName}: Magic sealed prices${p}`, `${storeName} Magic sealed${p}`, `${shortName(storeName, 40)} Magic sealed${p}`);
  },
};
