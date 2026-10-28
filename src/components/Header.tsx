import Link from "@/components/Link";

import { inSeason } from "@/lib/black-friday";
import { navGroups } from "@/lib/nav";
import { REGIONS, X_DEFAULT_REGION, type Region } from "@/lib/regions";
import { sectionHref, SECTION_PATHS, type SectionKey } from "@/lib/site";
import { EbayNavLink } from "./Ebay";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { RegionSwitcher } from "./RegionSwitcher";
import { HeaderNavItems, SoftHeaderNavItems, SoftRegionSwitcher, SoftSearchBox, type HeaderNavItem } from "./HeaderNav";
import { shopMenuColumns } from "./ShopMenu";
import { ThemeToggle } from "./ThemeToggle";
import { SearchBox } from "./SearchBox";

/**
 * The desktop nav (lg and up), in order. `also`: other paths (under the region) that count as the section, for its current
 * state: a type page is part of "All sealed", the per-pack ranking and the weekly digest sit with "Deals".
 */
export const HEADER_NAV: { key: SectionKey; label: string; also?: string[]; xl?: boolean }[] = [
  { key: "deals", label: "Deals", also: [SECTION_PATHS.perPack, SECTION_PATHS.thisWeek, SECTION_PATHS.backInStock, SECTION_PATHS.priceMoves, SECTION_PATHS.outOfPrint] },
  { key: "sealed", label: "All sealed", also: ["/type"] },
  { key: "sets", label: "Sets" },
  { key: "releases", label: "Releases" },
  { key: "guides", label: "Guides" },
  { key: "stores", label: "Stores" },
];

/** The nav as rendered: HEADER_NAV, with "Black Friday" after Deals while the season is on (lib/black-friday.ts inSeason). */
export function headerNav(today = new Date().toISOString().slice(0, 10)): typeof HEADER_NAV {
  if (!inSeason(today)) return HEADER_NAV;
  // xl only: at lg (1024) the row has no room for a seventh item; the phone menu, the footer and the region home link it there.
  return [HEADER_NAV[0], { key: "blackFriday", label: "Black Friday", xl: true }, ...HEADER_NAV.slice(1)];
}

/** The desktop nav's items for a region, links and all (the "All sealed" dropdown's included). */
export function headerNavItems(region: Region, today = new Date().toISOString().slice(0, 10)): HeaderNavItem[] {
  return headerNav(today).map((n) => ({
    href: sectionHref(region, n.key),
    label: n.label,
    also: n.also?.map((p) => `/${region}${p}`),
    xl: n.xl,
    // The sealed browse item opens the category dropdown (components/ShopMenu.tsx): by product, by set, by value.
    menu: n.key === "sealed" ? shopMenuColumns(region, today) : undefined,
  }));
}

/**
 * The site header: ONE row, var(--hdr) tall (60px; 64px from lg), sticky. Everything a page needs to go somewhere else is in it at
 * every width, so nothing below it has to repeat it. From xl it spans the shell (the sidebar's column and the page's).
 *
 * - Below lg: the logo mark (the word from sm), the search box filling the row, the flag-only region button and the menu button
 *   (components/MobileMenu.tsx: every product type, set and section, then the regions).
 * - lg and up: logo, the sections (NavLink marks the current one), eBay's labelled search link (xl, region pages), search, region.
 * - No region (the landing page, About, the legal pages, a 404): the same header, for the visitor's region (owner, 2026-10-28: the
 *   whole navigation from the first page, no "Continue to <region>" step). The server's HTML has the default region's links; the
 *   browser moves them to the suggested one (HeaderNav.tsx), and a region picked there switches the page in place.
 *
 * The search box is components/SearchBox.tsx with its own props; `.hdr-search` (globals.css) only sizes it to the row.
 */
export function Header({ region }: { region: Region | null }) {
  const home = region ? `/${region}` : "/";
  const built = region ?? X_DEFAULT_REGION;
  const items = headerNavItems(built);
  const groups = navGroups(built);
  return (
    <header className="sticky top-0 z-40 h-[var(--hdr)] border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="page flex h-full items-center gap-2 sm:gap-3 lg:gap-4 xl:max-w-shell">
        <Link href={home} className="flex h-11 shrink-0 items-center rounded-lg" aria-label={`MTG Compare${region ? ` ${REGIONS[region].name}` : ""} home`}>
          <Logo wordmark="hidden sm:inline" />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {region ? <HeaderNavItems items={items} /> : <SoftHeaderNavItems items={items} />}
          <NavLink href="/blog" className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors">
            Blog
          </NavLink>
          {/* A discreet, labelled sponsored item (xl and up only): eBay's search, tagged. Not a section of the site. */}
          {region && <EbayNavLink region={region} />}
        </nav>
        <div className="hdr-search min-w-0 flex-1 lg:ml-auto lg:w-56 lg:flex-none xl:w-64">{region ? <SearchBox region={region} size="sm" /> : <SoftSearchBox />}</div>
        <ThemeToggle />
        {region ? <RegionSwitcher region={region} compact /> : <SoftRegionSwitcher />}
        <MobileMenu region={region} groups={groups} built={built} className="lg:hidden" />
      </div>
    </header>
  );
}
