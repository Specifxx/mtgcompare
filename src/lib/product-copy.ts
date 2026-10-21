// The product page's generated words: its <title>, the release chip, the "Quick facts" list and the "Value check" sentence. Pure (no
// database, no React), so the tests run every builder against fixtures and BANNED_COPY.
//
// Every fact here is current state (ProductStat, the region's offers as the page loaded them), sets.ts, packs.ts or rrp.ts: "today",
// "right now", "checked N h ago". Never history ("dropped", "was …"), never eBay's data (that only ever arrives in the browser), and
// never TCGplayer's price passed off as a store's: TCGplayer is a marketplace, named as one wherever its price is quoted.
import { money, plural } from "./format";
import type { PerPackPick } from "./per-pack";
import { withPokemon } from "./seo";
import { SITE_NAME } from "./site";

/** The longest title that still gets the " | DexCompare" suffix (R8): over it, the title goes out as title.absolute. */
export const TITLE_MAX = 65;
const SUFFIX = ` | ${SITE_NAME}`;

/** A title for Next's metadata: a plain string (templated, " | DexCompare" added) or { absolute } when that would run past 65 characters. */
export type PageTitle = string | { absolute: string };

/** The rendered <title> a PageTitle gives (for tests and the length check). */
export function renderedTitle(t: PageTitle): string {
  return typeof t === "string" ? `${t}${SUFFIX}` : t.absolute;
}

/** `title` with the site's suffix when it fits in TITLE_MAX characters, else the bare title as title.absolute. */
export function fitTitle(title: string): PageTitle {
  return `${title}${SUFFIX}`.length <= TITLE_MAX ? title : { absolute: title };
}

/**
 * Where a product is open, as the title and description say it: "at 19 US stores", "at 19 US stores and on TCGplayer", "on TCGplayer".
 * "N stores" never counts a marketplace: in the US TCGplayer is one of the offers (ranked like a store) and is named beside the count.
 */
export function openWhere(open: readonly { marketplace: boolean }[], noun: string): string {
  const n = open.filter((o) => !o.marketplace).length;
  const tcg = open.some((o) => o.marketplace);
  if (!n) return "on TCGplayer";
  return `at ${plural(n, noun)}${tcg ? " and on TCGplayer" : ""}`;
}

/**
 * The product page's <title>. Open somewhere: "Pokémon Pitch Black Elite Trainer Box — from $54.99 at 19 US stores and on TCGplayer"
 * ("from" is the cheapest open offer, which may be TCGplayer's: the "and on TCGplayer" keeps it from reading as a store's price). Nothing
 * open: "Pokémon Pitch Black Elite Trainer Box — price & stock in the UK". Templated with " | DexCompare" when that fits in 65 characters.
 */
export function productTitle(o: { name: string; market: string; inName: string; cheapestCents: number | null; where: string | null }): PageTitle {
  const name = withPokemon(o.name);
  const t = o.cheapestCents != null && o.where ? `${name} — from ${money(o.cheapestCents, o.market)} ${o.where}` : `${name} — price & stock in ${o.inName}`;
  return fitTitle(t);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-17" → "17 Jul 2026" (UTC: a release date is a calendar date, not an instant). */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** The hero's release chip: "Released 17 Jul 2026", or "Pre-order · out 6 Nov 2026" for a set that is not out yet. */
export function releaseChip(releaseDate: string, preorder: boolean): string {
  return preorder ? `Pre-order · out ${shortDate(releaseDate)}` : `Released ${shortDate(releaseDate)}`;
}

// ─── Quick facts ───────────────────────────────────────────────────────────────

/** One line of the "Quick facts" list. `checked` is an offer's lastSeen (ISO): the page renders "checked <Ago>" after the text. */
export interface QuickFact {
  term: string;
  text: string;
  checked?: string;
  /** Short enough to share a row with another short fact. */
  short?: boolean;
  /** "Other regions": each region's page, with its from-price or "sold out" (the page renders them as links). */
  regions?: { region: string; name: string; flag: string; text: string }[];
}

export interface FactsInput {
  market: string;
  inName: string;
  /** "US", "Australian" (RegionInfo.adjective). */
  adjective: string;
  packs: number | null;
  /** The set's English release date (sets.ts), and whether it is still ahead. */
  release: { date: string; preorder: boolean } | null;
  /** The cheapest open offer, if any: its price, who sells it, whether that is a marketplace (TCGplayer), and when it was read. */
  cheapest: { cents: number; storeName: string; marketplace: boolean; lastSeen: string } | null;
  /** Open stores (never a marketplace), the stores listing it, and whether TCGplayer has it open (US). */
  openStores: number;
  storeCount: number;
  tcgOpen: boolean;
  /** US only: TPCi's list price for the product line (rrp.ts), explained by RRP_NOTE in "How these prices work". */
  msrp: number | null;
  /** Other regions' summaries (p.stats), in the order the page lists regions. */
  elsewhere: { region: string; name: string; flag: string; inName: string; market: string; lowestPriceCents: number | null; open: boolean }[];
}

/** "Quick facts": packs, the release date and (US) the MSRP; the cheapest offer and when it was checked; how many stores have it; the other regions. */
export function quickFacts(f: FactsInput): QuickFact[] {
  const out: QuickFact[] = [];
  if (f.packs != null) out.push({ term: "Booster packs", text: `${f.packs} in each`, short: true });
  if (f.release) out.push({ term: "English release", text: shortDate(f.release.date), short: true });
  if (f.msrp != null) out.push({ term: "US MSRP", text: money(f.msrp, f.market), short: true });
  if (f.cheapest) {
    const who = f.cheapest.marketplace ? `on ${f.cheapest.storeName}, a marketplace seller's listing` : `at ${f.cheapest.storeName}`;
    out.push({ term: "Cheapest right now", text: `${money(f.cheapest.cents, f.market)} ${who}, checked`, checked: f.cheapest.lastSeen });
  }
  const tcg = f.tcgOpen ? " and on TCGplayer" : "";
  let stock: string;
  if (f.openStores > 0) stock = `${f.release?.preorder ? "Open for pre-order" : "In stock"} at ${f.openStores} of ${plural(f.storeCount, `${f.adjective} store`)}${tcg}`;
  else if (f.tcgOpen) stock = `Only on TCGplayer: none of the ${plural(f.storeCount, `${f.adjective} store`)} that list it has it`;
  else if (f.storeCount > 0) stock = `Sold out at all ${plural(f.storeCount, `${f.adjective} store`)} that list it`;
  else stock = `No ${f.adjective} store we track lists it yet`;
  out.push({ term: "Stock today", text: stock });
  if (f.elsewhere.length) {
    const price = (e: FactsInput["elsewhere"][number]) => (e.open && e.lowestPriceCents != null ? `from ${money(e.lowestPriceCents, e.market)}` : "sold out");
    out.push({
      term: "Other regions",
      text: sentenceList(f.elsewhere.map((e) => `${price(e)} in ${e.inName}`)),
      regions: f.elsewhere.map((e) => ({ region: e.region, name: e.name, flag: e.flag, text: price(e) })),
    });
  }
  return out;
}

/** "a, b and c" */
function sentenceList(parts: string[]): string {
  if (parts.length < 2) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// ─── Value check ───────────────────────────────────────────────────────────────

// How a product type reads inside a sentence ("ETB A$9.80", "The booster box is cheaper per pack").
const SHORT_TYPE: Record<string, string> = {
  "Booster Box": "booster box",
  "Elite Trainer Box": "ETB",
  "Pokémon Center Elite Trainer Box": "Pokémon Center ETB",
  "Booster Bundle": "bundle",
  Blister: "blister",
  "Sleeved Booster": "sleeved booster",
  "Booster Pack": "booster pack",
  "Build & Battle Box": "Build & Battle Box",
};

export function shortType(label: string): string {
  return SHORT_TYPE[label] ?? label.toLowerCase();
}

/** The value check: one sentence, plus a link when another format is cheaper per pack. */
export interface ValueCheck {
  text: string;
  /** The product that is cheaper per pack ("…: A$6.10 a pack →"), linked by the page. */
  href?: string;
}

/**
 * The product's price per pack against the set's other formats in this region today, from cheapestPerPackByType over the same-set rows
 * the page already loaded (relatedWithFormats, plus this product): either it is the cheapest way to buy the set's packs ("At A$7.50 a pack
 * this is the cheapest way to buy Chaos Rising packs in Australia today (ETB A$9.80, bundle A$9.16 a pack)"), or another format is
 * ("The booster box is cheaper per pack today: A$6.10 a pack →"). Null when there is nothing to compare: the product is not open, has no
 * fixed pack count, or no other format of the set is open in the region.
 */
export function valueCheck(o: { slug: string; productType: string; perPack: number | null; setName: string | null; market: string; inName: string; region: string; picks: readonly PerPackPick[] }): ValueCheck | null {
  if (o.perPack == null || !o.setName) return null;
  // The set's other formats (a cheaper product of this one's own type is one too: its pick then is not this product).
  const others = o.picks.filter((k) => k.p.slug !== o.slug);
  if (!others.length) return null;
  const cheaper = others.reduce<PerPackPick | null>((m, k) => (k.perPack < o.perPack! && (!m || k.perPack < m.perPack) ? k : m), null);
  if (cheaper) {
    return {
      text: `The ${shortType(cheaper.p.productType)} is cheaper per pack today: ${money(cheaper.perPack, o.market)} a pack`,
      href: `/${o.region}/p/${cheaper.p.slug}`,
    };
  }
  const list = others.map((k) => `${shortType(k.p.productType)} ${money(k.perPack, o.market)}`);
  return {
    text: `At ${money(o.perPack, o.market)} a pack this is the cheapest way to buy ${o.setName} packs in ${o.inName} today (${sentenceList(list)} a pack)`,
  };
}

/** The meta description: where it is open and from what price, or that it is compared here. Facts only. */
export function productDescription(o: { name: string; market: string; adjective: string; cheapestCents: number | null; where: string | null; preorder: boolean; value: ValueCheck | null }): string {
  const name = withPokemon(o.name);
  const head =
    o.cheapestCents != null && o.where
      ? `${name}: ${o.preorder ? "open for pre-order" : "in stock"} ${o.where}, from ${money(o.cheapestCents, o.market)} today.`
      : `${name}: compare price and stock across ${o.adjective} stores.`;
  const value = o.value && !o.value.href ? ` ${o.value.text}.` : "";
  return `${head}${value} Every store's price and stock, checked about twice a day.`;
}
