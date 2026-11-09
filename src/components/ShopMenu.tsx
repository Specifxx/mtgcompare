import { openPreorderGuides } from "@/lib/preorder-guides";
import { featureOrder, menuSets } from "@/lib/release";
import type { Region } from "@/lib/regions";
import { slugify } from "@/lib/sealed-title";
import { SERIES_ORDER, SET_BY_CODE, SETS } from "@/lib/sets";
import { sectionHref, type SectionKey } from "@/lib/site";

export type MenuLink = { href: string; label: string };
/** `href`: the column's heading is a link too (the series columns go to their block on the sets page). */
export type MenuColumn = { title: string; links: MenuLink[]; href?: string };

/** The series (era) the header's "Sets" menu and the sidebar's "Sets by series" group draw, newest first, and how many each shows. */
export const SETS_MENU_SERIES = 4;
const PER_SERIES = 4;

/** Where a series sits on the sets page: its block's id there (sets/page.tsx uses the same slugify). */
export const seriesHref = (region: string, series: string): string => `/${region}/sets#${slugify(series)}`;

/** The series that have at least one set the region lists (a set no store lists has no page), in the sets page's order. Pure. */
export function listedSeries(listed?: ReadonlySet<string> | null): string[] {
  return SERIES_ORDER.filter((series) => SETS.some((s) => s.series === series && (!listed || listed.has(s.code))));
}

/**
 * The desktop "Sets" dropdown: one column per series (the era a collector says: "Scarlet & Violet", "Universes Beyond"), its newest
 * sets under it, and the heading goes to the series' block on the sets page. Only sets the region lists, so no dead link; the same
 * destinations as the sidebar and phone menu, a static list with no read. Pure.
 */
export function setsMenuColumns(region: Region, today: string = new Date().toISOString().slice(0, 10), listed?: ReadonlySet<string> | null): MenuColumn[] {
  return listedSeries(listed)
    .slice(0, SETS_MENU_SERIES)
    .map((series) => {
      const codes = SETS.filter((s) => s.series === series && (!listed || listed.has(s.code))).map((s) => s.code);
      const links = featureOrder(codes, today)
        .slice(0, PER_SERIES)
        .map((c) => SET_BY_CODE.get(c)!)
        .map((set) => ({ href: `/${region}/sets/${set.slug}`, label: set.releaseDate > today ? `${set.name} (pre-order)` : set.name }));
      return { title: series, href: seriesHref(region, series), links: [...links, { href: seriesHref(region, series), label: `All ${series} sets →` }] };
    });
}

/**
 * The desktop "All sealed" dropdown's columns (lg and up), category-first like the big skin and card marketplaces: what kind of
 * product, which set, and the value pages. The same destinations the phone menu and the footer already link, so it adds no page
 * and no read: a static list (sets from lib/sets.ts, in release.ts featureOrder: the newest released set first, never a pre-order).
 * Ported from DexCompare (CompareEmpire #68, 2026-10-28). Pure, so the tests pin it.
 */
export function shopMenuColumns(region: Region, today: string = new Date().toISOString().slice(0, 10), listed?: ReadonlySet<string> | null): MenuColumn[] {
  const s = (key: SectionKey, label: string): MenuLink => ({ href: sectionHref(region, key), label });
  const type = (slug: string, label: string): MenuLink => ({ href: `/${region}/type/${slug}`, label });
  const sets = menuSets(7, today, listed)
    .map((c) => SET_BY_CODE.get(c)!)
    .map((set) => ({ href: `/${region}/sets/${set.slug}`, label: set.releaseDate > today ? `${set.name} (pre-order)` : set.name }));
  return [
    {
      title: "By product",
      links: [
        s("boosterBoxes", "Play booster boxes"),
        s("collectorBoxes", "Collector booster boxes"),
        s("bundles", "Bundles"),
        s("commanderDecks", "Commander decks"),
        s("secretLair", "Secret Lair drops"),
        type("prerelease-packs", "Prerelease packs"),
        type("starter-kits", "Starter kits"),
        type("play-booster-packs", "Play booster packs"),
        type("collector-booster-packs", "Collector booster packs"),
      ],
    },
    { title: "By set", links: [...sets, s("sets", "Every set →")] },
    {
      title: "By value",
      links: [s("perPack", "Cheapest per pack"), s("deals", "Deals"), s("backInStock", "Back in stock"), s("priceMoves", "Price moves"), s("outOfPrint", "Older sets in stock"), s("sealed", "Browse & filter all →")],
    },
  ];
}

/** The header's "Deals" dropdown: the best prices, stock and price movement, and what is coming (pre-order hubs while open, the calendar). */
export function dealsMenuColumns(region: Region, today: string = new Date().toISOString().slice(0, 10)): MenuColumn[] {
  const s = (key: SectionKey, label: string): MenuLink => ({ href: sectionHref(region, key), label });
  return [
    { title: "Best prices", href: sectionHref(region, "deals"), links: [s("deals", "Today's deals"), s("perPack", "Cheapest per pack"), s("thisWeek", "This week")] },
    { title: "Stock & moves", links: [s("backInStock", "Back in stock"), s("priceMoves", "Price moves"), s("outOfPrint", "Older sets in stock")] },
    {
      title: "Coming soon",
      links: [...openPreorderGuides(today).map(({ set }) => ({ href: `/${region}/preorders/${set.slug}`, label: `${set.name} pre-orders` })), s("releases", "Release calendar")],
    },
  ];
}

/** The header's "Guides" dropdown: reading and tools, the places that are not a product. */
export function guidesMenuColumns(region: Region): MenuColumn[] {
  const s = (key: SectionKey, label: string): MenuLink => ({ href: sectionHref(region, key), label });
  return [{ title: "Learn & play", links: [s("guides", "Buying guides"), s("tools", "Tools"), s("daily", "Price Duel game"), { href: "/blog", label: "Blog" }, { href: "/creators", label: "Creators" }, { href: "/forum", label: "Community forum" }] }];
}
