// Picking the eBay listing for ONE product in ONE market — pure (no network, no
// database), pinned by tests/ebay-match.test.ts with real eBay-style titles.
//
// Identity is OP Compare's own matcher (lib/match.ts) run against the FULL card
// index: a title that fits another printing, or several, is a miss. On top of
// it come eBay-only filters (junk words, number ranges, seller location,
// currency) and the plausibility guards against TCGplayer's market price. The
// matcher is never loosened to raise the eBay match count; an ambiguous listing
// is skipped. eBay-only rules live HERE, not in match.ts.
import { ebayAffiliateUrl, onePieceEbayQuery } from "./affiliate";
import { currencyOf, isoCountry, type Country } from "./country";
import { convertUsdCents, toUsdCents } from "./fx";
import { cardNumbersIn, matchCardTitle, matchSealedTitle, plausibleSealedPrice, plausibleSinglePrice, titleNamesSet, type CardIndex, type SealedRef } from "./match";

/** The Browse item_summary fields we read. */
export interface EbayItem {
  itemId?: string;
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
}

// ── Queries ──────────────────────────────────────────────────────────────────
// Browse ANDs every keyword, so `q` stays minimal: the number, one word of the
// name, and "One Piece" on the strict pass. Never variant, rarity or set words:
// the matcher tells printings apart, not the query.

/** One word of the display name: the last if it has 4+ letters, else the longest with 4+, else none. */
export function queryWord(name: string): string | null {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const letters = (w: string) => (w.match(/[A-Za-z]/g) ?? []).length;
  const last = words[words.length - 1];
  if (last && letters(last) >= 4) return last;
  const long = words.filter((w) => letters(w) >= 4);
  if (!long.length) return null;
  return long.reduce((a, b) => (b.length > a.length ? b : a));
}

/** The strict query and, unless the number is a P- promo, the broad retry sent when the strict one returns 0 items. */
export function cardQuery(card: { number: string; name: string }): { strict: string; retry: string | null } {
  const w = queryWord(card.name);
  const core = [card.number, w].filter(Boolean).join(" ");
  const promo = /^P-/i.test(card.number);
  return { strict: `One Piece ${core}`, retry: promo ? null : core };
}

/** "OP01: Romance Dawn Booster Box" → "One Piece Romance Dawn Booster Box". */
export function sealedQuery(name: string): string {
  return onePieceEbayQuery(name.replace(/^[A-Z]{2,3}-?\d{2}(?:-[A-Z]{2}\d{2})?:\s*/, ""));
}

/** Server-side price floor: `price:[12.34..],priceCurrency:GBP` (USD cents converted to the market currency). */
export function priceFilter(minUsdCents: number, currency: string): string {
  const minor = convertUsdCents(minUsdCents, currency);
  return `price:[${(Math.floor(minor) / 100).toFixed(2)}..],priceCurrency:${currency}`;
}

/** 5% under our own plausibility floor: our FX rates are constants, eBay converts at live rates. */
export const FX_SLACK = 0.95;

export function cardFilter(market: Country, marketUsd: number | null): string {
  const parts = ["buyingOptions:{FIXED_PRICE}", `deliveryCountry:${isoCountry(market)}`];
  // plausibleSinglePrice's 0.3× floor applies from US$3; moved to the server so
  // hundreds of cheap base copies can't push a US$4,000 Manga past `limit`.
  if (marketUsd != null && marketUsd >= 300) parts.push(priceFilter(Math.round(FX_SLACK * 0.3 * marketUsd), currencyOf(market)));
  return parts.join(",");
}

export function sealedFilter(market: Country, marketUsd: number | null): string {
  const parts = ["buyingOptions:{FIXED_PRICE}", "conditions:{NEW}", `deliveryCountry:${isoCountry(market)}`];
  if (marketUsd != null) parts.push(priceFilter(Math.round(FX_SLACK * 0.5 * marketUsd), currencyOf(market)));
  return parts.join(",");
}

export const CARD_LIMIT = 100;
export const SEALED_LIMIT = 50;

// ── Filters ──────────────────────────────────────────────────────────────────
// Every word filter below is eBay-only (lib/match.ts stays the stores' matcher),
// and a word the product's OWN name, printing or set carries is allowed:
// "poster" for a Wanted Poster print, "box" for a Box Topper.

/** Sellers in these countries are rejected: Asian-language One Piece dominates eBay, often titled in English. */
export const REJECT_LOCATIONS = new Set(["CN", "HK", "TW", "KR", "JP"]);

/** Lots, sets, merch — never one card or one sealed product. */
export const EBAY_JUNK =
  /\b(bundle|bulk|job ?lot|joblot|pick (?:your|a) card|choose (?:your|a)|your choice|complete set|master set|full set|set of|\d+\s*cards|keychain|key ?ring|lanyard|poster|magnet|funko|figure|plush|badge|pin)\b/i;

/**
 * Non-English printings and fakes that eBay sellers name in words the stores'
 * FOREIGN_LANG doesn't: a country rather than a language ("Japan", "China",
 * "Korea", "Thai"), French ("VF", "FR", "Version Française"), and fan-made or
 * counterfeit cards ("Orica", "Fan Art", "Reproduction", "Metal Card").
 */
export const EBAY_FOREIGN_OR_FAKE =
  /\b(japan|china|korea|thai|vf|fr|fran[cç]aise?|orica|fan[\s-]?(?:art|made)|reproductions?|repro|unofficial|metal card|fake|replica)\b/i;

/**
 * Not one raw, undamaged single: slabs written without a space or from other
 * graders ("PSA10", "BGS9.5", "ARS 10", "ACE 10"), lots and quantities ("Lot",
 * "x10", "3 copies", "Qty 2"), multi-variation listings ("U Pick", "Choose
 * Version") and damaged, signed or misprinted copies.
 */
export const EBAY_NOT_RAW =
  /\b(?:psa|bgs|cgc|sgc|ars|tag)\s?\d|\bace\s?(?:10|9(?:\.5)?)\b|\b(?:lots?|qty|u\s?pick|you pick|choose|damaged|creased?|dmg|heavily played|signed|autograph(?:ed)?|misprint|error)\b|\bx\s?\d{2,}\b|\b\d+\s*(?:copies|pcs)\b/i;

/** Sealed words a single's title must not carry (unless its own printing or set says them). */
export const SINGLE_SEALED_WORDS = /\b(booster|sealed|display|case|pack|box)\b/i;

/** "OP01-001 - 010", "OP01-001 to OP01-010": a range, not one card. Not "OP01-120 - 100% Authentic". */
export const NUMBER_RANGE_OP = /\b([A-Z]{2}\d{2})-\d{3}\s*(?:-|–|—|to)\s*(?:\1-)?\d{3}(?=$|[\s)\],/|])/i;

/** eBay's "Graded" condition (conditionId 2750): a slab, never a raw single. */
export const GRADED_CONDITION_ID = "2750";

/** Postage above max(item price, this many US cents) makes the listing a bait price. */
export const POSTAGE_CAP_USD_CENTS = 1500;

/** Unpriced products judged against a store reference need at least this many survivors. */
export const REF_MIN_SURVIVORS = 3;

/** eBay's condition string → our label. Never guess NM: "Used" and "Ungraded" are unknown. */
export function ebayConditionLabel(condition: string | null | undefined): string | null {
  const c = (condition ?? "").trim().toLowerCase();
  if (!c) return null;
  if (/near\s*mint\s*or\s*better/.test(c)) return "NM";
  if (c === "excellent") return "LP";
  if (/very\s*good/.test(c)) return "MP";
  if (c === "poor") return "HP";
  if (c === "brand new" || c === "new" || c === "new other") return "NM";
  return null;
}

// ── Listings ─────────────────────────────────────────────────────────────────
export interface EbayListing {
  itemId: string;
  title: string;
  priceCents: number; // ITEM price, market currency
  currency: string;
  shippingCents: number | null; // first shipping option; 0 = eBay-stated free postage; null = unknown
  url: string; // EPN-tagged
  condition: string | null;
  location: string | null; // seller's itemLocation.country
  imageUrl: string | null; // Browse's own item image, for the listing panels
}

const toCents = (v: string | undefined): number | null => {
  if (v == null) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
};

/** The stored fields of one item (null when it has no usable price or URL). */
export function mapItem(it: EbayItem): EbayListing | null {
  const priceCents = toCents(it.price?.value);
  const currency = it.price?.currency;
  const href = it.itemAffiliateWebUrl ?? it.itemWebUrl;
  if (priceCents == null || priceCents <= 0 || !currency || !href) return null;
  const ship = it.shippingOptions?.[0]?.shippingCost;
  const shipCents = ship && (!ship.currency || ship.currency === currency) ? toCents(ship.value) : null;
  return {
    itemId: it.itemId ?? href,
    title: (it.title ?? "").slice(0, 300),
    priceCents,
    currency,
    shippingCents: shipCents,
    url: ebayAffiliateUrl(href),
    condition: ebayConditionLabel(it.condition),
    location: it.itemLocation?.country?.toUpperCase() ?? null,
    imageUrl: it.image?.imageUrl && /^https:\/\//.test(it.image.imageUrl) ? it.image.imageUrl : null,
  };
}

// ── Graded slabs ─────────────────────────────────────────────────────────────
// A slab IS the card but is not comparable to a raw one (it trades far above),
// so it is never a price row, an Offer or part of any comparison. The Browse
// search the price pass already makes returns them anyway; they are captured
// for the card page's Graded tab instead of being discarded (zero extra calls).
export const GRADED_SLAB = /\b(psa|bgs|cgc|sgc)\b/i;

export function isGradedListing(title: string): boolean {
  return GRADED_SLAB.test(title ?? "");
}

export interface ParsedGrade {
  grader: "PSA" | "BGS" | "CGC" | "SGC" | null;
  grade: number | null;
}

// The grader must sit IMMEDIATELY before the number (spaces or a dash between):
// "1 of 10 PSA graded" and "PSA graded, see photos" state no grade. Half grades
// exist only below 10, and 10 is tried first so a PSA 10 is not read as a PSA 1.
const GRADE_RE = /\b(PSA|BGS|CGC|SGC)\s*[-–]?\s*(10(?:\.0)?|[1-9](?:\.5)?)\b/i;
const GRADER_ONLY_RE = /\b(PSA|BGS|CGC|SGC)\b/i;

/** The grader and numeric grade in an eBay title; the grader alone when no grade follows it. */
export function parseGrade(title: string): ParsedGrade {
  const t = title ?? "";
  const m = GRADE_RE.exec(t);
  if (m) return { grader: m[1].toUpperCase() as ParsedGrade["grader"], grade: parseFloat(m[2]) };
  const g = GRADER_ONLY_RE.exec(t);
  return { grader: g ? (g[1].toUpperCase() as ParsedGrade["grader"]) : null, grade: null };
}

export interface GradedListing extends EbayListing {
  grader: string;
  grade: string; // "10", "9.5", or "Graded" when the title names a grader but no grade
}

const delivered = (l: EbayListing) => l.priceCents + (l.shippingCents ?? 0);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** While ≥ 4 remain: drop the head when its item price is under 0.4× the median (and the median ≥ 500 minor units). */
export function pruneCheapOutliers(list: EbayListing[]): EbayListing[] {
  const out = [...list];
  while (out.length >= 4) {
    const med = median(out.map((l) => l.priceCents));
    if (med >= 500 && out[0].priceCents < 0.4 * med) out.shift();
    else break;
  }
  return out;
}

export type ChooseTarget =
  | { kind: "single"; id: number; name?: string; variant: string | null; setName: string | null; marketUsd: number | null; refUsd?: number | null; idx: CardIndex }
  | { kind: "sealed"; id: number; name?: string; marketUsd: number | null; refUsd?: number | null; refs: SealedRef[] };

export interface ChooseResult {
  listing: EbayListing | null;
  survivors: EbayListing[]; // every listing that passed, cheapest delivered first (before the prune)
  rejects: Record<string, number>;
}

/** Words of `re` in `title` that the product's own name, printing or set does not carry. */
function strayWords(title: string, re: RegExp, own: string): string[] {
  return [...title.matchAll(new RegExp(re.source, "gi"))]
    .map((m) => m[0].toLowerCase())
    .filter((w) => !new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(own));
}

const ownText = (t: ChooseTarget) =>
  (t.kind === "single" ? `${t.name ?? ""} ${t.variant ?? ""} ${t.setName ?? ""}` : `${t.name ?? ""}`).toLowerCase().replace(/\s+/g, " ");

type IndexEntry = CardIndex extends Map<string, (infer E)[]> ? E : never;
const sameKeys = (a: IndexEntry, b: IndexEntry) =>
  a.keys.size === b.keys.size && [...a.keys].every((k) => b.keys.has(k)) && a.extras.length === b.extras.length && a.extras.every((w) => b.extras.includes(w));

/**
 * Printings of the same number with the SAME keys and extras in another set: a
 * Premium Booster's "Manga" or "Alternate Art" beside the original set's, or a
 * plain reprint. A title that names neither set fits both, and matchCardTitle
 * gives it to the number's own set — on eBay that is often the cheaper reprint.
 */
export function siblingPrintings(idx: CardIndex, number: string, id: number): IndexEntry[] {
  const list = idx.get(number.toUpperCase()) ?? [];
  const self = list.find((c) => c.id === id);
  if (!self) return [];
  return list.filter((c) => c.id !== id && (c.setCode ?? "") !== (self.setCode ?? "") && sameKeys(c, self));
}

/**
 * Identity only — is this title the target product, as eBay sellers write it?
 * Junk, foreign and fake words, not-raw wording, sealed words on a single,
 * number ranges, OP Compare's matcher over the FULL index, and the sibling-set
 * rule. Returns the reject reason, or null.
 */
export function identityReject(title: string, target: ChooseTarget, opts: { graded?: boolean } = {}): string | null {
  // A slab's own words ("PSA 10", "gem mint", "graded") are what make it a slab,
  // not reasons to reject it: strip them, then judge the rest as a raw single.
  if (opts.graded) {
    title = title
      .replace(new RegExp(GRADE_RE.source, "gi"), " ")
      .replace(/\b(psa|bgs|cgc|sgc|beckett|graded|slab(?:bed)?|gem\s*mint|pristine|black label)\b/gi, " ")
      .replace(/\s+/g, " ");
  }
  const own = ownText(target);
  if (strayWords(title, EBAY_JUNK, own).length) return "junk";
  if (strayWords(title, EBAY_FOREIGN_OR_FAKE, own).length) return "foreign-or-fake";
  if (strayWords(title, EBAY_NOT_RAW, own).length) return "not-raw";
  if (target.kind === "single") {
    if (strayWords(title, SINGLE_SEALED_WORDS, own).length) return "sealed-word";
    if (NUMBER_RANGE_OP.test(title)) return "number-range";
    const m = matchCardTitle(title, target.idx);
    if (!("id" in m)) return `match:${m.miss}`;
    if (m.id !== target.id) return "other-printing";
    // The home-set tie-break is a guess on eBay: a same-tag printing in another
    // set means the title must name the target's own set.
    const number = cardNumbersIn(title)[0];
    const sibs = number ? siblingPrintings(target.idx, number, target.id) : [];
    if (sibs.length) {
      const self = target.idx.get(number.toUpperCase())!.find((c) => c.id === target.id)!;
      if (!titleNamesSet(title, self.setCode, self.setName)) return "sibling-set";
    }
    return null;
  }
  const m = matchSealedTitle(title, target.refs);
  if (!("id" in m)) return `match:${m.miss}`;
  if (m.id !== target.id) return "other-product";
  return null;
}

/**
 * The title a careful seller would write for this printing — name, number,
 * printing, set name and code. A printing whose own canonical title doesn't
 * pass identityReject can never match a listing, so the eBay pass never spends
 * a call on it (a "Japanese Version" promo, a Playmat promo, two printings with
 * the same tag in one set).
 */
export function canonicalTitle(c: { name: string; number: string; variant: string | null; setName: string | null; setCode: string | null }): string {
  return `One Piece ${c.name} ${c.number} ${c.variant ? `(${c.variant})` : ""} ${c.setName ?? ""} ${c.setCode ?? ""}`.replace(/\s+/g, " ").trim();
}

export function selfMatches(
  c: { id: number; name: string; number: string; variant: string | null; setName: string | null; setCode: string | null },
  idx: CardIndex,
): boolean {
  return identityReject(canonicalTitle(c), { kind: "single", id: c.id, name: c.name, variant: c.variant, setName: c.setName, marketUsd: null, idx }) == null;
}

/** Steps 1–8 of the spec: everything that passes, sorted by delivered price (known postage first on a tie). */
export function screenItems(items: EbayItem[], target: ChooseTarget, market: Country): { survivors: EbayListing[]; rejects: Record<string, number> } {
  const rejects: Record<string, number> = {};
  const no = (why: string, n = 1) => {
    rejects[why] = (rejects[why] ?? 0) + n;
  };
  const cur = currencyOf(market);
  // TCGplayer's market price; for an unpriced product in its launch window, the
  // cheapest store price (lib/ebay-import.ts). Neither → nothing is trusted.
  const ref = target.marketUsd ?? target.refUsd ?? null;
  const plausible = (usd: number) => (target.kind === "single" ? plausibleSinglePrice(usd, ref) : plausibleSealedPrice(usd, ref));
  let survivors: EbayListing[] = [];
  for (const it of items) {
    const title = it.title ?? "";
    if (!it.price?.value) {
      no("no-price");
      continue;
    }
    if (it.price.currency !== cur) {
      no("currency");
      continue;
    }
    if (!(it.buyingOptions ?? []).includes("FIXED_PRICE")) {
      no("not-fixed-price");
      continue;
    }
    const loc = it.itemLocation?.country?.toUpperCase();
    if (loc && REJECT_LOCATIONS.has(loc)) {
      no("location");
      continue;
    }
    if (it.conditionId === GRADED_CONDITION_ID || /^graded$/i.test(it.condition ?? "")) {
      no("graded");
      continue;
    }
    const why = identityReject(title, target);
    if (why) {
      no(why);
      continue;
    }
    const l = mapItem(it);
    if (!l) {
      no("unusable");
      continue;
    }
    if (ref == null) {
      no("no-reference");
      continue;
    }
    const usd = toUsdCents(l.priceCents, l.currency);
    if (!plausible(usd)) {
      no("implausible-price");
      continue;
    }
    // Postage: a cheap item with dear postage is a bait price, and the board and
    // low<M> rank by item price — so the DELIVERED price must be plausible too.
    if (l.shippingCents != null && l.shippingCents > 0) {
      const shipUsd = toUsdCents(l.shippingCents, l.currency);
      if (shipUsd > Math.max(usd, POSTAGE_CAP_USD_CENTS) || !plausible(usd + shipUsd)) {
        no("postage");
        continue;
      }
    }
    survivors.push(l);
  }
  survivors.sort((a, b) => delivered(a) - delivered(b) || Number(a.shippingCents == null) - Number(b.shippingCents == null) || a.priceCents - b.priceCents);
  // A store reference is weaker than TCGplayer's market price: ask for a few
  // listings that agree, and drop a head under half their median.
  if (target.marketUsd == null && survivors.length) {
    while (survivors.length >= REF_MIN_SURVIVORS && survivors[0].priceCents < 0.5 * median(survivors.map((l) => l.priceCents))) {
      survivors.shift();
      no("reference-outlier");
    }
    if (survivors.length < REF_MIN_SURVIVORS) {
      no("few-for-reference", survivors.length);
      survivors = [];
    }
  }
  return { survivors, rejects };
}

/**
 * Graded slabs in a result set: identity as for a raw single (the same matcher,
 * minus the slab words), fixed price, the market's currency, a known grader.
 * Priced against nothing (a slab trades above raw) except one guard: below half
 * the raw reference it is a mislabelled raw card or a bait price. Best grade
 * first, then price; at most `limit`. Never an Offer.
 */
export function screenGraded(items: EbayItem[], target: ChooseTarget, market: Country, limit = 6): GradedListing[] {
  if (target.kind !== "single") return [];
  const cur = currencyOf(market);
  const ref = target.marketUsd ?? target.refUsd ?? null;
  const seen = new Set<string>();
  const out: (GradedListing & { n: number })[] = [];
  for (const it of items) {
    const title = it.title ?? "";
    if (!(it.conditionId === GRADED_CONDITION_ID || isGradedListing(title))) continue;
    if (it.price?.currency !== cur || !(it.buyingOptions ?? []).includes("FIXED_PRICE")) continue;
    const loc = it.itemLocation?.country?.toUpperCase();
    if (loc && REJECT_LOCATIONS.has(loc)) continue;
    const g = parseGrade(title);
    if (!g.grader) continue;
    if (identityReject(title, target, { graded: true })) continue;
    const l = mapItem(it);
    if (!l || seen.has(l.itemId)) continue;
    if (ref != null && toUsdCents(l.priceCents, l.currency) < 0.5 * ref) continue;
    seen.add(l.itemId);
    out.push({ ...l, grader: g.grader, grade: g.grade == null ? "Graded" : String(g.grade), n: g.grade ?? -1 });
  }
  out.sort((a, b) => b.n - a.n || a.priceCents - b.priceCents);
  return out.slice(0, limit).map(({ n: _n, ...rest }) => rest);
}

/** The panel's listings: the headline pick first, then the rest of the survivors, never more than `limit`. */
export function panelListings(survivors: EbayListing[], pick: EbayListing | null, banned?: Set<string>, limit = 8): EbayListing[] {
  const list = pruneCheapOutliers(banned?.size ? survivors.filter((l) => !banned.has(l.itemId)) : survivors);
  const rest = list.filter((l) => l.itemId !== pick?.itemId);
  return (pick ? [pick, ...rest] : rest).slice(0, limit);
}

/** The head of the survivors after the outlier prune, skipping item ids already claimed by another product. */
export function pickListing(survivors: EbayListing[], banned?: Set<string>): EbayListing | null {
  const list = banned?.size ? survivors.filter((l) => !banned.has(l.itemId)) : survivors;
  return pruneCheapOutliers(list)[0] ?? null;
}

export function chooseListing(items: EbayItem[], target: ChooseTarget, market: Country): ChooseResult {
  const { survivors, rejects } = screenItems(items, target, market);
  return { listing: pickListing(survivors), survivors, rejects };
}
