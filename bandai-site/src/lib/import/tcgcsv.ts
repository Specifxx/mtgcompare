// TCGplayer catalogue and prices through TCGCSV (tcgcsv.com), which mirrors
// TCGplayer's catalog API as static JSON once a day (~20:00 UTC). No key, no
// quota: three requests per set.
import { SITE } from "@/site.config";
import { SITE_HOST } from "@/lib/site";
import type { Product, SetInfo, TcgPrice } from "@/lib/site-types";
import { slugify } from "@/lib/slug";
import { fetchJson, sleep } from "./http";

const BASE = "https://tcgcsv.com/tcgplayer";
// TCGCSV blocks browser-like User-Agents (HTTP 401, seen 2026-10-26) and asks
// each app to name itself.
export const TCGCSV_INIT: RequestInit = { headers: { "User-Agent": `${SITE.shortName}/1.0 (+https://${SITE_HOST})` } };

interface Group {
  groupId: number;
  name: string;
  abbreviation: string | null;
  publishedOn: string;
}
interface RawProduct {
  productId: number;
  name: string;
  imageUrl: string;
  /** 0 when TCGplayer has no photo: imageUrl is then still filled in, but the
   *  CDN answers 403 (whole reprint sets, ~8% of Yu-Gi-Oh!, seen 2026-10-27). */
  imageCount?: number;
  groupId: number;
  url: string;
  presaleInfo?: { isPresale: boolean; releasedOn: string | null };
  extendedData: { name: string; value: string }[];
}
interface RawPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  marketPrice: number | null;
  subTypeName: string;
}

const KEEP_ATTRS = new Set([
  "InkType",
  "CardType",
  "Cost Ink",
  "Property",
  "Classification",
  "Color",
  "Cost",
  "Level",
  "Trait",
  "Attack Points",
  "Hit Points",
  "Zone",
]);

export function sealedTypeOf(name: string): string {
  for (const [re, type] of SITE.sealedTypes ?? []) if (re.test(name)) return type;
  const n = name.toLowerCase();
  // Pack fillers TCGplayer lists as products (puzzle pieces, lore cards, ink
  // drop and other tokens): not sealed product, never worth an eBay call.
  if (/puzzle insert|lore card|ink drop|\btokens?\b|\binsert\b|code card/.test(n)) return "Insert";
  if (/\bcase\b/.test(n)) return "Case";
  if (/trove/.test(n)) return "Illumineer's Trove";
  if (/starter (deck|set)|starter decks/.test(n)) return "Starter Deck";
  if (/prerelease/.test(n)) return "Prerelease";
  if (/booster (box|display)|collector booster display/.test(n)) return "Booster Box";
  if (/sleeved booster/.test(n)) return "Sleeved Pack";
  if (/booster pack|\bpack\b/.test(n)) return "Booster Pack";
  if (/gift|collection|bundle|set of|tin/.test(n)) return "Collection";
  if (/deck/.test(n)) return "Deck";
  return "Other";
}

function cents(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 100);
}


export async function loadTcgcsv(now = new Date()): Promise<{
  sets: SetInfo[];
  products: Product[];
  tcg: Record<number, Record<string, TcgPrice>>;
}> {
  // One TCGplayer category, or one per game on a multi-game site (SITE.lines).
  const cats: { cat: number; line?: string }[] = SITE.lines?.length
    ? SITE.lines.map((l) => ({ cat: l.tcgcsvCategoryId, line: l.id }))
    : [{ cat: SITE.tcgcsvCategoryId }];
  const groups: (Group & { cat: number; line?: string })[] = [];
  for (const c of cats)
    for (const g of (await fetchJson<{ results: Group[] }>(`${BASE}/${c.cat}/groups`, TCGCSV_INIT)).results) groups.push({ ...g, ...c });
  const sets: SetInfo[] = [];
  const products: Product[] = [];
  const tcg: Record<number, Record<string, TcgPrice>> = {};
  const usedSlugs = new Set<string>();
  const usedSetSlugs = new Set<string>();

  for (const g of groups) {
    const cat = g.cat;
    const [prods, prices] = await Promise.all([
      fetchJson<{ results: RawProduct[] }>(`${BASE}/${cat}/${g.groupId}/products`, TCGCSV_INIT),
      fetchJson<{ results: RawPrice[] }>(`${BASE}/${cat}/${g.groupId}/prices`, TCGCSV_INIT),
    ]);
    const setSlug = uniqueSetSlug(g.name, g.line, usedSetSlugs);
    const released = g.publishedOn ? g.publishedOn.slice(0, 10) : null;
    sets.push({
      id: g.groupId,
      name: g.name,
      code: g.abbreviation || setSlug,
      slug: setSlug,
      releasedOn: released,
      productCount: prods.results.length,
      upcoming: !!released && new Date(released) > now,
      ...(g.line ? { line: g.line } : {}),
    });
    const printings = new Map<number, Set<string>>();
    for (const p of prices.results) {
      (tcg[p.productId] ??= {})[p.subTypeName] = {
        market: cents(p.marketPrice),
        low: cents(p.lowPrice),
        mid: cents(p.midPrice),
      };
      if (!printings.has(p.productId)) printings.set(p.productId, new Set());
      printings.get(p.productId)!.add(p.subTypeName);
    }
    for (const p of prods.results) {
      const ext = Object.fromEntries(p.extendedData.map((e) => [e.name, e.value]));
      const isCard = !!ext.Number;
      let slug = slugify(p.name) || String(p.productId);
      if (SITE.slugStyle === "name-number") {
        // Final slugs are settled below, from the whole listing at once.
        if (isCard) slug = `${slug}-${slugify(ext.Number)}`;
      } else {
        if (usedSlugs.has(slug)) slug = `${slug}-${setSlug}`;
        if (usedSlugs.has(slug)) slug = `${slug}-${p.productId}`;
        usedSlugs.add(slug);
      }
      const attrs: Record<string, string> = {};
      for (const [k, v] of Object.entries(ext)) if ((KEEP_ATTRS.has(k) || SITE.extraAttrs?.includes(k)) && v) attrs[k] = String(v).replace(/<[^>]+>/g, "");
      products.push({
        id: p.productId,
        slug,
        name: p.name,
        kind: isCard ? "card" : "sealed",
        setId: g.groupId,
        number: ext.Number ?? null,
        rarity: ext.Rarity && ext.Rarity !== "None" ? (SITE.rarityNames?.[ext.Rarity] ?? ext.Rarity) : null,
        attrs,
        sealedType: isCard ? null : sealedTypeOf(p.name),
        image: p.imageCount === 0 ? null : p.imageUrl || null,
        tcgUrl: p.url,
        printings: [...(printings.get(p.productId) ?? [])],
      });
    }
    await sleep(150);
  }
  fixRedatedSets(sets, products, now);
  sets.sort((a, b) => (b.releasedOn ?? "").localeCompare(a.releasedOn ?? ""));
  borrowImages(products);
  if (SITE.slugStyle === "name-number") settleSlugs(products, sets);
  if (SITE.catalogMinCardCents) {
    const kept = applyCatalogFloor(products, sets, tcg, SITE.catalogMinCardCents, now);
    for (const s of sets) s.productCount = kept.filter((p) => p.setId === s.id).length;
    return { sets, products: kept, tcg };
  }
  return { sets, products, tcg };
}

/** A set's URL slug: its name, and on a multi-game site the game's slug
 *  before it when two games share a set name ("promotion-cards"). */
export function uniqueSetSlug(name: string, line: string | undefined, used: Set<string>): string {
  let slug = slugify(name);
  // Single-game sites keep the plain name, exactly as before.
  if (!line) return slug;
  if (used.has(slug) && line) slug = `${slugify(SITE.lines?.find((l) => l.id === line)?.slug ?? line)}-${slug}`;
  let n = 2;
  const base = slug;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

/** TCGplayer sometimes moves an old group's publishedOn to today (18 Yu-Gi-Oh!
 *  groups, from 2004 promos to a 2025 reprint, all dated 2026-10-25), which
 *  made a 2020 reprint the "newest set" and kept every card in those sets past
 *  the catalogue floor. Product ids only grow, so a set's lowest product id
 *  dates it: a date in the last 60 days that is over a year after the median
 *  date of the five sets with the nearest lowest ids is replaced by that
 *  median. Older dates are left alone (promo groups gain new products for
 *  years), and so is any set too small to compare. */
export function fixRedatedSets(sets: SetInfo[], products: Product[], now: Date) {
  const minId = new Map<number, number>();
  for (const p of products) minId.set(p.setId, Math.min(minId.get(p.setId) ?? Infinity, p.id));
  const DAY = 86_400_000;
  const recent = (s: SetInfo) => !!s.releasedOn && Math.abs(now.getTime() - new Date(s.releasedOn).getTime()) < 60 * DAY;
  const ref = sets
    .filter((s) => s.releasedOn && minId.has(s.id) && !recent(s))
    .map((s) => ({ id: minId.get(s.id)!, date: s.releasedOn! }))
    .sort((a, b) => a.id - b.id);
  if (ref.length < 5) return;
  for (const s of sets) {
    const id = minId.get(s.id);
    if (id == null || !recent(s)) continue;
    const nearest = [...ref].sort((a, b) => Math.abs(a.id - id) - Math.abs(b.id - id)).slice(0, 5).map((r) => r.date).sort();
    const median = nearest[2];
    if (new Date(s.releasedOn!).getTime() - new Date(median).getTime() > 365 * DAY) {
      s.releasedOn = median;
      s.upcoming = false;
    }
  }
}

/** A card TCGplayer has no photo of takes the photo of another printing of
 *  the same card: same number and same name (a reprint shows the same art),
 *  the same rarity first. Without one it stays null and draws no <img>. */
export function borrowImages(products: Product[]) {
  const key = (p: Product) => `${p.number}|${p.name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase()}`;
  const donors = new Map<string, Product[]>();
  for (const p of products)
    if (p.kind === "card" && p.number && p.image) {
      if (!donors.has(key(p))) donors.set(key(p), []);
      donors.get(key(p))!.push(p);
    }
  for (const p of products) {
    if (p.image || p.kind !== "card" || !p.number) continue;
    const list = donors.get(key(p));
    if (list) p.image = (list.find((d) => d.rarity === p.rarity) ?? list[0]).image;
  }
}

/** "name-number" slugs: a slug two products share gets the rarity (cards) or
 *  the set (sealed), then the product id. Decided from the whole listing in a
 *  fixed order, so a product's slug doesn't depend on which others exist. */
export function settleSlugs(products: Product[], sets: SetInfo[]) {
  const setSlug = new Map(sets.map((s) => [s.id, s.slug]));
  const count = (key: (p: Product) => string) => {
    const n = new Map<string, number>();
    for (const p of products) n.set(key(p), (n.get(key(p)) ?? 0) + 1);
    return n;
  };
  const base = count((p) => p.slug);
  for (const p of products)
    if (base.get(p.slug)! > 1) p.slug = `${p.slug}-${slugify((p.kind === "card" ? p.rarity : setSlug.get(p.setId)) ?? "") || p.id}`;
  const second = count((p) => p.slug);
  for (const p of products) if (second.get(p.slug)! > 1) p.slug = `${p.slug}-${p.id}`;
}

/** Cards priced under the floor in every printing leave the catalogue, unless
 *  their set is new or upcoming (prices settle in the first weeks). Sealed
 *  always stays. */
export function applyCatalogFloor(
  products: Product[],
  sets: SetInfo[],
  tcg: Record<number, Record<string, TcgPrice>>,
  minCents: number,
  now: Date,
): Product[] {
  const fresh = new Set(
    sets.filter((s) => s.upcoming || (s.releasedOn && now.getTime() - new Date(s.releasedOn).getTime() < 120 * 86_400_000)).map((s) => s.id),
  );
  return products.filter((p) => {
    if (p.kind === "sealed" || fresh.has(p.setId)) return true;
    return Object.values(tcg[p.id] ?? {}).some((t) => (t.market ?? t.mid ?? t.low ?? 0) >= minCents);
  });
}

/** The headline USD price of a product: the lowest printing's market price,
 *  falling back to mid then low. Normal printing first when it is priced. */
export function referenceCents(t: Record<string, TcgPrice> | undefined): number | null {
  if (!t) return null;
  const pick = (p: TcgPrice) => p.market ?? p.mid ?? p.low;
  if (t.Normal && pick(t.Normal) != null) return pick(t.Normal);
  const vals = Object.values(t)
    .map(pick)
    .filter((v): v is number => v != null);
  return vals.length ? Math.min(...vals) : null;
}
