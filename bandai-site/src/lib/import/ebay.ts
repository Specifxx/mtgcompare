// eBay Browse API: the cheapest live Buy It Now listing for the products worth
// a call.
//
// THE BUDGET. One eBay developer app (5,000 Browse calls a day) is shared by
// Lorcana Compare, Gundam Compare and YGO Compare: SITE.ebay.dailyBudget each,
// 4,500 in all, leaving 500 spare (1,500 each from the owner's 2026-10-26
// split; since 2026-10-28 Lorcana and Gundam 1,150, YGO 2,200). Cyberpunk
// Compare runs the same code on its own app (owner, 2026-11-01). The
// app's remaining count (Developer Analytics API, free) is shared too, so each
// site also keeps ITS OWN count in data/state/ebay-usage.json and stops at its
// share, whichever limit comes first. The sites run at different hours
// (SITE.ebay.runHourUtc: Lorcana 06, YGO 12, Gundam 18 UTC) so none starves
// another mid-run.
//
// WHAT GETS A CALL (planEbayRefresh, pure and tested):
//   1. Every sealed product, whatever its price (pre-orders with no TCGplayer
//      price included), and every card the market prices at
//      SITE.ebay.minPriceUsd ($10) or more. Under that a buyer saves cents.
//      (Owner, 2026-10-25: $20 → $10, and all sealed.)
//   2. Each eligible product has a refresh interval set by value: $100+ daily,
//      $50–100 every 2 days, $20–50 every 4 days. Demand (affiliate clicks in
//      the last 30 days), chase rarities, booster boxes and new or upcoming
//      sets shorten it.
//   3. Products that are due are ranked by value × demand × how overdue they
//      are, and the budget is spent from the top. Anything left over refreshes
//      not-yet-due products in the same order.
//   4. A share of the budget goes to the UK and Australian eBay sites, for the
//      highest-ranked products only.
//   5. The US comes first (owner, 2026-11-01): its calls are planned and run
//      before any other market's, so a quota stop mid-run cuts the UK and
//      Australia, never the US, and any slots the other markets leave unused
//      go back to the US's next-ranked products.
import { ebayQueryOf } from "@/lib/lines";
import { SITE } from "@/site.config";
import { EBAY_CAMPAIGN_ID } from "@/lib/affiliate";
import type { Market, Offer, Product, SetInfo } from "@/lib/site-types";
import { hasEditions, markersAgree, numbersInTitle, printingOf, rarityAgrees, rarityPatterns, titleEdition } from "./match";
import { tokens } from "@/lib/slug";
import { sealedTypeOf } from "./tcgcsv";
import { shortName } from "@/lib/names";

// Local sellers only (visitor feedback on WargameCompare, 2026-10-31: overseas sellers' postage made "a lot of wasted
// clicks"): `country` limits the search to items located in and delivered to the market's own country, and `zip` (a
// central postcode) lets eBay quote real postage there. A listing whose postage eBay does not state is never kept.
export const MARKETPLACE: Partial<Record<Market, { id: string; currency: string; country: string; zip: string }>> = {
  US: { id: "EBAY_US", currency: "USD", country: "US", zip: "64101" },
  UK: { id: "EBAY_GB", currency: "GBP", country: "GB", zip: "B1 1AA" },
  AU: { id: "EBAY_AU", currency: "AUD", country: "AU", zip: "2000" },
  CA: { id: "EBAY_CA", currency: "CAD", country: "CA", zip: "M5V 2T6" },
};

/** The Browse filter: Buy It Now, in the price window when there is one, from a seller in the market's own country. */
export function searchFilter(market: Market, ref: number | null): string {
  const mp = MARKETPLACE[market]!;
  return [
    "buyingOptions:{FIXED_PRICE}",
    ...(ref == null ? [] : [`price:[${Math.max(1, Math.floor(ref * 0.5))}..${Math.ceil(ref * 3)}]`, `priceCurrency:${mp.currency}`]),
    `itemLocationCountry:${mp.country}`,
    `deliveryCountry:${mp.country}`,
  ].join(",");
}

/** The end-user context: our campaign and sub-id, and the buyer's location so eBay quotes postage to it. */
export function endUserContext(market: Market, reference: string): string {
  const mp = MARKETPLACE[market]!;
  return `affiliateCampaignId=${EBAY_CAMPAIGN_ID},affiliateReferenceId=${reference},contextualLocation=${encodeURIComponent(`country=${mp.country},zip=${mp.zip}`)}`;
}

/** Share of the daily budget per eBay site. */
export const MARKET_SHARE: Partial<Record<Market, number>> = { US: 0.75, UK: 0.125, AU: 0.125 };

export interface EbayStateEntry {
  at: string; // last checked
  offer: Offer | null;
}
/** productId → market → last result */
export type EbayState = Record<string, Partial<Record<Market, EbayStateEntry>>>;

export interface PlanInput {
  products: Product[];
  refUsdCents: Map<number, number | null>;
  clicks30d: Map<number, number>;
  newSetIds: Set<number>;
  state: EbayState;
  budget: number;
  now: Date;
}

export interface PlannedCall {
  product: Product;
  market: Market;
  score: number;
  due: boolean;
}

export function intervalHours(usd: number, clicks: number, boosted: boolean): number {
  let h = usd >= 100 ? 24 : usd >= 50 ? 48 : 96;
  if (clicks >= 10) h = Math.min(h, 24);
  else if (clicks >= 3) h = Math.min(h, 48);
  if (boosted) h = Math.max(24, h / 2);
  return h;
}

export function planEbayRefresh(input: PlanInput): { calls: PlannedCall[]; eligible: number } {
  const minCents = SITE.ebay.minPriceUsd * 100;
  const ranked: { product: Product; score: number; interval: number }[] = [];
  for (const p of input.products) {
    const known = input.refUsdCents.get(p.id);
    if (p.kind === "card" && (known == null || known < minCents)) continue;
    if (p.kind === "sealed" && p.sealedType === "Insert") continue;
    // Sealed with no market price yet (pre-orders) ranks as a $50 product.
    const ref = known ?? 5000;
    const clicks = input.clicks30d.get(p.id) ?? 0;
    const chase = !!p.rarity && SITE.chaseRarities.includes(p.rarity);
    const box = p.kind === "sealed" && /Booster Box|Case|Trove/.test(p.sealedType ?? "");
    const fresh = input.newSetIds.has(p.setId);
    const boosted = chase || box || fresh;
    const value = Math.log10(ref / 100);
    const demand = 1 + Math.log2(1 + clicks);
    const boost = (chase ? 1.3 : 1) * (box ? 1.4 : 1) * (fresh ? 1.5 : 1);
    // Sealed refreshes at least every two days, whatever its price.
    const interval = p.kind === "sealed" ? Math.min(48, intervalHours(ref / 100, clicks, boosted)) : intervalHours(ref / 100, clicks, boosted);
    ranked.push({ product: p, score: Math.max(0.5, value) * demand * boost, interval });
  }
  ranked.sort((a, b) => b.score - a.score);

  const calls: PlannedCall[] = [];
  const usLeft: PlannedCall[] = [];
  // The US first, whatever order MARKET_SHARE is written in.
  const markets = (Object.entries(MARKET_SHARE) as [Market, number][]).sort((a, b) => Number(b[0] === "US") - Number(a[0] === "US"));
  for (const [market, share] of markets) {
    const slots = Math.floor(input.budget * share);
    // Secondary markets only look at the top of the ranking.
    const pool = market === "US" ? ranked : ranked.slice(0, Math.max(slots * 2, 50));
    const withAge = pool.map((r) => {
      const last = input.state[r.product.id]?.[market]?.at;
      const ageH = last ? (input.now.getTime() - new Date(last).getTime()) / 3_600_000 : Infinity;
      const overdue = Math.min(3, ageH / r.interval);
      return { ...r, due: ageH >= r.interval, priority: r.score * (Number.isFinite(overdue) ? overdue : 3) };
    });
    withAge.sort((a, b) => Number(b.due) - Number(a.due) || b.priority - a.priority);
    withAge.forEach((r, i) => {
      // A not-due product checked in the last 12 hours is never worth a call.
      const last = input.state[r.product.id]?.[market]?.at;
      if (!r.due && last && input.now.getTime() - new Date(last).getTime() < 12 * 3_600_000) return;
      const call = { product: r.product, market, score: r.priority, due: r.due };
      if (i < slots) calls.push(call);
      else if (market === "US") usLeft.push(call);
    });
  }
  // Slots the other markets could not use go to the US's next-ranked products,
  // planned right after the US's own share so they run before the UK and AU.
  const spare = Math.max(0, input.budget - calls.length);
  if (spare && usLeft.length) {
    const usCount = calls.filter((c) => c.market === "US").length;
    calls.splice(usCount, 0, ...usLeft.slice(0, spare));
  }
  return { calls, eligible: ranked.length };
}

// ── API ─────────────────────────────────────────────────────────────────────

export function ebayCredentials(): { id: string; secret: string } | null {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export async function ebayToken(): Promise<string> {
  const c = ebayCredentials();
  if (!c) throw new Error("EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) throw new Error(`eBay token: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** The app's remaining Browse calls today (shared by both sites), or null. */
export async function ebayRemaining(token: string): Promise<number | null> {
  try {
    const res = await fetch(
      "https://api.ebay.com/developer/analytics/v1_beta/rate_limit/?api_name=browse&api_context=buy",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      rateLimits?: { resources?: { name: string; rates?: { remaining: number }[] }[] }[];
    };
    for (const rl of d.rateLimits ?? [])
      for (const r of rl.resources ?? []) if (/item_summary|buy\.browse$/.test(r.name)) return r.rates?.[0]?.remaining ?? null;
    return null;
  } catch {
    return null;
  }
}

export interface ItemSummary {
  title: string;
  price?: { value: string; currency: string };
  shippingOptions?: { shippingCost?: { value: string; currency?: string } }[];
  itemLocation?: { country?: string };
  itemWebUrl: string;
  itemAffiliateWebUrl?: string;
  buyingOptions?: string[];
  condition?: string;
  categories?: { categoryId: string }[];
}

const JUNK = /\b(proxy|custom|orica|fan ?made|replica|lot of|lot|set of \d+|bundle of \d+|choose|pick|you pick|select|playset|x[2-9]|[2-9]x|graded|slab|gem ?mint|misprint|miscut|crimped|empty|opened|digital|code card|sleeve|sleeves|playmat|binder|deck box)\b/i;
// Graded copies: "PSA 10", "PSA10", "P SA10", "BGS 9.5", "CGC", "TAG 10", "ACE 10".
const GRADED = /\b(p\s?sa|bgs|cgc|tag|ace|sgc|beckett)\s?-?\d{1,2}(\.5)?\b|\b(psa|bgs|cgc|beckett|sgc)\b/i;
// Non-English copies, in the ways sellers write them.
const FOREIGN_LISTING = /\b(japanese|japan|jpn|jp|ja|chinese|simplified chinese|traditional chinese|korean|french|german|deutsch|italian|italiano|spanish|español|portuguese|asia|asian)\b|\(jp\)|\[jp\]|日本|中文/i;

// SITE.setEditions (Cyberpunk TCG's Beta and Retail): each set's edition
// word, filled by useSetEditions() before a pass. Empty for other games.
const setEdition = new Map<number, string>();
// Multi-game sites (SITE.lines): each set's game, for its eBay search words.
const setLine = new Map<number, SetInfo>();
export function useSetEditions(sets: SetInfo[]): void {
  setEdition.clear();
  setLine.clear();
  for (const s of sets) if (s.line) setLine.set(s.id, s);
  const words = new Set((SITE.setEditions ?? []).map((e) => e.word));
  if (!words.size) return;
  for (const s of sets) {
    const w = tokens(s.name).find((t) => words.has(t));
    if (w) setEdition.set(s.id, w);
  }
}
export const editionOfProduct = (p: Product): string | null => setEdition.get(p.setId) ?? null;

export function queryFor(p: Product): string {
  // Variant words in parentheses ("(LR+)", "(Enchanted)") are left out: sellers
  // word them differently, and listingMatches() tells the variants apart.
  let name = shortName(p.name).replace(/\([^)]*\)/g, " ").replace(/[[\]:,]/g, " ").replace(/['’]/g, "");
  // The default edition goes unnamed by most sellers ("Booster Box", not
  // "Retail Booster Box"); any other edition is named in the search.
  const ed = editionOfProduct(p);
  const def = SITE.setEditions?.find((e) => e.word === ed);
  if (ed) name = name.replace(new RegExp(`\\b${ed}\\b`, "ig"), " ");
  const edWord = ed && !def?.default ? ed : "";
  return `${ebayQueryOf(setLine.get(p.setId))} ${name} ${edWord} ${p.kind === "card" ? p.number ?? "" : ""}`.replace(/\s+/g, " ").trim();
}

// Bracketed qualifiers name a specific version: "(Store Tournament Winner
// Pack 01)", "(SDCC 2026)", "(Disney Cruise Promo)", "(Trans-Am)". At least
// half of their words must be in the listing, or a participation card (or a
// magazine promo) takes the winner card's price. Card numbers, rarity markers
// and finish words don't count; markersAgree() handles rarities.
const QUAL_SKIP = new Set(["foil", "holo", "holofoil", "cold", "enchanted", "iconic", "epic", "promo", "alt", "art", "parallel", "sp", "the", "of", "and", "a"]);
const ABBREV: Record<string, string[]> = { ntc: ["newtype", "challenge"], wcs: ["world", "championship"], wc: ["world", "championship"], stw: ["store", "tournament", "winner"] };
export function qualifiersAgree(productName: string, title: Set<string>, rarity: string | null = null): boolean {
  const have = new Set(title);
  for (const t of title) for (const w of ABBREV[t] ?? []) have.add(w);
  for (const m of productName.matchAll(/\(([^)]*)\)/g)) {
    // "(Quarter Century Secret Rare)" or "(PCR)" is the rarity itself: rarityAgrees() judges it.
    const q = m[1].trim().toLowerCase();
    if (rarity && (q === rarity.toLowerCase() || (SITE.rarityAliases?.[rarity] ?? []).some((a) => a.toLowerCase() === q))) continue;
    // Pure numbers ("2026", "Pack 01", "Season 1") vary in how sellers write
    // them, so only words count.
    const words = tokens(m[1]).filter((t) => !QUAL_SKIP.has(t) && !/\d/.test(t) && !/^(lr|r|u|c)\+*$/.test(t) && !/\+/.test(t));
    if (!words.length) continue;
    if (words.filter((w) => have.has(w)).length / words.length < 0.5) return false;
  }
  return true;
}

let rarities: ReturnType<typeof rarityPatterns> | null | undefined;
const sellerRarities = () =>
  rarities === undefined ? (rarities = SITE.rarityMustAgree ? rarityPatterns(SITE.rarityOrder, SITE.rarityAliases) : null) : rarities;

/** Does an eBay listing title describe this product? */
export function listingMatches(p: Product, title: string): boolean {
  if (GRADED.test(title) || FOREIGN_LISTING.test(title)) return false;
  // A Beta box listing is never a Retail box's price, nor the other way round.
  const ed = editionOfProduct(p);
  if (ed && SITE.setEditions && titleEdition(title, SITE.setEditions) !== ed) return false;
  if (JUNK.test(title) && !(p.kind === "sealed" && /\bcase\b/i.test(p.name) && /\bcase\b/i.test(title) && !/sleeve|deck box|playmat/i.test(title)))
    return false;
  const have = new Set(tokens(title));
  if (p.kind === "card") {
    if (!p.number) return false;
    const nums = numbersInTitle(title, SITE.numberStyle);
    const want = numbersInTitle(p.number, SITE.numberStyle)[0] ?? p.number.toUpperCase();
    // Lorcana sellers often write only "207" — accept "#207" or " 207 " when the
    // set's total is absent, but never a different fraction.
    const bare = SITE.numberStyle === "fraction" ? p.number.split("/")[0] : null;
    // Promos are numbered "14" on TCGplayer and "14/P3", "14/D23" or "6/CC1"
    // by sellers: for a product number with no total, any fraction with the
    // same numerator counts.
    const promoStyle = SITE.numberStyle === "fraction" && !p.number.includes("/");
    const numOk = nums.length
      ? nums.includes(want) || (promoStyle && nums.some((n) => parseInt(n, 10) === parseInt(p.number!, 10)))
      : !!bare && new RegExp(`(^|[#\\s])0*${bare}($|\\s)`).test(title);
    if (!numOk) return false;
    // A title naming a second number ("MFC-000 ... YSYR-EN011") is a reprint
    // or a lot, and either way not certainly this printing.
    const same = (n: string) => n === want || (promoStyle && parseInt(n, 10) === parseInt(p.number!, 10));
    if (nums.some((n) => !same(n))) return false;
    const base = tokens(p.name.replace(/\([^)]*\)/g, " ")).filter((t) => t.length > 1);
    const ok = base.filter((t) => have.has(t)).length / Math.max(1, base.length);
    return ok >= 0.6 && markersAgree(p.name, p.rarity, title) && rarityAgrees(p, title, sellerRarities()) && qualifiersAgree(p.name, have, p.rarity);
  }
  if (p.sealedType === "Insert") return false;
  // A card number in the title is a single. So is a bare set code with no
  // product word: "Evil Box Magnificent Maestros MAMS-EN" is a pre-order single,
  // "Order Of Chaos Booster Box : ORCS-EN" is the box.
  if (numbersInTitle(title, SITE.numberStyle).length) return false;
  if (/\b[A-Z0-9]{2,5}-EN(?![A-Z0-9])/.test(title) && !/booster|display|\btins?\b|deck|\bcase\b|\bpacks?\b/i.test(title)) return false;
  if (sealedTypeOf(title) !== sealedTypeOf(p.name)) return false;
  // "Deck ONLY - no bonus pack" is the opposite of a bonus-pack product.
  if (/bonus/i.test(p.name) && /\b(no|without|minus)\s+bonus|deck only|only deck/i.test(title)) return false;
  // "Booster Boxes" / "Packs" / "Decks" count as the singular.
  const sing = (t: string) => t.replace(/xes$/, "x").replace(/s$/, "");
  const haveS = new Set([...have].map(sing));
  const need = tokens(shortName(p.name)).filter((t) => t.length > 1 && !["disney", "the", "of"].includes(t) && t !== ed);
  return need.filter((t) => haveS.has(sing(t))).length / Math.max(1, need.length) >= 0.8;
}

export async function searchLowest(
  token: string,
  p: Product,
  market: Market,
  refUsdCents: number | null,
  fxUsd: number,
): Promise<Offer | null> {
  const mp = MARKETPLACE[market];
  if (!mp) return null;
  // No market price yet (a pre-order): no price window, the matcher decides.
  const ref = refUsdCents == null ? null : (refUsdCents / 100) * fxUsd; // in the marketplace currency
  const params = new URLSearchParams({
    q: queryFor(p),
    // Sealed searches the whole Collectible Card Games category (2536): cases,
    // decks, tins and gift sets are listed outside "Sealed Booster Boxes", and
    // listingMatches() decides what counts.
    category_ids: p.kind === "card" ? SITE.ebay.singlesCategoryId : "2536",
    // Under half of market is far likelier a fake, a damaged or foreign copy
    // than a real bargain on a card this valuable.
    filter: searchFilter(market, ref),
    sort: "price",
    limit: "25",
  });
  const res = await fetch(`https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": mp.id,
      "X-EBAY-C-ENDUSERCTX": endUserContext(market, `${SITE.key}-${p.id}`),
    },
  });
  if (res.status === 429) throw Object.assign(new Error("eBay quota exhausted (429)"), { quota: true });
  if (!res.ok) throw new Error(`eBay search ${res.status}`);
  const d = (await res.json()) as { itemSummaries?: ItemSummary[] };
  return pickBest(p, market, d.itemSummaries ?? []);
}

/**
 * The cheapest delivered listing (item + postage) of one search: a local seller's (the search asks for them; a listing
 * that says it is elsewhere is skipped), and only with postage eBay states, so the row never hides a postage cost.
 */
export function pickBest(p: Product, market: Market, items: ItemSummary[]): Offer | null {
  const mp = MARKETPLACE[market];
  if (!mp) return null;
  let best: Offer | null = null;
  for (const it of items) {
    if (!it.price || it.price.currency !== mp.currency) continue;
    if (it.itemLocation?.country && it.itemLocation.country !== mp.country) continue;
    const shipCost = it.shippingOptions?.[0]?.shippingCost;
    if (!shipCost || shipCost.value == null || (shipCost.currency && shipCost.currency !== mp.currency)) continue;
    const shippingCents = Math.round(Number(shipCost.value) * 100);
    if (!Number.isFinite(shippingCents) || shippingCents < 0) continue;
    if (!listingMatches(p, it.title)) continue;
    // A sealed product never comes from the singles category: a pre-order
    // single titled "... Box ..." is still one card.
    if (p.kind === "sealed" && it.categories?.some((c) => c.categoryId === SITE.ebay.singlesCategoryId)) continue;
    const cents = Math.round(Number(it.price.value) * 100);
    const total = cents + shippingCents;
    if (!best || total < best.cents + (best.shippingCents ?? 0)) {
      best = {
        source: "ebay",
        market,
        currency: mp.currency,
        cents,
        shippingCents,
        inStock: true,
        url: it.itemAffiliateWebUrl || it.itemWebUrl,
        title: it.title,
        // Editions (1st / Unlimited) are told apart only where TCGplayer prices them.
        printing: p.kind === "card" && hasEditions(p.printings) ? printingOf(it.title, "", p.printings) : undefined,
      };
    }
  }
  return best;
}
