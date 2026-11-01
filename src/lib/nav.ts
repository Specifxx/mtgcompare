import { inSeason } from "./black-friday";
import { openPreorderGuides } from "./preorder-guides";
import { featureOrder } from "./release";
import { isRegion, type Region } from "./regions";
import { SET_BY_CODE, SETS } from "./sets";
import { sectionHref, type SectionKey } from "./site";

export type NavItem = { href: string; label: string };
export type NavGroup = { title: string; links: NavItem[] };

/**
 * Every place the site goes, grouped the way a buyer looks for it: what kind of product, which set, where the value is, and the rest.
 * The desktop sidebar (components/SideNav.tsx, xl and up) and the phone menu (components/MobileMenu.tsx) both draw this one list, so
 * the two never disagree. Static (sets from lib/sets.ts, newest released first by release.ts featureOrder, never a pre-order first):
 * no read, no page that doesn't exist. Owner, 2026-10-28: navigation from the first page, no "Continue to <region>" step first.
 */
export function navGroups(region: Region, today: string = new Date().toISOString().slice(0, 10)): NavGroup[] {
  const s = (key: SectionKey, label: string): NavItem => ({ href: sectionHref(region, key), label });
  const type = (slug: string, label: string): NavItem => ({ href: `/${region}/type/${slug}`, label });
  const sets = featureOrder(SETS.slice(0, 8).map((x) => x.code), today)
    .map((c) => SET_BY_CODE.get(c)!)
    .map((set) => ({ href: `/${region}/sets/${set.slug}`, label: set.releaseDate > today ? `${set.name} (pre-order)` : set.name }));
  return [
    {
      title: "Shop by product",
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
        s("sealed", "All sealed"),
      ],
    },
    // An open pre-order hub leads the sets (lib/preorder-guides.ts; gone on release day).
    { title: "Sets", links: [...openPreorderGuides(today).map(({ set }) => ({ href: `/${region}/preorders/${set.slug}`, label: `${set.name} pre-orders` })), ...sets, s("sets", "Every set")] },
    {
      title: "Deals & stock",
      links: [
        s("deals", "Deals"),
        ...(inSeason(today) ? [s("blackFriday", "Black Friday")] : []),
        s("perPack", "Cheapest per pack"),
        s("thisWeek", "This week"),
        s("backInStock", "Back in stock"),
        s("priceMoves", "Price moves"),
        s("outOfPrint", "Older sets in stock"),
      ],
    },
    {
      title: "More",
      links: [s("releases", "Release calendar"), s("guides", "Buying guides"), s("tools", "Tools"), s("stores", "Where to buy"), { href: "/forum", label: "Community forum" }, { href: "/blog", label: "Blog" }, { href: "/creators", label: "Creators" }],
    },
  ];
}

/** The same link in another region: "/us/deals" → "/au/deals". Links outside a region ("/blog") are left alone. Pure. */
export function retargetHref(href: string, to: Region): string {
  const m = /^\/([a-z]{2})(?=\/|$|\?|#)/.exec(href);
  return m && isRegion(m[1]) ? `/${to}${href.slice(m[0].length)}` : href;
}

/** navGroups built for one region, moved to another (the pages with no region of their own follow the visitor's in the browser). */
export function retargetGroups(groups: NavGroup[], to: Region): NavGroup[] {
  return groups.map((g) => ({ ...g, links: g.links.map((l) => ({ ...l, href: retargetHref(l.href, to) })) }));
}
