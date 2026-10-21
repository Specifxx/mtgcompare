// The pre-order page's words that are built from facts: its <title> and description, the "release date at a glance" box, the US
// per-pack list prices and the FAQ (with its FAQPage JSON-LD). Facts come from lib/preorder-guides.ts (sourced and dated), dates
// from lib/sets.ts, pack counts from lib/packs.ts and US MSRP from lib/rrp.ts (US page only); the only live numbers are the page's
// own cheapest pre-orders, passed in. Pure (no database, no React), so tests/preorders.test.ts reads every sentence.
import { money, plural } from "./format";
import { hubTitle, type HubTitle } from "./hub-copy";
import { packsFor, packsForLabel, perPackCents } from "./packs";
import { guideShowsMsrp, type PreorderGuide } from "./preorder-guides";
import { formatRelease } from "./release";
import { REGION_LIST, type RegionInfo } from "./regions";
import { usMsrpCents } from "./rrp";
import { offerStock, rankOffers, type SealedOffer } from "./sealed-offers";
import { TYPE_BY_LABEL, type TypeKey } from "./sealed-title";
import type { MtgSet as MtgSet } from "./sets";

type R = Pick<RegionInfo, "market" | "inName" | "adjective" | "currency">;

/** "6 November": a date in a sentence that already says the year. */
export function dayMonth(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/**
 * The <title>: the pre-order prices the page is for, and the release date people search for ("delta reign release date"). Before
 * release only; from release day the page is noindexed and says the set is out.
 */
export function preorderTitle(set: Pick<MtgSet, "name">, r: R, pre: boolean): HubTitle {
  return hubTitle(pre ? `${set.name} pre-orders in ${r.inName}: prices & release date` : `${set.name} released: sealed prices in ${r.inName}`);
}

/** The meta description: the dates first (the answer to the search), then what the page compares. At most 160 characters. */
export function preorderDescription(set: Pick<MtgSet, "name" | "releaseDate">, guide: Pick<PreorderGuide, "prereleaseFrom">, r: R, pre: boolean): string {
  if (!pre) return `MTG ${set.name} released on ${formatRelease(set.releaseDate)}. See live ${set.name} sealed prices across ${r.adjective} stores.`;
  const prerelease = guide.prereleaseFrom ? `, prerelease from ${dayMonth(guide.prereleaseFrom)}` : "";
  return `MTG ${set.name} is out ${formatRelease(set.releaseDate)}${prerelease}. Compare booster box, bundle and Commander deck pre-orders at ${r.adjective} stores, in ${r.currency}.`;
}

/** One line of the "at a glance" box: what, the date (ISO, when it is one) or the value, and a note under it. */
export interface GlanceFact {
  key: string;
  label: string;
  iso?: string;
  value?: string;
  note?: string;
}

/** The release date, the prerelease, MTG Arena and (when Wizards has said) the set's size, from the guide and sets.ts: the box under the H1. */
export function glanceFacts(set: Pick<MtgSet, "releaseDate">, guide: PreorderGuide): GlanceFact[] {
  const out: GlanceFact[] = [{ key: "release", label: "Release date (English)", iso: set.releaseDate }];
  if (guide.prereleaseFrom) {
    out.push({
      key: "prerelease",
      label: "Prerelease events from",
      iso: guide.prereleaseFrom,
      note: guide.products.some((p) => p.type === "prerelease-pack") ? "Played with the set's Prerelease Packs, at participating stores" : undefined,
    });
  }
  if (guide.liveDate) out.push({ key: "live", label: "MTG Arena", iso: guide.liveDate });
  if (guide.cardCount) out.push({ key: "cards", label: "Set size", value: guide.cardCount.replace(/^./, (c) => c.toUpperCase()), note: guide.headliners.length ? `Headlined by ${guide.headliners[0]}` : undefined });
  return out;
}

/** A product's US list price and what a pack works out to at it (US only). */
export interface MsrpPack {
  type: TypeKey;
  cents: number;
  packs: number;
  perPack: number;
}

/** What each pack costs at US MSRP in the products whose contents (and so pack count) are confirmed. */
// The Play Booster products only: a Collector Booster is a different pack, and a mixed product (Gift Bundle, Draft Night) has no
// honest per-pack price. Wizards publishes no display MSRP, so the box is the single pack's MSRP (rrp.ts has no box entry).
const VALUE_TYPES: readonly TypeKey[] = ["play-booster", "bundle"];
const VALUE_NAME: Partial<Record<TypeKey, string>> = { "play-booster": "a single Play Booster", bundle: "the Bundle" };

/**
 * US only: the single Play Booster and the Bundle at MSRP (rrp.ts) and per pack (packs.ts), for the guide's products that print an
 * MSRP. Empty outside the US.
 */
export function msrpPerPack(set: Pick<MtgSet, "code">, guide: PreorderGuide, r: Pick<RegionInfo, "market">): MsrpPack[] {
  if (r.market !== "US") return [];
  const out: MsrpPack[] = [];
  for (const type of VALUE_TYPES) {
    if (!guide.products.some((p) => p.type === type) || !guideShowsMsrp(guide, type)) continue;
    const cents = usMsrpCents(type, set.code);
    const packs = packsFor(type, set.code);
    const perPack = perPackCents(cents, packs);
    if (cents != null && packs != null && perPack != null) out.push({ type, cents, packs, perPack });
  }
  return out;
}

/** "At US MSRP a pack costs $6.99 in a single Play Booster, and $7.78 in the Bundle." Null without two rows. */
export function msrpValueSentence(rows: readonly MsrpPack[]): string | null {
  if (rows.length < 2) return null;
  const groups = new Map<number, string[]>();
  for (const row of [...rows].sort((a, b) => a.perPack - b.perPack)) groups.set(row.perPack, [...(groups.get(row.perPack) ?? []), VALUE_NAME[row.type] ?? row.type]);
  const parts = [...groups].map(([cents, names]) => `${money(cents, "US")} in ${names.join(" and ")}`);
  const extra = rows.some((x) => x.type === "bundle") ? " The Bundle’s price also covers its lands, promo card and storage box." : "";
  return `At US MSRP a pack costs ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? ", and " : ""}${parts[parts.length - 1]}.${extra}`;
}

/** The page's own cheapest open pre-order of a product type, in the region's currency (cents), from the price lists it renders. */
export type CheapestByType = Partial<Record<TypeKey, number>>;

export interface Faq {
  q: string;
  a: string;
}

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

/** The FAQ, in the order the page shows it; the same list goes out as FAQPage JSON-LD. */
export function preorderFaqs(set: Pick<MtgSet, "code" | "name" | "releaseDate">, guide: PreorderGuide, r: R, cheapest: CheapestByType, pre: boolean): Faq[] {
  const us = r.market === "US";
  const packMsrp = us && guideShowsMsrp(guide, "play-booster") ? usMsrpCents("play-booster", set.code) : null;
  const bundleMsrp = us && guideShowsMsrp(guide, "bundle") ? usMsrpCents("bundle", set.code) : null;
  const bundle = guide.products.find((p) => p.type === "bundle");
  const prerelease = guide.products.find((p) => p.type === "prerelease-pack");
  const decks = guide.products.find((p) => p.type === "commander-deck");
  const live = (type: TypeKey, what: string) => {
    const c = cheapest[type];
    if (!pre) return "";
    return c != null
      ? ` The cheapest ${set.name} ${what} pre-order on this page is ${money(c, r.market)} right now.`
      : ` No ${r.adjective} store we track has the ${what} open for pre-order right now.`;
  };
  const dates = [
    guide.prereleaseFrom ? `Prerelease events at participating stores ${pre ? "start" : "started"} ${formatRelease(guide.prereleaseFrom)}` : null,
    guide.liveDate ? `MTG Arena ${pre ? "gets" : "got"} the set on ${formatRelease(guide.liveDate)}` : null,
  ].filter((x): x is string => !!x);

  const faqs: Faq[] = [
    {
      q: `What is the MTG ${set.name} release date?`,
      a: `${set.name} ${pre ? "releases" : "released"} on ${formatRelease(set.releaseDate)}, per Wizards of the Coast.${dates.length ? ` ${dates.join(", and ")}.` : ""}${pre ? " Stores may ship pre-orders a few days either side of the street date." : ""}`,
    },
  ];
  if (guide.prereleaseFrom && prerelease) {
    faqs.push({
      q: `When is the ${set.name} prerelease, and what is in the Prerelease Pack?`,
      a: `Prerelease events ${pre ? "start" : "started"} ${formatRelease(guide.prereleaseFrom)} at participating stores, played with the set’s Prerelease Pack: ${prerelease.contents.replace(/:.*$/, "")}.`,
    });
  }
  const packs = packsFor("play-booster-box", set.code);
  faqs.push({
    q: `How much does a ${set.name} Play Booster Box cost to pre-order?`,
    a: `Each store sets its own pre-order price, and they differ more before release than at any other time, because nothing has shipped and every store is picking an opening number. This page lists every ${r.adjective} store we track that is taking ${set.name} pre-orders, cheapest first, in ${r.currency}.${live("play-booster-box", "Play Booster Box")}${packMsrp ? ` Wizards of the Coast's US list price for a single Play Booster is ${money(packMsrp, "US")}${packs ? `, and the display holds ${packs}` : ""}; it publishes none for the display.` : ""}`,
  });
  if (bundle) {
    faqs.push({
      q: `How much is the ${set.name} Bundle?`,
      a: `${
        bundleMsrp
          ? `Its US MSRP is ${money(bundleMsrp, "US")} (Wizards of the Coast's announced list price; stores set their own).`
          : `Wizards of the Coast publishes no list price outside the US, so ${r.adjective} stores set their own.`
      }${live("bundle", "Bundle")}`,
    });
  }
  if (decks) faqs.push({ q: `What are the ${set.name} Commander decks?`, a: `${cap(decks.contents)}, as Wizards of the Coast announced them.${live("commander-deck", "Commander deck")}` });
  faqs.push(
    {
      q: "Is it cheaper to pre-order or to wait until release?",
      a: "It depends what you want. Sealed product usually sits at or near its list price during pre-orders and can climb at launch if demand outruns a store's allocation; single cards are almost always cheapest a few weeks after release, once supply settles. If you want to open product, pre-ordering at a fair price is reasonable; if you want particular cards, waiting for singles is usually cheaper.",
    },
    {
      q: "Are pre-order prices final?",
      a: "No. A pre-order price is what the store asks today, and stores change them before release, up or down, as their allocation firms up; a store can also cut or delay an allocation. We read the stores about twice a day, and nothing here is a promise from the store or from us. Confirm the price and the store's pre-order terms at checkout.",
    },
  );
  if (bundle) faqs.push({ q: `What comes in the ${set.name} Bundle?`, a: `${cap(bundle.contents)}, as Wizards of the Coast announced it for the set.` });
  faqs.push(
    {
      q: `Is ${set.name} a real set?`,
      a: `Yes. Wizards of the Coast announced ${guide.fullName}${guide.cardCount ? `, a set of ${guide.cardCount}` : ""}${guide.headliners.length ? ` headlined by ${guide.headliners[0]}` : ""}, for release on ${formatRelease(set.releaseDate)}.`,
    },
    {
      q: "Do these prices include shipping?",
      a: "No. They are each store's listed item price in its own currency. A sealed box ships as a parcel, so check the store's checkout for postage before comparing two close prices.",
    },
  );
  return faqs;
}

// ─── The stores, ranked, and the summary strip (2026-10-16, the owner: "make sure the eBay links stay at the very top, alongside the
// TCG ones, and everything else is priced in order") ───────────────────────────────────────────────────────────────────────────

/** What the page needs of one offer (an OfferView). */
export type PreorderOffer = SealedOffer & { store: string; storeName: string; marketplace: boolean };

/** What the page needs of one product's price list (a SetOfferGroup). */
export interface PreorderGroup<O extends PreorderOffer = PreorderOffer> {
  product: { name: string; productType: string; setCode: string | null };
  offers: O[];
}

/**
 * A product's STORES, ranked: open pre-orders first, cheapest first, then sold out and not checked. TCGplayer is never among them: a
 * marketplace sits in the pinned marketplace rows above the stores, unnumbered and unranked.
 */
export function storeOffers<O extends PreorderOffer>(offers: readonly O[], now: number = Date.now()): O[] {
  return rankOffers(
    offers.filter((o) => !o.marketplace),
    now,
  );
}

/** The cheapest open STORE offer of a product, or null. */
export function cheapestStoreOffer<O extends PreorderOffer>(offers: readonly O[], now: number = Date.now()): O | null {
  const first = storeOffers(offers, now)[0];
  return first && offerStock(first, now) === "open" ? first : null;
}

/** Per product type, the cheapest open store pre-order on the page (cents): what the FAQ's live answers quote. */
export function cheapestStoreByType(groups: readonly PreorderGroup[], now: number = Date.now()): CheapestByType {
  const out: CheapestByType = {};
  for (const g of groups) {
    const t = TYPE_BY_LABEL.get(g.product.productType)?.key;
    const o = cheapestStoreOffer(g.offers, now);
    if (t && o && (out[t] == null || o.priceCents < out[t]!)) out[t] = o.priceCents;
  }
  return out;
}

/** The strip under the H1: the comparison in four numbers, every one from the page's own data or the store registry. */
export interface PreorderSummary {
  /** Stores MTG Compare checks in the market (the registry: storesInMarket). */
  storesChecked: number;
  /** Distinct stores with an open pre-order of the set in the market (never a marketplace). */
  taking: number;
  /** The cheapest open Play Booster Box pre-order at a store, who has it, and per pack (packs.ts). */
  cheapestBox: { cents: number; store: string; perPack: number | null } | null;
  /** Whole days to the release date (0 on the day, negative after). */
  days: number;
}

export function preorderSummary(groups: readonly PreorderGroup[], storesChecked: number, set: Pick<MtgSet, "releaseDate">, today: string, now: number = Date.now()): PreorderSummary {
  const taking = new Set<string>();
  let cheapestBox: PreorderSummary["cheapestBox"] = null;
  for (const g of groups) {
    for (const o of storeOffers(g.offers, now)) if (offerStock(o, now) === "open") taking.add(o.store);
    if (g.product.productType !== "Play Booster Box") continue;
    const o = cheapestStoreOffer(g.offers, now);
    if (o && (!cheapestBox || o.priceCents < cheapestBox.cents)) {
      cheapestBox = { cents: o.priceCents, store: o.storeName, perPack: perPackCents(o.priceCents, packsForLabel(g.product.productType, g.product.setCode, g.product.name)) };
    }
  }
  const days = Math.round((Date.parse(`${set.releaseDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400_000);
  return { storesChecked, taking: taking.size, cheapestBox, days };
}

/** The line under the strip: how far the set reaches across every market (setStoreReach), or null without data. */
export function reachLine(set: Pick<MtgSet, "name">, reach: { stores: number; markets: number } | null): string | null {
  if (!reach || !reach.stores) return null;
  const all = reach.markets === REGION_LIST.length;
  const seven = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][REGION_LIST.length] ?? String(REGION_LIST.length);
  return `Across ${all ? "all" : "the"} ${seven} markets we compare, ${plural(reach.stores, "store")} ${reach.stores === 1 ? "lists" : "list"} ${set.name}${all ? "" : `, in ${reach.markets} of them`}.`;
}
