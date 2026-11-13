import Link from "@/components/Link";

import { navGroups } from "@/lib/nav";
import { REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { sectionHref, SECTION_PATHS, type SectionKey } from "@/lib/site";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { RegionSwitcher } from "./RegionSwitcher";
import { HeaderNavItems, SoftHeaderNavItems, SoftRegionSwitcher, SoftSearchBox, type HeaderNavItem } from "./HeaderNav";
import { dealsMenuColumns, guidesMenuColumns, setsMenuColumns, shopMenuColumns } from "./ShopMenu";
import { ThemeToggle } from "./ThemeToggle";
import { CartHeaderLink } from "./cart/CartHeaderLink";
import { SearchBox } from "./SearchBox";

/**
 * The desktop nav (lg and up), in order. `also`: other paths (under the region) that count as the section, for its current
 * state: a type page is part of "All sealed", the per-pack ranking and the weekly digest sit with "Deals".
 */
export const HEADER_NAV: { key: SectionKey; label: string; also?: string[]; xl?: boolean }[] = [
  { key: "deals", label: "Deals", also: [SECTION_PATHS.perPack, SECTION_PATHS.thisWeek, SECTION_PATHS.backInStock, SECTION_PATHS.priceMoves, SECTION_PATHS.outOfPrint, SECTION_PATHS.blackFriday, SECTION_PATHS.cyberMonday] },
  { key: "sealed", label: "All sealed", also: ["/type"] },
  { key: "sets", label: "Sets" },
  { key: "guides", label: "Guides", also: [SECTION_PATHS.tools, SECTION_PATHS.releases, SECTION_PATHS.stores] },
];
// Four sections, each with its menu, and no more (the minimal look, 2026-11-13): the row had seven entries with the seasonal
// "Black Friday", "Stores" and eBay's sponsored link. Stores is in the Guides menu; both sale pages lead the Deals menu in season
// (ShopMenu.tsx dealsMenuColumns) and the strip under the header stays; eBay's link is gone from the navigation (ads are in the
// page, labelled, never in the menu row).

/**
 * The desktop nav's items for a region, links and all: Deals, All sealed, Sets and Guides each open a mega menu
 * (components/NavMenu.tsx; the columns are in components/ShopMenu.tsx). The pre-order hub that "Releases" used to become while a set
 * is on pre-order leads the Deals menu's "Coming soon" column, with the release calendar (owner, 2026-11-09); the two sale pages
 * lead its "Best prices" column in season.
 */
export function headerNavItems(region: Region, today = new Date().toISOString().slice(0, 10), listed?: ReadonlySet<string> | null): HeaderNavItem[] {
  return HEADER_NAV.map((n) => ({
    href: sectionHref(region, n.key),
    label: n.label,
    also: n.also?.map((p) => `/${region}${p}`),
    xl: n.xl,
    menu: n.key === "sealed" ? shopMenuColumns(region, today, listed) : n.key === "sets" ? setsMenuColumns(region, today, listed) : n.key === "deals" ? dealsMenuColumns(region, today) : n.key === "guides" ? guidesMenuColumns(region) : undefined,
    menuKind: n.key === "sets" ? "sets" : n.key === "sealed" ? "shop" : n.key === "deals" ? "deals" : n.key === "guides" ? "guides" : undefined,
  }));
}

/**
 * The site header: ONE row, var(--hdr) tall (60px; 64px from lg), sticky. Everything a page needs to go somewhere else is in it at
 * every width, so nothing below it has to repeat it: it is the site's only navigation (the desktop sidebar is gone, 2026-11-13).
 * It sits on the page's own ground and takes its line once the page scrolls under it (globals.css .hdr).
 *
 * - Below lg: the logo mark (the word from sm), the search box filling the row, the flag-only region button and the menu button
 *   (components/MobileMenu.tsx: every product type, set and section, then the regions).
 * - lg and up: logo, the four sections (NavLink marks the current one; each opens its menu), search, theme, region, cart.
 * - No region (the landing page, About, the legal pages, a 404): the same header, for the visitor's region (owner, 2026-10-28: the
 *   whole navigation from the first page, no "Continue to <region>" step). The server's HTML has the default region's links; the
 *   browser moves them to the suggested one (HeaderNav.tsx), and a region picked there switches the page in place.
 *
 * The search box is components/SearchBox.tsx with its own props; `.hdr-search` (globals.css) only sizes it to the row.
 */
export function Header({ region, listed }: { region: Region | null; listed?: ReadonlySet<string> | null }) {
  const home = region ? `/${region}` : "/";
  const built = region ?? X_DEFAULT_REGION;
  const items = headerNavItems(built, undefined, listed);
  const groups = navGroups(built, undefined, listed);
  return (
    <header className="hdr sticky top-0 z-40 h-[var(--hdr)] border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="page flex h-full items-center gap-2 sm:gap-3 xl:gap-4">
        <Link href={home} className="flex h-11 shrink-0 items-center rounded-lg" aria-label={`MTG Compare${region ? ` ${REGIONS[region].name}` : ""} home`}>
          <Logo wordmark="hidden sm:inline" />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {region ? <HeaderNavItems items={items} /> : <SoftHeaderNavItems items={items} />}
        </nav>
        {/* The search has the row's spare room (it was a 256px box beside seven nav entries): finding a product is the header's main job. */}
        <div className="hdr-search min-w-0 flex-1 lg:ml-auto lg:min-w-[7rem] lg:max-w-sm">{region ? <SearchBox region={region} size="sm" /> : <SoftSearchBox />}</div>
        <ThemeToggle />
        {region ? <RegionSwitcher region={region} compact /> : <SoftRegionSwitcher />}
        {/* The cart list (components/cart, owner 2026-11-06): every width, with its count. */}
        <CartHeaderLink />
        <MobileMenu region={region} groups={groups} built={built} className="lg:hidden" />
      </div>
    </header>
  );
}
