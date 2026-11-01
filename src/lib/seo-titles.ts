import { SET_BY_CODE } from "./sets";
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

/** How people name a region after "mtg" in a search ("mtg nz", "mtg uk", "mtg australia"). */
const SEARCH_PLACE: Partial<Record<string, string>> = { NZ: "NZ", UK: "UK", AU: "Australia", CA: "Canada", EU: "Europe", SG: "Singapore" };

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

/** The name with its set's name (or one of its aliases) replaced by the set code in capitals, or null when the name does not carry it. */
export function withSetCode(name: string, setCode?: string | null): string | null {
  const set = setCode ? SET_BY_CODE.get(setCode) : undefined;
  if (!set) return null;
  const code = set.code.toUpperCase();
  const fold = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const plain = fold(name);
  for (const src of [set.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ...(set.aliases ?? [])]) {
    const re = new RegExp(`\\b${src}\\b`, "i");
    const m = re.exec(plain);
    if (m) return `${plain.slice(0, m.index)}${code}${plain.slice(m.index + m[0].length)}`.replace(/^\s*[-:–—]\s*/, "").replace(/\s*([-:–—])\s*/, " $1 ").replace(/\s{2,}/g, " ").replace(/^(\w+) [-:–—] /, "$1 ").trim();
  }
  return null;
}

/**
 * shortName, but a name that ends in its product type keeps the type and is cut in the part before it: "Commander Legends: Battle
 * for Baldur's Gate Collector Booster Box" → "Commander Legends: Battle for… Collector Booster Box", never "…Baldur's Gate".
 */
export function keepTypeName(name: string, max: number, productType?: string): string {
  const n = shortName(name, max);
  if (!productType || !name.toLowerCase().endsWith(productType.toLowerCase()) || n.toLowerCase().endsWith(productType.toLowerCase())) return n;
  const head = name.slice(0, name.length - productType.length).replace(/[\s,:;–—-]+$/, "");
  const room = max - productType.length - 2 - (withMtg(name) === name ? 0 : 4); // "… " and "MTG "
  if (room < 8) return n;
  const cut = head.slice(0, room + 1);
  const at = cut.lastIndexOf(" ");
  const kept = (at > 8 ? cut.slice(0, at) : cut.slice(0, room)).replace(/[\s,:;–—&-]+$/, "");
  return `${kept}… ${productType}`;
}

type R = Pick<RegionInfo, "inName" | "adjective" | "market" | "currency">;
const fromText = (cents: number | null, market: string) => (cents != null ? money(cents, market) : null);

// ─── Region pages ──────────────────────────────────────────────────────────────

export const seoCopy = {
  /** /<region>: "MTG booster box prices in Australia: 60 stores compared". */
  // Outside the US the region's short name leads (Search Console 2026-11-01: "mtg nz" and "magic the gathering nz" reach
  // /nz at positions 36-57 under "MTG booster box prices in New Zealand").
  homeTitle: (r: R, stores: number) =>
    fitFirst(
      ...(SEARCH_PLACE[r.market]
        ? [`MTG ${SEARCH_PLACE[r.market]}: Magic booster box & sealed prices, ${stores} stores`, `MTG ${SEARCH_PLACE[r.market]}: Magic sealed prices at ${stores} stores`]
        : []),
      `MTG booster box prices in ${r.inName}: ${stores} stores compared`, `Magic sealed prices in ${r.inName}: ${stores} stores`, `Magic sealed prices in ${r.inName}`),
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

  // The stock pages (lib/stock.ts). Counts are the caller's, from the page's own data.
  backTitle: (r: R) => fitFirst(`MTG sealed back in stock in ${r.inName}`, `MTG back in stock: ${r.inName}`),
  backDescription: (r: R, n: number) =>
    fitDescription(
      n > 0
        ? `${plural(n, "Magic sealed product")} that ${r.adjective} stores had none of in one daily check and have in stock again in the next: booster boxes, bundles, Commander decks.`
        : `Magic sealed product that ${r.adjective} stores had none of in one daily check and have in stock again in the next, from MTG Compare's daily snapshots.`,
    ),
  movesTitle: (r: R) => fitFirst(`MTG booster box price moves this week in ${r.inName}`, `MTG price moves this week: ${r.inName}`),
  movesDescription: (r: R) =>
    fitDescription(
      `The week's biggest changes in the cheapest in-stock price of popular sets' booster boxes, bundles and Commander decks across ${r.adjective} stores, up and down, in ${r.currency}.`,
      `The week's biggest changes in the cheapest in-stock price of popular Magic sets' sealed product in ${r.inName}.`,
    ),
  oopTitle: (r: R) => fitFirst(`Older MTG sets still in stock in ${r.inName}`, `Older MTG sets in stock: ${r.inName}`),
  oopDescription: (r: R, sets: number, stores: number) =>
    fitDescription(
      `Booster boxes, bundles and Commander decks from ${plural(sets, "older Magic set")} that ${r.adjective} stores still have in stock today, by how many stores carry them.`,
      `Older Magic sets' booster boxes and Commander decks ${r.adjective} stores still stock today (${plural(stores, "store listing")}).`,
    ),

  guidesTitle: (r: R) => fitFirst(`MTG booster box price guides in ${r.inName}`, `MTG booster box price guides`),
  guidesDescription: (r: R) =>
    fitDescription(
      `Guides to MTG booster box, Collector Booster box, Bundle and Commander deck prices in ${r.inName}, with today’s prices from the stores we compare.`,
      `Guides to MTG booster box, Collector Booster box, Bundle and Commander deck prices in ${r.inName}, with today’s prices.`,
    ),

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
  productTitle: (o: { name: string; market: string; inName: string; cheapestCents: number | null; productType?: string; setCode?: string | null }) => {
    // Every title names its region and keeps the product's TYPE (2026-10-26 audit: long names were cut from the end, so a
    // Collector Booster Box and a Collector Booster Pack of the same set shared "MTG Commander Legends: … price", and the same
    // product had one title in all seven regions). The region falls back to its code ("AU", "UK") when the name is long.
    const code = o.market;
    const full = withMtg(o.name);
    const from = fromText(o.cheapestCents, o.market);
    const tail = ` price, ${code}`;
    // A Secret Lair drop: its own words in the middle of store noise ("Avatar … Secret Lair A Lot to Learn Rainbow Foil Edition"):
    // "Secret Lair <its words> Foil|Non-Foil", the edition kept as one word.
    if (o.productType === "Secret Lair Drop") {
      const finish = /\bnon[\s-]*foil\b|\bregular\b/i.test(o.name) ? " Non-Foil" : /\bfoil\b/i.test(o.name) ? " Foil" : "";
      // "<brand> Secret Lair <drop>": the drop's own words first, the brand after (cut first when long).
      const at = o.name.search(/\bsecret\s*lair\b/i);
      const pre = at > 0 ? o.name.slice(0, at).replace(/[\s,:;–—-]+$/, "") : "";
      const post = at > 0 ? o.name.slice(at) : o.name;
      const words = `${post} ${pre}`
        .replace(/[[\]()]/g, " ")
        .replace(/\b(?:secret\s*lair(?:\s*drop)?(?:\s*series)?|superdrop|drop|edition|traditional|rainbow|galaxy|etched|textured|non[\s-]*foil|foil|regular|english|mtg|magic(?::?\s*the\s*gathering)?)\b/gi, " ")
        .replace(/\s*[-:–—]\s*(?=[-:–—]|$)/g, " ")
        .replace(/^\s*[-:–—x×]\s*/i, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const room = SEO_TITLE_MAX - tail.length - "MTG Secret Lair ".length - finish.length;
      const lastTwo = words.split(" ").slice(-2).join(" ");
      for (let max = room; max > 10; max -= 3) {
        // Too long: the start AND the last two words ("Dungeons & Dragons®: Death … Beholder II"), so siblings stay apart.
        const own = words.length <= room ? words : `${shortName(words, max - lastTwo.length - 3)} … ${lastTwo}`;
        const t = `MTG Secret Lair ${own}${finish}${tail}`;
        if (t.length <= SEO_TITLE_MAX && own) return fitFirst(...(from ? [`${full} price in ${o.inName}: from ${from}`] : []), `${full} price in ${o.inName}`, `${full}${tail}`, t);
      }
    }
    // Before cutting words, shorten the SET name to its code: the words that tell a set's products apart (a Commander deck's name, a
    // Secret Lair's title) are usually after it, and cutting from the end loses them ("AFR Aura of Courage Commander Deck").
    const coded = withSetCode(o.name, o.setCode);
    const short = coded ? withMtg(coded) : null;
    if (short && `${short}${tail}`.length <= SEO_TITLE_MAX) return fitFirst(...(from ? [`${full} price in ${o.inName}: from ${from}`] : []), `${full} price in ${o.inName}`, `${full}${tail}`, `${short}${tail}`);
    // Still too long: "MTG <SET CODE> … <the name's last words>" (the words that tell a set's products apart come last: a Commander
    // deck's or a Secret Lair's own name), as many as fit.
    const set = o.setCode ? SET_BY_CODE.get(o.setCode) : undefined;
    {
      const lead = set ? `MTG ${set.code.toUpperCase()} … ` : "MTG … ";
      const words = (coded ?? o.name).split(/\s+/);
      let end = "";
      for (let i = words.length - 1; i >= 0; i--) {
        const next = `${words[i]} ${end}`.trim();
        if (`${lead}${next}${tail}`.length > SEO_TITLE_MAX) break;
        end = next;
      }
      end = end.replace(/^[-:–—,]\s*/, "");
      // Without a set code, the start names the product ("Secret Lair x Hatsune Miku"): keep the start AND the last words.
      if (!set) {
        const last = (coded ?? o.name).split(/\s+/).slice(-2).join(" ");
        const head = withMtg(shortName(o.name, SEO_TITLE_MAX - tail.length - last.length - 3));
        const both = `${head} … ${last}`;
        if (!head.endsWith(last) && `${both}${tail}`.length <= SEO_TITLE_MAX) return fitFirst(...(from ? [`${full} price in ${o.inName}: from ${from}`] : []), `${full} price in ${o.inName}`, `${full}${tail}`, `${both}${tail}`);
      } else if (end.split(" ").length >= 2) return fitFirst(...(from ? [`${full} price in ${o.inName}: from ${from}`] : []), `${full} price in ${o.inName}`, `${full}${tail}`, `${lead}${end}${tail}`);
    }
    let fitted = withMtg(keepTypeName(coded ?? o.name, SEO_TITLE_MAX - tail.length, o.productType));
    // shortName counts the "MTG " it will need from the full name; a name whose only "MTG" is cut away still gets one: shrink until it fits.
    for (let max = SEO_TITLE_MAX - tail.length - 4; `${fitted}${tail}`.length > SEO_TITLE_MAX && max > 12; max -= 4) fitted = withMtg(keepTypeName(coded ?? o.name, max, o.productType));
    return fitFirst(
      ...(from ? [`${full} price in ${o.inName}: from ${from}`, `${full} price in ${o.inName}`] : [`${full} price in ${o.inName}`]),
      `${full}${tail}`,
      `${fitted}${tail}`,
    );
  },
  /** The product description, cut to 160: the page's own sentence (product-copy.ts productDescription) with a short name when needed. */
  productDescription: (full: string, short: () => string) => fitDescription(full, short()),

  /** /<region>/stores/<store>: "Balance Martial Arts and Gaming: Magic sealed prices". */
  storeTitle: (storeName: string, page: number) => {
    const p = page > 1 ? ` (page ${page})` : "";
    return fitFirst(`${storeName}: Magic sealed prices & stock${p}`, `${storeName}: Magic sealed prices${p}`, `${storeName} Magic sealed${p}`, `${shortName(storeName, 40)} Magic sealed${p}`);
  },
};
