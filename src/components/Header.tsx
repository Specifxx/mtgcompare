import Link from "@/components/Link";

import { inSeason } from "@/lib/black-friday";
import { REGIONS, type Region } from "@/lib/regions";
import { sectionHref, SECTION_PATHS, type SectionKey } from "@/lib/site";
import { EbayNavLink } from "./Ebay";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { NavLink } from "./NavLink";
import { RegionSwitcher } from "./RegionSwitcher";
import { SearchBox } from "./SearchBox";

/**
 * The desktop nav (lg and up), in order. `also`: other paths (under the region) that count as the section, for its current
 * state: a type page is part of "All sealed", the per-pack ranking and the weekly digest sit with "Deals".
 */
export const HEADER_NAV: { key: SectionKey; label: string; also?: string[]; xl?: boolean }[] = [
  { key: "deals", label: "Deals", also: [SECTION_PATHS.perPack, SECTION_PATHS.thisWeek] },
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

/**
 * The site header: ONE row, var(--hdr) tall (60px; 64px from lg), sticky. Everything a page needs to go somewhere else is in it at
 * every width, so nothing below it has to repeat it.
 *
 * - Region page, below lg: the logo mark (the word from sm), the search box filling the row, the flag-only region button and the
 *   menu button (components/MobileMenu.tsx: every section, then the regions).
 * - Region page, lg and up: logo, the sections (NavLink marks the current one), eBay's labelled search link (xl), search, region.
 * - No region (About, the legal pages, a 404): logo, "Choose region", and the menu.
 *
 * The search box is components/SearchBox.tsx with its own props; `.hdr-search` (globals.css) only sizes it to the row.
 */
export function Header({ region }: { region: Region | null }) {
  const home = region ? `/${region}` : "/";
  return (
    <header className="sticky top-0 z-40 h-[var(--hdr)] border-b border-line bg-surface/90 backdrop-blur-md">
      <div className="page flex h-full items-center gap-2 sm:gap-3 lg:gap-4">
        <Link href={home} className="flex h-11 shrink-0 items-center rounded-lg" aria-label={`MTG Compare${region ? ` ${REGIONS[region].name}` : ""} home`}>
          <Logo wordmark="hidden sm:inline" />
        </Link>
        {region ? (
          <>
            <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
              {headerNav().map((n) => (
                <NavLink
                  key={n.key}
                  href={sectionHref(region, n.key)}
                  also={n.also?.map((p) => `/${region}${p}`)}
                  className={`${n.xl ? "hidden xl:inline-flex" : ""} whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors`}
                >
                  {n.label}
                </NavLink>
              ))}
              <NavLink href="/blog" className="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors">
                Blog
              </NavLink>
              {/* A discreet, labelled sponsored item (xl and up only): eBay's search, tagged. Not a section of the site. */}
              <EbayNavLink region={region} />
            </nav>
            <div className="hdr-search min-w-0 flex-1 lg:ml-auto lg:w-56 lg:flex-none xl:w-64">
              <SearchBox region={region} size="sm" />
            </div>
            <RegionSwitcher region={region} compact />
            <MobileMenu region={region} className="lg:hidden" />
          </>
        ) : (
          <>
            <div className="ml-auto" />
            <RegionSwitcher region={null} />
            <MobileMenu region={null} />
          </>
        )}
      </div>
    </header>
  );
}
