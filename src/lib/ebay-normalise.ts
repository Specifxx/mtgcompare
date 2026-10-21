// Turning eBay's ItemSummary rows into the listings a feed stores: validation, junk and relevance
// filters, shipping, image size, de-duplication. PURE (no fetch, no env, no database): the importer
// (src/lib/ebay-import.ts) calls it on what the Browse API returned, and tests/ run it on realistic titles.
//
// Rules kept here (eBay API License Agreement / Buy APIs Requirements; ebay-api.ts has the sources):
//   • FIXED_PRICE items only; not ended; price in the marketplace's own currency, never converted;
//   • the image must be eBay's own (https, *.ebayimg.com), shown as a plain <img>;
//   • the link is eBay's affiliate URL (itemAffiliateWebUrl) EXACTLY as eBay returned it, with OUR campaign id in it (eBay's spec says
//     to use that URL as is; its customid is the per-feed affiliateReferenceId the search asked for), or, if eBay sent none,
//     itemWebUrl tagged with the same EPN parameters; nothing downstream edits either;
//   • adult-only items dropped; shipping captured so a tile can call it out separately;
//   • no derived statistics: nothing here computes an average, median or "% below" of eBay prices.
import { epnTagUrl, EBAY_CAMPAIGN_ID, isItemListingUrl } from "./affiliate";
import { cleanImageUrl, cleanPrice, cleanText, cleanTitle, feedReference, MARKETPLACES, type FeedItem, type FeedKind, type MarketplaceId } from "./ebay-context";
import { detectSet, floorCents, fromRoughUsdCents, identify, isIdentity, TYPE_BY_KEY, type TypeKey } from "./sealed-title";
import { refusedForType, refusedListing } from "./ebay-rules";
export { refusedForType, refusedListing } from "./ebay-rules";
import type { Region } from "./regions";
import { regionsOfMarketplace } from "./ebay-context";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** FLOOR_FX's market code for a marketplace (the AU marketplace's prices are AUD like the AU market's). */
export const MARKET_OF_MARKETPLACE: Record<MarketplaceId, string> = { EBAY_US: "US", EBAY_AU: "AU", EBAY_GB: "UK", EBAY_CA: "CA", EBAY_DE: "EU" };

/** Per-currency price floor for a single chase CARD, in that currency: anything cheaper is a pack, a bulk card or junk. */
export const CHASE_FLOOR: Record<string, number> = { USD: 15, AUD: 20, GBP: 12, CAD: 20, EUR: 15 };

/** The price floor of the generic sealed feed, in US dollars: below it a "booster box" is a pack, a bulk lot or a mis-listing. */
export const SEALED_FLOOR_USD = 30;

/** A type's floor in a marketplace's own currency (whole units, rounded up so the filter never lets the floor through). */
export function typeFloor(type: TypeKey, marketplace: MarketplaceId): number {
  return Math.ceil(floorCents(type, MARKET_OF_MARKETPLACE[marketplace]) / 100);
}

/** US$ → a marketplace's currency, whole units rounded up, with the importer's rough FX table (thresholds only; never shown). */
export function usdToMarketplace(usd: number, marketplace: MarketplaceId): number {
  return Math.ceil(fromRoughUsdCents(usd * 100, MARKET_OF_MARKETPLACE[marketplace]) / 100);
}

// ─── Images ────────────────────────────────────────────────────────────────────

const SIZE_RE = /^(\/images\/g\/[A-Za-z0-9~_-]+\/)s-l(\d{2,4})(\.[a-z]{3,4})$/;

/**
 * eBay's search thumbnails are s-l225; the strip's tiles are ~180 CSS px wide on a 2x screen, so a
 * 225 px image is soft. eBay serves the same photo at s-l500 on the same path (its own listing pages use
 * both), so the stored URL asks for 500. Never downgrades a larger size, never touches another URL
 * shape, and keeps https + *.ebayimg.com. (Could not be fetched from this sandbox with a real image id:
 * eBay answers a placeholder for an unknown one at every size. A tile whose image fails hides itself.)
 */
export function upgradeImage(url: string, width = 500): string {
  try {
    const u = new URL(url);
    const m = SIZE_RE.exec(u.pathname);
    if (!m || Number(m[2]) >= width) return url;
    u.pathname = `${m[1]}s-l${width}${m[3]}`;
    return u.toString();
  } catch {
    return url;
  }
}

/** A stable key for "the same photo": the id inside /images/g/<id>/ when there is one, else the path without size or query. */
export function imageKey(imageUrl: string): string {
  try {
    const u = new URL(imageUrl);
    const m = /\/images\/g\/([^/]+)\//.exec(u.pathname);
    return (m ? m[1] : u.pathname.replace(/\/s-l\d+(\.\w+)?$/, "")).toLowerCase();
  } catch {
    return imageUrl;
  }
}

// ─── Shipping ──────────────────────────────────────────────────────────────────

/**
 * shippingOptions[0]: free when its cost is zero, a cost when eBay gave one, nothing otherwise (calculated
 * shipping has no cost in a search result). The first option is the one eBay lists first for the buyer's country.
 */
export function shippingFrom(raw: Record<string, unknown>): FeedItem["ship"] | undefined {
  const opts = raw.shippingOptions;
  if (!Array.isArray(opts) || !isRecord(opts[0])) return undefined;
  const cost = opts[0].shippingCost;
  if (!isRecord(cost) || typeof cost.value !== "string" || !/^\d{1,5}(\.\d{1,2})?$/.test(cost.value)) return undefined;
  if (typeof cost.currency !== "string" || !/^[A-Z]{3}$/.test(cost.currency)) return undefined;
  return Number(cost.value) === 0 ? { free: true } : { value: cost.value, currency: cost.currency };
}

// ─── The link ──────────────────────────────────────────────────────────────────

/**
 * The link for an item: eBay's own affiliate URL, EXACTLY as returned (the stored string is eBay's string: not re-serialised, nothing
 * added or rewritten) if it is one eBay item page carrying OUR campaign id; else, when eBay sent no usable one, itemWebUrl tagged with
 * the EPN parameter set and this feed's sub-id (dex-<market>-<kind>) as customid.
 */
export function itemUrl(it: Record<string, unknown>, marketplace: MarketplaceId, kind: FeedKind): string | null {
  const aff = it.itemAffiliateWebUrl;
  // eslint-disable-next-line no-control-regex
  if (typeof aff === "string" && aff.length <= 2048 && !/[\s\u0000-\u001f\u007f]/.test(aff)) {
    try {
      const u = new URL(aff);
      if (isItemListingUrl(u) && u.searchParams.get("campid") === EBAY_CAMPAIGN_ID) return aff;
    } catch {
      /* fall through to itemWebUrl */
    }
  }
  const web = it.itemWebUrl;
  // Any region of the marketplace names its eBay site (EPN's rotation id).
  const region: Region = regionsOfMarketplace(marketplace)[0];
  const tagged = typeof web === "string" ? epnTagUrl(web, region, feedReference(marketplace, kind)) : null;
  return tagged && isItemListingUrl(new URL(tagged)) ? tagged : null;
}

// ─── One ItemSummary → one FeedItem ────────────────────────────────────────────

/**
 * The checks every feed shares. Defensive about every missing field: the Browse API omits fields freely, and
 * none may crash the importer. Returns null when anything fails.
 */
export function baseItem(raw: unknown, marketplace: MarketplaceId, now: number, kind: FeedKind): FeedItem | null {
  if (!isRecord(raw)) return null;
  const m = MARKETPLACES[marketplace];
  const id = typeof raw.itemId === "string" && raw.itemId.length > 0 && raw.itemId.length <= 64 ? raw.itemId : null;
  const title = cleanTitle(raw.title);
  if (!id || !title) return null;
  if (raw.adultOnly === true) return null;

  // Active, Buy It Now only: no ended items, no auctions.
  if (Array.isArray(raw.buyingOptions) && !raw.buyingOptions.includes("FIXED_PRICE")) return null;
  if (typeof raw.itemEndDate === "string") {
    const end = Date.parse(raw.itemEndDate);
    if (Number.isFinite(end) && end <= now) return null;
  }

  // The price exactly as eBay returned it, in the marketplace's own currency: a converted one is dropped.
  const price = cleanPrice(raw.price);
  if (!price || price.currency !== m.currency) return null;
  if (isRecord(raw.price) && (raw.price.convertedFromCurrency || raw.price.convertedFromValue)) return null;

  const image = isRecord(raw.image) ? cleanImageUrl(raw.image.imageUrl) : null;
  const thumb = Array.isArray(raw.thumbnailImages) && isRecord(raw.thumbnailImages[0]) ? cleanImageUrl(raw.thumbnailImages[0].imageUrl) : null;
  const picked = image ?? thumb;
  if (!picked) return null;
  const imageUrl = cleanImageUrl(upgradeImage(picked));
  if (!imageUrl) return null;

  const url = itemUrl(raw, marketplace, kind);
  if (!url) return null;

  const condition = cleanText(raw.condition, 24);
  const ship = shippingFrom(raw);
  return { id, title, imageUrl, price, url, ...(ship ? { ship } : {}), ...(condition ? { condition } : {}) };
}

// ─── Chase cards ───────────────────────────────────────────────────────────────

// Counterfeits, customs, other languages, lots, sealed product, merchandise: anything that is not one English card.
const JUNK_TITLE = new RegExp(
  "\\b(?:" +
    [
      // counterfeit / not a real card
      "proxy|proxies|custom|replica|reprint|repro|reproduction|orica|fan\\s*art|metal\\s*cards?|digital|code\\s*cards?|fake|counterfeit|unofficial|novelty|altered|handmade|hand\\s*made|diy|ai\\s*generated|pocket|gold\\s*(?:plated|foil|metal|cards?)|acrylic|sticker|poster|keychain|figure|plush|coin|pin|replacement|placeholder|jumbo|oversize|oversized",
      // merchandise
      "(?:art\\s*)?prints?|printed|magnets?|canvas|wall\\s*art|gifts?|toploaders?|holders?|stands?|mat|mats",
      // lots, sealed product and kits: not one card
      "lots?|bulk|damaged|empty|bundle|booster|boxes|box|etb|tin|sealed|case|display|binder|sleeves?|playmat|mystery|random|you\\s*pick|choose|pick\\s*your|complete\\s*set|master\\s*set|\\d+\\s*(?:cards|packs?)|packs?|decks?|kits?|playsets?|(?:ultra\\s*)?premium\\s*collection|special\\s*collection|collection\\s*box|league\\s*battle|build\\s*(?:&|and)\\s*battle|stadium",
      // other languages (and the Japanese product-code styles that do not say "Japanese")
      "japanese|japan|jpn|jp|korean|chinese|german|deutsch|karte|karten|kartenspiel|sammelkarte|french|francais|carte|italian|italiano|carta|spanish|espanol|tarjeta|thai|indonesian|portuguese|dutch|russian|vietnamese|polish|turkish|arabic|pokemon\\s*card\\s*game|sv\\d+[a-z]|s\\d+[a-z]|sm\\d+[a-z]|" +
        // the same languages as the eBay site itself writes them (EBAY_DE listings), print-language codes and local card names
        "japanisch|japonais|japonaise|japones|japonesa|giapponese|koreanisch|chinesisch|jahre|de|ger|fr|fra|esp|ita|glurak|dracaufeu|lizardon|bisaflor|turtok",
    ].join("|") +
    ")\\b",
  "i",
);

// A single card names itself: a card number (199/165), a special rarity or a grade. (A bare "ex" or "rare"
// does not: "Charizard ex Special Collection" and "Rare Candy" are not cards worth showing.)
const CARD_SIGNAL = /\b\d{1,3}\s*\/\s*\d{2,3}\b|\b(?:illustration|alt\s*art|full\s*art|sir|psa|bgs|cgc|sgc|promo|trainer\s*gallery)\b/i;

export function isJunkTitle(title: string): boolean {
  return JUNK_TITLE.test(title) || !CARD_SIGNAL.test(title);
}

/** One chase-card listing (a single English card), or null. */
export function normaliseChase(raw: unknown, marketplace: MarketplaceId, now: number, kind: FeedKind = "chase"): FeedItem | null {
  const it = baseItem(raw, marketplace, now, kind);
  if (!it || isJunkTitle(it.title)) return null;
  if (Number(it.price.value) < (CHASE_FLOOR[it.price.currency] ?? 0)) return null;
  return it;
}

/** A set's chase card: a chase card that does not name a different set. */
export function normaliseSetChase(raw: unknown, marketplace: MarketplaceId, now: number, setCode: string): FeedItem | null {
  const it = normaliseChase(raw, marketplace, now, "set");
  if (!it) return null;
  const named = detectSet(it.title);
  return named && named.code !== setCode ? null : it;
}

// ─── Sealed product ────────────────────────────────────────────────────────────

/** The product types the generic "Sealed Pokémon" feed shows: whole products a buyer compares, not packs, blisters, decks or tins. */
export const SEALED_FEED_TYPES: ReadonlySet<TypeKey> = new Set<TypeKey>(["booster-box", "etb", "pc-etb", "booster-bundle", "upc", "collection", "build-battle-stadium", "booster-box-case", "etb-case"]);

// ─── Several units in one listing ──────────────────────────────────────────────
// "Surging Sparks ETB x2", "Two … Elite Trainer Boxes", "2 ETBs", "Set of Two", "Double Pack", "Qty 2", "(2)", "- 4 Boxes",
// "Costco 8-Pack Mini Tin Box": the classifier sees one product's name, but the price is for several. A set (or one-product)
// page must never show a multi-unit price under a single product's name, so any quantity wording refuses the listing.
const NUMBER_WORD = "(?:two|three|four|five|six|seven|eight|nine|ten)";
const UNIT_NOUN = "(?:etbs?|elite\\s+trainer\\s+box(?:es)?|boxes|box|tins?|bundles?|collections?|decks?|blisters?|displays?)";
const MULTI_UNIT: readonly RegExp[] = [
  /\bx\s?\d{1,2}\b/i, // x2, X 2
  /\(\s*\d{1,2}\s*\)/, // (2)
  /\b(?:qty|quantity)\b/i,
  new RegExp(`\\b${NUMBER_WORD}\\s+(?:[\\w&'.+-]+\\s+){0,5}?${UNIT_NOUN}\\b`, "i"), // Two Surging Sparks Elite Trainer Boxes
  // 2 Surging Sparks Elite Trainer Boxes, Surging Sparks 2 ETBs, - 4 Boxes (not "9 Packs", not "3.5", not "151")
  new RegExp(`(?<![\\d./])\\b[2-9]\\b(?![\\d.])(?!\\s*-?\\s*(?:booster\\s+)?packs?\\b)\\s*(?:x\\s*)?(?:[\\w&'.+-]+\\s+){0,5}?${UNIT_NOUN}\\b`, "i"),
  /\b(?:set|pair)\s+of\s+(?:\d+|two|three|four)\b/i,
  /\b(?:double|twin)\s*-?\s*pack\b/i,
  /\bmulti\s*-?\s*(?:buy|pack|set|save|unit)\b/i,
  /\bcostco\b/i,
];
// "N-pack" is the product itself for a blister, a booster bundle, a tin or a deck ("3 Pack Blister", "6-Pack Booster Bundle").
const CASE_TYPES = new Set<TypeKey>(["booster-box-case", "etb-case", "booster-bundle-case"]);
const PACK_COUNT_OK = new Set<TypeKey>(["blister", "booster-bundle", "tin", "deck", "build-battle"]);

/** Does the title sell several units (or a multi-pack of a single-unit product)? */
export function multiUnit(title: string, type: TypeKey): boolean {
  if (CASE_TYPES.has(type)) return false; // a case IS several boxes ("6 Boxes", "Case of 6")
  if (MULTI_UNIT.some((re) => re.test(title))) return true;
  return !PACK_COUNT_OK.has(type) && /\b(?:[2-9]|1\d)\s*-\s*packs?\b/i.test(title);
}

// Listings a sealed strip should not lead with: unreleased product sold ahead of its release (a pre-sale price is a guess, and
// the product is not in the shops yet), "read the description" condition notes, dented/damaged boxes, and eBay Live stream lots.
const SEALED_NOISE = /\bpre[\s-]?(?:sales?|orders?)\b|\bpresales?\b|\b(?:read|see|check)\s+(?:the\s+)?desc(?:ription)?\b|\bdents?\b|\bdented\b|\bdamaged\b|\bdmg\b|\[\s*ebay\s+live\s*\]|\bebay\s+live\b|\bas[\s-]is\b|\bopen(?:ed)?\s+box\b/i;

/** The listing's identity if the repo's classifier accepts it as sealed Pokémon product (Pokémon named: strict) and it is ONE unit, else null. */
export function sealedIdentity(title: string, strict: boolean) {
  if (SEALED_NOISE.test(title)) return null;
  const id = identify(title, { strict });
  return isIdentity(id) && !multiUnit(title, id.type) ? id : null;
}

/** A listing for the generic sealed feed: the classifier accepts it, the type is one of SEALED_FEED_TYPES, and its price clears that type's floor. */
export function normaliseSealed(raw: unknown, marketplace: MarketplaceId, now: number): FeedItem | null {
  const it = baseItem(raw, marketplace, now, "sealed");
  if (!it) return null;
  const id = sealedIdentity(it.title, true);
  if (!id || !SEALED_FEED_TYPES.has(id.type)) return null;
  if (Number(it.price.value) < typeFloor(id.type, marketplace)) return null;
  return it;
}

/** A listing for a type's feed: the classifier says exactly that type, at or over its floor. */
export function normaliseType(raw: unknown, marketplace: MarketplaceId, now: number, type: TypeKey): FeedItem | null {
  const it = baseItem(raw, marketplace, now, "type");
  if (!it) return null;
  const id = sealedIdentity(it.title, true);
  if (!id || id.type !== type) return null;
  if (Number(it.price.value) < typeFloor(type, marketplace)) return null;
  return it;
}

// ─── One product ───────────────────────────────────────────────────────────────

export interface ItemTarget {
  groupKey: string;
  type: TypeKey;
  setCode: string | null;
}

// Words eBay sellers add that say nothing about WHICH product it is (after the classifier's own NOISE list).
export const EBAY_NOISE = new Set("fast usa tracked nib mint hot cheap bargain great gift gifts hobby collectible collectable collectibles trusted".split(" "));

export function groupParts(key: string): { type: string; set: string; tokens: string[] } | null {
  const p = key.split("|");
  if (p.length === 2) return { type: p[1], set: p[0], tokens: [] }; // "<set>|<type>"
  if (p.length === 3) return { type: p[0], set: p[1], tokens: p[2] ? p[2].split("-") : [] }; // "<type>|<set or ->|<tokens>"
  return null; // "upc|<key>" and anything else: exact match only
}

/**
 * Is this listing title the product? The repo's classifier must accept it, and:
 *   • a SET product (booster box, ETB…): the same set and the same type (the group key is exactly that);
 *   • any other: the same group key, or the same type and set whose identifying words the listing contains,
 *     with nothing extra but eBay seller filler ("fast", "usa", "nib"…). A cheaper or different product
 *     ("Mini Tin" for "Tin"), a single, a case, a lot, an empty or opened box, another language: refused by identify().
 */
export function relevantToProduct(title: string, p: ItemTarget): boolean {
  const id = sealedIdentity(title, false);
  if (!id) return false;
  if (id.type !== p.type) return false;
  if (id.groupKey === p.groupKey) return true;
  const kind = TYPE_BY_KEY.get(p.type)?.kind;
  if (kind === "set") return false; // set products are fully identified by set + type: a different key is a different product
  const a = groupParts(id.groupKey);
  const b = groupParts(p.groupKey);
  if (!a || !b || a.type !== b.type || a.set !== b.set) return false;
  const have = new Set(a.tokens);
  if (!b.tokens.every((t) => have.has(t))) return false;
  const want = new Set(b.tokens);
  return a.tokens.filter((t) => !want.has(t)).every((t) => EBAY_NOISE.has(t));
}

/** A listing for one product's item feed. `floor` is the type's floor in the marketplace's currency. */
export function normaliseItemFeed(raw: unknown, marketplace: MarketplaceId, now: number, target: ItemTarget): FeedItem | null {
  const it = baseItem(raw, marketplace, now, "item");
  if (!it || refusedListing(it.title) || refusedForType(it.title, target.type) || !relevantToProduct(it.title, target)) return null;
  if (Number(it.price.value) < typeFloor(target.type, marketplace)) return null;
  return it;
}

// ─── Selecting a feed's rows ───────────────────────────────────────────────────

/**
 * The feed's rows from each query's normalised list: taken ROUND-ROBIN (first of each query, second of each, …) so one
 * query cannot fill the strip, skipping a repeated item id or photo, up to `max`.
 */
export function roundRobin(lists: readonly (readonly FeedItem[])[], max: number): FeedItem[] {
  const out: FeedItem[] = [];
  const ids = new Set<string>();
  const photos = new Set<string>();
  for (let round = 0; out.length < max; round++) {
    let any = false;
    for (const list of lists) {
      if (round >= list.length) continue;
      any = true;
      const it = list[round];
      const key = imageKey(it.imageUrl);
      if (ids.has(it.id) || photos.has(key)) continue;
      ids.add(it.id);
      photos.add(key);
      out.push(it);
      if (out.length >= max) break;
    }
    if (!any) break;
  }
  return out;
}

/** An item feed: de-duplicated (id, photo), LOWEST PRICE FIRST (a neutral order: the strip says "before shipping"), at most `max`. */
export function lowestPriceFirst(items: readonly FeedItem[], max: number): FeedItem[] {
  const seenId = new Set<string>();
  const seenPhoto = new Set<string>();
  const unique: FeedItem[] = [];
  for (const it of items) {
    const k = imageKey(it.imageUrl);
    if (seenId.has(it.id) || seenPhoto.has(k)) continue;
    seenId.add(it.id);
    seenPhoto.add(k);
    unique.push(it);
  }
  return unique.sort((a, b) => Number(a.price.value) - Number(b.price.value) || a.id.localeCompare(b.id)).slice(0, max);
}
