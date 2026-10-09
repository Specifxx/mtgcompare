// Picking the eBay listings for ONE card name (or one sealed product) in ONE market: pure (no network, no database), pinned by tests/ebay-match.test.ts with real eBay-style titles.
//
// The unit of a search is a NAME: one call returns up to 200 listings of that card across every printing, finish and condition. Identity is the catalogue matcher (lib/match.ts
// matchCardTitle) run against the index of THIS name's printings: a title must contain the name, the set (a code or a name) and, where several printings of a set exist, the
// treatment words that tell them apart; a title that fits several printings is a miss (an ambiguous listing is skipped, never guessed). On top of it come eBay-only filters
// (junk and lot words, fakes and proxies, language, seller location, currency, condition) and the plausibility guards against the unit's TCGplayer MARKET price. The matcher is never
// loosened to raise the eBay match count; eBay-only rules live HERE, not in match.ts, each with a real title in the test.
//
// A listing belongs to a (product, finish) unit: the finish is the one the title states ("Foil", "Etched", a foil pattern); a title that states none is the non-foil copy when the printing
// has one, else the foil one. A listing is never ranked into a price row, an alert or a basket: this is display data (lib/data/ebay.ts).
import { currencyOf, isoCountry, type Country } from "./country";
import { fold, type Finish } from "./constants";
import { convertUsdCents, toUsdCents } from "./fx";
import { buildCardIndex, matchCardTitle, matchSealedTitle, plausibleSealedPrice, plausibleSinglePrice, type CardIndex, type MatchRow, type SealedRef } from "./match";

/** The Browse item_summary fields we read. */
export interface EbayItem {
  itemId?: string;
  legacyItemId?: string;
  title?: string;
  price?: { value?: string; currency?: string };
  buyingOptions?: string[];
  itemLocation?: { country?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
  itemWebUrl?: string;
  itemAffiliateWebUrl?: string;
  condition?: string;
  conditionId?: string;
  image?: { imageUrl?: string };
  itemEndDate?: string;
}

// ── Queries ──────────────────────────────────────────────────────────────────
// Browse ANDs every keyword, so `q` stays minimal: the card's front-face name. Never set, treatment or finish words: the matcher tells printings apart, not the query. A comma is OR.

/** The front face, without commas, parentheses or quotes. Over 100 characters is cut at a word. */
export function nameWords(name: string): string {
  const front = name.split(/\s+\/\/\s+/)[0] ?? name;
  const clean = front.replace(/\([^)]*\)/g, " ").replace(/[,"]/g, " ").replace(/\s+/g, " ").trim();
  return clean.length <= 100 ? clean : clean.slice(0, 100).replace(/\s+\S*$/, "");
}
/** The strict query (the name in Magic's single-card category) and the broad retry, sent when the strict one returns nothing: the name with the game's name, in every category. */
export function cardQuery(name: string): { strict: string; retry: string } {
  const w = nameWords(name);
  return { strict: w, retry: `MTG ${w}` };
}
/** "Murders at Karlov Manor Play Booster Box" -> "MTG Murders at Karlov Manor Play Booster Box". */
export function sealedQuery(name: string): string {
  const w = nameWords(name.replace(/^Secret Lair Drop:\s*/i, "Secret Lair "));
  return /\b(mtg|magic)\b/i.test(w) ? w : `MTG ${w}`;
}

/** Server-side price floor: `price:[12.34..],priceCurrency:GBP` (USD cents converted to the market currency). */
export function priceFilter(minUsdCents: number, currency: string): string {
  const minor = convertUsdCents(minUsdCents, currency);
  return `price:[${(Math.floor(minor) / 100).toFixed(2)}..],priceCurrency:${currency}`;
}
/** 5% under our own plausibility floor: our FX rates are constants, eBay converts at live rates. */
export const FX_SLACK = 0.95;
/** plausibleSinglePrice's floor is 0.3x the market from US$3; moved to the server so hundreds of cheap copies cannot push a US$4,000 printing past `limit`. `floorMarketCents`: the cheapest tracked unit's market, USD cents. */
export function cardFilter(market: Country, floorMarketCents: number | null): string {
  const parts = ["buyingOptions:{FIXED_PRICE}", `deliveryCountry:${isoCountry(market)}`];
  if (floorMarketCents != null && floorMarketCents >= 300) parts.push(priceFilter(Math.round(FX_SLACK * 0.3 * floorMarketCents), currencyOf(market)));
  return parts.join(",");
}
/** Sealed: new, fixed price, at least half the product's market (USD cents). */
export function sealedFilter(market: Country, marketCents: number | null): string {
  const parts = ["buyingOptions:{FIXED_PRICE}", "conditions:{NEW}", `deliveryCountry:${isoCountry(market)}`];
  if (marketCents != null) parts.push(priceFilter(Math.round(FX_SLACK * 0.5 * marketCents), currencyOf(market)));
  return parts.join(",");
}
export const CARD_LIMIT = 200;
export const SEALED_LIMIT = 50;

// ── Filters ──────────────────────────────────────────────────────────────────
// Every word filter below is eBay-only, and a word the product's OWN name, printing or set carries is allowed ("Lot" in a card name, "Box" in a Box Topper).

/** Sellers in these countries are rejected: counterfeit and non-English Magic ships mostly from them, often with English titles. */
export const REJECT_LOCATIONS = new Set(["CN", "HK", "TW", "KR", "JP", "VN", "TH"]);

/** Lots, playsets, sets, merch: never one card or one sealed product. */
export const EBAY_JUNK =
  /\b(bundle|bulk|job ?lot|joblot|playsets?|4x|x4|pick (?:your|a|any)|choose (?:your|a|any)|your choice|complete set|master set|full set|set of|\d+\s*cards|\d+x|x\d+|keychain|key ?ring|lanyard|poster print|magnet|funko|figure|plush|badge|pin|sleeves?|deck box|playmat|binder|dice)\b/i;

/** Fakes and non-English printings sellers name in words the stores' matcher does not (a country rather than a language), plus alters, proxies and custom art. */
export const EBAY_FOREIGN_OR_FAKE =
  /\b(japan|japanese|china|chinese|korea|korean|thai|german|french|italian|spanish|portuguese|russian|fran[cç]aise?|proxy|proxies|custom|altered|alter|replica|reproductions?|repro|unofficial|fake|counterfeit|orica|fan[\s-]?(?:art|made)|metal card|cube proxy|playtest)\b/i;

/** Not one raw, undamaged single: slabs written without a space or from other graders, lots and quantities, multi-variation listings, damaged, signed or misprinted copies. */
export const EBAY_NOT_RAW =
  /\b(?:psa|bgs|cgc|sgc|ars|tag|beckett)\s?\d|\bace\s?(?:10|9(?:\.5)?)\b|\b(?:lots?|qty|u\s?pick|you pick|choose|damaged|creased?|dmg|heavily played|hp|moderately played|mp|poor|signed|autograph(?:ed)?|artist proof|misprint|error|water ?damage)\b|\bx\s?\d{2,}\b|\b\d+\s*(?:copies|pcs)\b/i;

/** Sealed words a single's title must not carry (unless its own printing or set says them). */
export const SINGLE_SEALED_WORDS = /\b(booster|sealed|display|case|pack|box|bundle|tin)\b/i;

/** eBay's "Graded" condition (conditionId 2750): a slab, never a raw single. */
export const GRADED_CONDITION_ID = "2750";
/** Postage above max(item price, this many US cents) makes the listing a bait price. */
export const POSTAGE_CAP_USD_CENTS = 1500;

/** eBay's condition string -> our label. Never guess NM: "Used" and "Ungraded" are unknown (null). */
export function ebayConditionLabel(condition: string | null | undefined): string | null {
  const c = (condition ?? "").trim().toLowerCase();
  if (!c) return null;
  if (/near\s*mint\s*or\s*better|^near mint/.test(c)) return "NM";
  if (/lightly\s*played|excellent/.test(c)) return "LP";
  if (/moderately\s*played|very\s*good/.test(c)) return "MP";
  if (/heavily\s*played|poor/.test(c)) return "HP";
  if (c === "brand new" || c === "new" || c === "new other") return "NM";
  return null;
}
/** Played copies are not the NM copy the market price describes: MP and HP are rejected from every display. */
export const REJECT_CONDITIONS = new Set(["MP", "HP"]);

// ── Listings ─────────────────────────────────────────────────────────────────
export interface EbayListing {
  itemId: string;                  // eBay's item id digits (the legacy id)
  title: string;
  priceCents: number;              // ITEM price, market currency
  currency: string;
  shippingCents: number | null;    // first shipping option; 0 = eBay-stated free postage; null = unknown
  condition: string | null;
  location: string | null;         // the seller's itemLocation.country
  imageUrl: string | null;         // Browse's own item image
  endsAt: string | null;           // itemEndDate
}

const toCents = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};
/** "v1|123456789012|0" -> "123456789012"; a bare id is itself; anything else is null. */
export function itemDigits(it: Pick<EbayItem, "itemId" | "legacyItemId">): string | null {
  const legacy = (it.legacyItemId ?? "").replace(/\D/g, "");
  if (legacy.length >= 9) return legacy;
  const parts = (it.itemId ?? "").split("|");
  const mid = (parts.length >= 2 ? parts[1] : parts[0]) ?? "";
  return /^\d{9,14}$/.test(mid) ? mid : null;
}

/** The stored fields of one item (null when it has no usable price or id). The URL is NOT stored: the item id and the market rebuild it at render. */
export function mapItem(it: EbayItem): EbayListing | null {
  const priceCents = toCents(it.price?.value);
  const currency = it.price?.currency;
  const id = itemDigits(it);
  if (priceCents == null || priceCents <= 0 || !currency || !id) return null;
  const ship = it.shippingOptions?.[0]?.shippingCost;
  const shipCents = ship && (!ship.currency || ship.currency === currency) ? toCents(ship.value) : null;
  return {
    itemId: id,
    title: (it.title ?? "").slice(0, 300),
    priceCents,
    currency,
    shippingCents: shipCents,
    condition: ebayConditionLabel(it.condition),
    location: it.itemLocation?.country?.toUpperCase() ?? null,
    imageUrl: it.image?.imageUrl && /^https:\/\//.test(it.image.imageUrl) ? it.image.imageUrl : null,
    endsAt: it.itemEndDate ?? null,
  };
}

// ── Graded slabs ─────────────────────────────────────────────────────────────
// A slab IS the card but is not comparable to a raw one (it trades far above), so it is never a price row, an Offer or part of any comparison. The Browse search the name pass already
// makes returns them anyway when graded listings are not filtered out: they are captured for the card page's Graded tab instead of being discarded (zero extra calls).
export const GRADED_SLAB = /\b(psa|bgs|cgc|sgc)\b/i;
export const isGradedListing = (title: string): boolean => GRADED_SLAB.test(title ?? "");
export interface ParsedGrade { grader: "PSA" | "BGS" | "CGC" | "SGC" | null; grade: number | null }
// The grader must sit IMMEDIATELY before the number (spaces or a dash between): "1 of 10 PSA graded" states no grade. Half grades exist only below 10, and 10 is tried first so a PSA 10 is not a PSA 1.
const GRADE_RE = /\b(PSA|BGS|CGC|SGC)\s*[-–]?\s*(10(?:\.0)?|[1-9](?:\.5)?)\b/i;
const GRADER_ONLY_RE = /\b(PSA|BGS|CGC|SGC)\b/i;
export function parseGrade(title: string): ParsedGrade {
  const t = title ?? "";
  const m = GRADE_RE.exec(t);
  if (m) return { grader: m[1]!.toUpperCase() as ParsedGrade["grader"], grade: parseFloat(m[2]!) };
  const g = GRADER_ONLY_RE.exec(t);
  return { grader: g ? (g[1]!.toUpperCase() as ParsedGrade["grader"]) : null, grade: null };
}
export interface GradedListing extends EbayListing { grader: string; grade: string; finish: Finish; productId: number }

const delivered = (l: EbayListing) => l.priceCents + (l.shippingCents ?? 0);
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
/** While >= 4 remain: drop the head when its item price is under 0.4x the median (and the median >= 500 minor units). */
export function pruneCheapOutliers(list: EbayListing[]): EbayListing[] {
  const out = [...list];
  while (out.length >= 4) {
    const med = median(out.map((l) => l.priceCents));
    if (med >= 500 && out[0]!.priceCents < 0.4 * med) out.shift();
    else break;
  }
  return out;
}

// ── Targets ──────────────────────────────────────────────────────────────────
/** One tracked printing of the searched name. */
export interface NameUnit {
  id: number;
  setCode: string | null;
  setName: string | null;
  label: string | null;
  hasN: boolean;
  hasF: boolean;
  etched: boolean;
  marketN: number | null;          // TCGplayer MARKET, USD cents (null: no market for that finish)
  marketF: number | null;
}
export interface NameTarget {
  kind: "single";
  name: string;
  units: readonly NameUnit[];
  idx: CardIndex;
}
export interface SealedTarget {
  kind: "sealed";
  id: number;
  name: string;
  marketCents: number | null;      // TCGplayer MARKET, USD cents
  refs: readonly SealedRef[];
}
export type ChooseTarget = NameTarget | SealedTarget;

/** The target of a name: the index is built from the rows of THIS name's printings only, so "Sol Ring" never competes with another card. */
export function nameTarget(name: string, rows: readonly MatchRow[], units: readonly NameUnit[]): NameTarget {
  return { kind: "single", name, units, idx: buildCardIndex(rows) };
}

/** Words of `re` in `title` that the product's OWN name, printing or set does not carry. */
function strayWords(title: string, re: RegExp, own: string): string[] {
  return [...title.matchAll(new RegExp(re.source, "gi"))]
    .map((m) => m[0].toLowerCase())
    .filter((w) => !new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(own));
}
const ownTextOf = (t: ChooseTarget): string =>
  t.kind === "single" ? fold(`${t.name} ${t.units.map((u) => `${u.setName ?? ""} ${u.label ?? ""}`).join(" ")}`) : fold(t.name);

export interface MatchedUnit { id: number; finish: Finish }
/** Identity only, for a single: which (product, finish) is this title, as eBay sellers write it? Returns the unit or the reject reason. */
export function identityOfSingle(title: string, target: NameTarget, opts: { graded?: boolean } = {}): MatchedUnit | { reject: string } {
  if (opts.graded) {
    // A slab's own words ("PSA 10", "gem mint", "graded") are what make it a slab, not reasons to reject it: strip them, then judge the rest as a raw single.
    title = title.replace(new RegExp(GRADE_RE.source, "gi"), " ").replace(/\b(psa|bgs|cgc|sgc|beckett|graded|slab(?:bed)?|gem\s*mint|pristine|black label)\b/gi, " ").replace(/\s+/g, " ");
  }
  const own = ownTextOf(target);
  if (strayWords(title, EBAY_JUNK, own).length) return { reject: "junk" };
  if (strayWords(title, EBAY_FOREIGN_OR_FAKE, own).length) return { reject: "foreign-or-fake" };
  if (!opts.graded && strayWords(title, EBAY_NOT_RAW, own).length) return { reject: "not-raw" };
  if (strayWords(title, SINGLE_SEALED_WORDS, own).length) return { reject: "sealed-word" };
  const m = matchCardTitle(title, target.idx);
  if (!("id" in m)) return { reject: `match:${m.miss}` };
  const unit = target.units.find((u) => u.id === m.id);
  if (!unit) return { reject: "other-printing" };
  // The title's finish; none stated: the non-foil copy when the printing has one (sellers write "foil" when it is), else the foil one.
  const finish: Finish = m.finish ?? (unit.hasN ? "N" : "F");
  if (finish === "N" && !unit.hasN) return { reject: "finish-not-offered" };
  if (finish === "F" && !unit.hasF) return { reject: "finish-not-offered" };
  return { id: unit.id, finish };
}
/** Identity for a sealed product. */
export function identityOfSealed(title: string, target: SealedTarget): { id: number } | { reject: string } {
  const own = ownTextOf(target);
  if (strayWords(title, EBAY_JUNK, own).length) return { reject: "junk" };
  if (strayWords(title, EBAY_FOREIGN_OR_FAKE, own).length) return { reject: "foreign-or-fake" };
  if (strayWords(title, EBAY_NOT_RAW, own).length) return { reject: "not-raw" };
  const m = matchSealedTitle(title, target.refs);
  if (!("id" in m)) return { reject: `match:${m.miss}` };
  return m.id === target.id ? { id: m.id } : { reject: "other-product" };
}

/**
 * The title a careful seller would write for this printing: name, set name and code, treatment label and finish. A name none of whose printings passes identityOfSingle on its own canonical
 * title can never match a listing, so the eBay pass never spends a call on it.
 */
export function canonicalTitle(name: string, u: Pick<NameUnit, "setCode" | "setName" | "label"> & { finish: Finish }): string {
  return [nameWords(name), u.setName ?? "", (u.setCode ?? "").toUpperCase(), u.label ?? "", u.finish === "F" ? "Foil" : ""].join(" ").replace(/\s+/g, " ").trim();
}
/** Can at least one tracked printing of this name be matched by its own canonical title? */
export function selfMatches(target: NameTarget): boolean {
  return target.units.some((u) => {
    for (const f of ["N", "F"] as const) {
      if ((f === "N" ? u.hasN : u.hasF) !== true) continue;
      const r = identityOfSingle(canonicalTitle(target.name, { ...u, finish: f }), target);
      if ("id" in r && r.id === u.id) return true;
    }
    return false;
  });
}

export const unitKeyOf = (id: number, finish: Finish): string => `${id}.${finish}`;
export interface ScreenResult {
  /** survivors per (product, finish), cheapest delivered first (before the outlier prune) */
  byUnit: Map<string, EbayListing[]>;
  rejects: Record<string, number>;
}

/** Steps 1 to 8 of the spec for a name search: everything that passes, grouped by the unit the title was matched to. */
export function screenName(items: EbayItem[], target: NameTarget, market: Country): ScreenResult {
  const rejects: Record<string, number> = {};
  const no = (why: string) => { rejects[why] = (rejects[why] ?? 0) + 1; };
  const cur = currencyOf(market);
  const byUnit = new Map<string, EbayListing[]>();
  const unitOf = new Map(target.units.map((u) => [u.id, u] as const));
  for (const it of items) {
    if (!it.price?.value) { no("no-price"); continue; }
    if (it.price.currency !== cur) { no("currency"); continue; }
    if (!(it.buyingOptions ?? []).includes("FIXED_PRICE")) { no("not-fixed-price"); continue; }
    const loc = it.itemLocation?.country?.toUpperCase();
    if (loc && REJECT_LOCATIONS.has(loc)) { no("location"); continue; }
    if (it.conditionId === GRADED_CONDITION_ID || /^graded$/i.test(it.condition ?? "")) { no("graded"); continue; }
    const cond = ebayConditionLabel(it.condition);
    if (cond && REJECT_CONDITIONS.has(cond)) { no("condition"); continue; }
    const id = identityOfSingle(it.title ?? "", target);
    if ("reject" in id) { no(id.reject); continue; }
    const l = mapItem(it);
    if (!l) { no("unusable"); continue; }
    const u = unitOf.get(id.id)!;
    const ref = id.finish === "N" ? u.marketN : u.marketF;
    if (ref == null) { no("no-reference"); continue; }
    const usd = toUsdCents(l.priceCents, l.currency);
    if (!plausibleSinglePrice(usd, ref)) { no("implausible-price"); continue; }
    // Postage: a cheap item with dear postage is a bait price, so the DELIVERED price must be plausible too.
    if (l.shippingCents != null && l.shippingCents > 0) {
      const shipUsd = toUsdCents(l.shippingCents, l.currency);
      if (shipUsd > Math.max(usd, POSTAGE_CAP_USD_CENTS) || !plausibleSinglePrice(usd + shipUsd, ref)) { no("postage"); continue; }
    }
    const k = unitKeyOf(id.id, id.finish);
    const list = byUnit.get(k) ?? [];
    list.push(l);
    byUnit.set(k, list);
  }
  for (const list of byUnit.values()) list.sort((a, b) => delivered(a) - delivered(b) || Number(a.shippingCents == null) - Number(b.shippingCents == null) || a.priceCents - b.priceCents);
  return { byUnit, rejects };
}

/** Sealed: the survivors for one product, cheapest delivered first. */
export function screenSealed(items: EbayItem[], target: SealedTarget, market: Country): { survivors: EbayListing[]; rejects: Record<string, number> } {
  const rejects: Record<string, number> = {};
  const no = (why: string) => { rejects[why] = (rejects[why] ?? 0) + 1; };
  const cur = currencyOf(market);
  const survivors: EbayListing[] = [];
  for (const it of items) {
    if (!it.price?.value) { no("no-price"); continue; }
    if (it.price.currency !== cur) { no("currency"); continue; }
    if (!(it.buyingOptions ?? []).includes("FIXED_PRICE")) { no("not-fixed-price"); continue; }
    const loc = it.itemLocation?.country?.toUpperCase();
    if (loc && REJECT_LOCATIONS.has(loc)) { no("location"); continue; }
    const why = identityOfSealed(it.title ?? "", target);
    if ("reject" in why) { no(why.reject); continue; }
    const l = mapItem(it);
    if (!l) { no("unusable"); continue; }
    if (target.marketCents == null) { no("no-reference"); continue; }
    const usd = toUsdCents(l.priceCents, l.currency);
    if (!plausibleSealedPrice(usd, target.marketCents)) { no("implausible-price"); continue; }
    if (l.shippingCents != null && l.shippingCents > 0) {
      const shipUsd = toUsdCents(l.shippingCents, l.currency);
      if (shipUsd > Math.max(usd, POSTAGE_CAP_USD_CENTS) || !plausibleSealedPrice(usd + shipUsd, target.marketCents)) { no("postage"); continue; }
    }
    survivors.push(l);
  }
  survivors.sort((a, b) => delivered(a) - delivered(b) || Number(a.shippingCents == null) - Number(b.shippingCents == null) || a.priceCents - b.priceCents);
  return { survivors, rejects };
}

/**
 * Graded slabs in a result set: identity as for a raw single (the same matcher, minus the slab words), fixed price, the market's currency, a known grader. Priced against nothing (a slab
 * trades above raw) except one guard: below half the cheapest raw reference it is a mislabelled raw card or a bait price. Best grade first, then price; at most `limit` per product. Never an Offer.
 */
export function screenGraded(items: EbayItem[], target: NameTarget, market: Country, limit = 6): Map<number, GradedListing[]> {
  const cur = currencyOf(market);
  const seen = new Set<string>();
  const out = new Map<number, (GradedListing & { n: number })[]>();
  for (const it of items) {
    const title = it.title ?? "";
    if (!(it.conditionId === GRADED_CONDITION_ID || isGradedListing(title))) continue;
    if (it.price?.currency !== cur || !(it.buyingOptions ?? []).includes("FIXED_PRICE")) continue;
    const loc = it.itemLocation?.country?.toUpperCase();
    if (loc && REJECT_LOCATIONS.has(loc)) continue;
    const g = parseGrade(title);
    if (!g.grader) continue;
    const id = identityOfSingle(title, target, { graded: true });
    if ("reject" in id) continue;
    const l = mapItem(it);
    if (!l || seen.has(l.itemId)) continue;
    const u = target.units.find((x) => x.id === id.id)!;
    const ref = id.finish === "N" ? u.marketN : u.marketF;
    if (ref != null && toUsdCents(l.priceCents, l.currency) < 0.5 * ref) continue;
    seen.add(l.itemId);
    const list = out.get(id.id) ?? [];
    list.push({ ...l, grader: g.grader, grade: g.grade == null ? "Graded" : String(g.grade), n: g.grade ?? -1, finish: id.finish, productId: id.id });
    out.set(id.id, list);
  }
  const res = new Map<number, GradedListing[]>();
  for (const [id, list] of out) res.set(id, list.sort((a, b) => b.n - a.n || a.priceCents - b.priceCents).slice(0, limit).map(({ n: _n, ...rest }) => rest));
  return res;
}

/** The panel's listings of one product: the headline pick first, then the rest of the survivors of all its finishes, never more than `limit`. */
export function panelListings(byFinish: Partial<Record<Finish, EbayListing[]>>, picks: Partial<Record<Finish, EbayListing | null>>, banned?: Set<string>, limit = 8): { finish: Finish; l: EbayListing }[] {
  const out: { finish: Finish; l: EbayListing }[] = [];
  const seen = new Set<string>();
  const add = (f: Finish, l: EbayListing | null | undefined): void => { if (l && !seen.has(l.itemId)) { seen.add(l.itemId); out.push({ finish: f, l }); } };
  for (const f of ["N", "F"] as const) add(f, picks[f]);
  for (const f of ["N", "F"] as const) for (const l of pruneCheapOutliers((byFinish[f] ?? []).filter((x) => !banned?.has(x.itemId)))) add(f, l);
  return out.slice(0, limit);
}
/** The head of the survivors after the outlier prune, skipping item ids already claimed by another product. */
export function pickListing(survivors: EbayListing[], banned?: Set<string>): EbayListing | null {
  const list = banned?.size ? survivors.filter((l) => !banned.has(l.itemId)) : survivors;
  return pruneCheapOutliers(list)[0] ?? null;
}
