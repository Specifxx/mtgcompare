// Crawlable hub pages: one per card rarity (/cards/rarity/<slug>) and one per
// sealed product type (/sealed/<type>). Only hubs with products exist, so the
// sitemap never lists an empty page.
import { SITE } from "@/site.config";
import type { CardHubConfig, Product } from "@/lib/site-types";
import { byValue, products, productsInSet, refCents, setById, sets } from "@/lib/data";
import { preorderSets, todayIso } from "@/lib/preorders";
import { PREORDER_COPY } from "@/content/preorders";
import { slugify } from "@/lib/slug";

// "LR+" and "LR++" must not share a slug.
const raritySlug = (r: string) => slugify(r.replace(/\+/g, " plus "));

export const SEALED_ORDER = ["Booster Box", "Case", "Illumineer's Trove", "Booster Pack", "Sleeved Pack", "Starter Deck", "Structure Deck", "Tin", "Special Edition", "Collection", "Prerelease", "Deck", "Other"];
export const SEALED_PLURAL: Record<string, string> = { "Booster Box": "Booster boxes", Case: "Cases", "Illumineer's Trove": "Illumineer's Troves", "Booster Pack": "Booster packs", "Sleeved Pack": "Sleeved packs", "Starter Deck": "Starter decks", "Structure Deck": "Structure decks", Tin: "Tins", "Special Edition": "Special editions", Collection: "Collections and gift sets", Prerelease: "Prerelease kits", Deck: "Decks", Other: "Other sealed" };

export interface Hub { slug: string; label: string; items: Product[] }

export function rarityHubs(): Hub[] {
  const cards = products().filter((p) => p.kind === "card" && p.rarity);
  const names = [...new Set(cards.map((p) => p.rarity!))];
  const rank = (r: string) => { const i = SITE.rarityOrder.indexOf(r); return i < 0 ? 99 : i; };
  return names
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((r) => ({ slug: raritySlug(r), label: r, items: byValue(cards.filter((p) => p.rarity === r)) }))
    .filter((h) => h.slug && h.items.length);
}

export function sealedHubs(): Hub[] {
  const sealed = products().filter((p) => p.kind === "sealed");
  return SEALED_ORDER.filter((t) => t !== "Other")
    .map((t) => ({ slug: slugify(t), label: SEALED_PLURAL[t] ?? t, items: byValue(sealed.filter((p) => p.sealedType === t)) }))
    .filter((h) => h.items.length);
}

export const rarityHref = (r: string | null) => (r ? `/cards/rarity/${raritySlug(r)}` : null);
export const sealedHref = (t: string | null) => (t && t !== "Other" && t !== "Insert" ? `/sealed/${slugify(t)}` : null);

// The homepage's sealed shelf: booster boxes from the newest released sets
// first, then other headline sealed (troves, tins, collections, decks) to fill
// the row. Priced products only; never cases, loose packs, inserts or pre-orders
// (the pre-order banner has those).
const SHELF_FILL = ["Illumineer's Trove", "Special Edition", "Tin", "Collection", "Structure Deck", "Starter Deck", "Sleeved Pack", "Booster Pack"];
export function featuredSealed(limit = 6): Product[] {
  const released = (p: Product) => { const s = setById(p.setId); return s && !s.upcoming ? s.releasedOn ?? "" : null; };
  const pool = products().filter((p) => p.kind === "sealed" && released(p) !== null && refCents(p.id) != null);
  const newest = (a: Product, b: Product) => released(b)!.localeCompare(released(a)!) || (refCents(b.id) ?? 0) - (refCents(a.id) ?? 0);
  const boxes = pool.filter((p) => p.sealedType === "Booster Box").sort(newest);
  const rank = (p: Product) => SHELF_FILL.indexOf(p.sealedType ?? "");
  const fill = pool.filter((p) => rank(p) >= 0).sort((a, b) => newest(a, b) || rank(a) - rank(b));
  return [...boxes, ...fill].slice(0, limit);
}

/** A set's sealed products, booster boxes first (SEALED_ORDER), Inserts left out. */
export function sealedInSet(setId: number): Product[] {
  const rank = (t: string | null) => {
    const i = SEALED_ORDER.indexOf(t ?? "Other");
    return i < 0 ? SEALED_ORDER.length : i;
  };
  return byValue(productsInSet(setId).filter((p) => p.kind === "sealed" && p.sealedType !== "Insert")).sort((a, b) => rank(a.sealedType) - rank(b.sealedType));
}

/** The releases with a pre-order page (lib/preorders.ts), soonest first; an upcoming set with written copy counts before any store lists it. */
export const preorderSetList = (today = todayIso()) =>
  preorderSets(
    sets(),
    (s) => { const list = sealedInSet(s.id); return { products: list.length, boxes: list.filter((p) => p.sealedType === "Booster Box").length }; },
    today,
    (s) => !!PREORDER_COPY.sets[s.slug],
  );

// Attribute hubs (SITE.cardHubs): /cards/<facet>/<slug>, e.g. every Red card or
// every Frozen card, most valuable first. Built once per process: YGO has
// fifteen thousand cards and the sitemap, /cards and every hub read this.
export interface AttrHub extends Hub { facet: string; value: string }
export interface AttrFacet { cfg: CardHubConfig; hubs: AttrHub[] }

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
export function attrValues(cfg: CardHubConfig, raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = cfg.split ? raw.split(new RegExp(cfg.split)) : [raw];
  return parts.map((v) => v.trim().replace(/^\(+|\)+$/g, "").trim()).filter(Boolean).map((v) => (cfg.titleCase ? titleCase(v) : v));
}

let facetCache: { at: unknown; facets: AttrFacet[] } | null = null;
export function attrFacets(): AttrFacet[] {
  const all = products();
  if (facetCache && facetCache.at === all) return facetCache.facets;
  const cards = all.filter((p) => p.kind === "card");
  const facets = (SITE.cardHubs ?? [])
    .filter((cfg) => cfg.facet !== "rarity")
    .map((cfg) => {
      const groups = new Map<string, Product[]>();
      for (const p of cards) for (const v of attrValues(cfg, p.attrs[cfg.attr])) {
        if (cfg.exclude?.includes(v)) continue;
        const list = groups.get(v) ?? [];
        list.push(p);
        groups.set(v, list);
      }
      const hubs = [...groups.entries()]
        .filter(([, list]) => list.length >= (cfg.minItems ?? 12))
        .map(([value, list]) => ({ facet: cfg.facet, value, slug: slugify(value), label: value, items: byValue(list) }))
        .filter((h) => h.slug)
        .sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
      return { cfg, hubs };
    })
    .filter((f) => f.hubs.length > 1);
  facetCache = { at: all, facets };
  return facets;
}

export const attrFacet = (facet: string) => attrFacets().find((f) => f.cfg.facet === facet) ?? null;
export const attrHub = (facet: string, slug: string) => attrFacet(facet)?.hubs.find((h) => h.slug === slug) ?? null;
export const attrHubTitle = (cfg: CardHubConfig, value: string) => (cfg.title ?? "{v} {game} cards").replace("{v}", value).replace("{game}", SITE.gameShort);

/** The hub link for one attribute of a card (its card page links it), or null. */
export function attrHref(attr: string, raw: string): { label: string; href: string }[] | null {
  const f = attrFacets().find((x) => x.cfg.attr === attr);
  if (!f) return null;
  const vals = attrValues(f.cfg, raw);
  const links = vals.map((v) => ({ label: v, href: f.hubs.some((h) => h.value === v) ? `/cards/${f.cfg.facet}/${slugify(v)}` : "" }));
  return links.some((l) => l.href) ? links : null;
}

/** Per value of one facet: card count, median and top card (the {{attrstats}} blog token). */
export function facetStats(facet: string) {
  const f = attrFacet(facet);
  if (!f) return [];
  return f.hubs.map((h) => {
    const priced = h.items.map((p) => refCents(p.id)).filter((c): c is number => c != null).sort((a, b) => a - b);
    const median = priced.length ? priced[Math.floor(priced.length / 2)] : null;
    const over10 = priced.filter((c) => c >= 1000).length;
    return { hub: h, cfg: f.cfg, count: h.items.length, median, over10, top: priced.length ? h.items[0] : null };
  });
}
