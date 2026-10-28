"use client";

import Link from "@/components/Link";
import { retargetHref } from "@/lib/nav";
import type { Region } from "@/lib/regions";
import type { MenuColumn } from "./ShopMenu";
import { NavLink } from "./NavLink";
import { RegionSwitcher } from "./RegionSwitcher";
import { useSoftRegion } from "./RegionSuggest";
import { SearchBox } from "./SearchBox";

/** One desktop nav item, its links built on the server for one region; `menu`: the "All sealed" dropdown's columns. */
export interface HeaderNavItem {
  href: string;
  label: string;
  also?: string[];
  xl?: boolean;
  menu?: MenuColumn[];
}

/**
 * The panel under "All sealed" in the desktop header. CSS only (no client state): it opens on hover and while focus is inside it
 * (keyboard: tab to "All sealed" and on into the links), so the links are plain <a> in the HTML. Below lg the header has no nav;
 * the phone menu lists the same places.
 */
export function ShopMenuPanel({ columns }: { columns: MenuColumn[] }) {
  return (
    <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
      <div className="grid w-[40rem] grid-cols-3 gap-6 rounded-2xl border border-line bg-surface p-5 shadow-lg" data-menu="shop">
        {columns.map((col) => (
          <div key={col.title}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{col.title}</p>
            <ul className="space-y-0.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} prefetch={false} className="block rounded-lg px-2 py-1.5 text-sm text-ink hover:bg-raised">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The desktop nav's items (lg and up). NavLink marks the current one; "All sealed" carries its dropdown. */
export function HeaderNavItems({ items }: { items: HeaderNavItem[] }) {
  return (
    <>
      {items.map((n) => {
        const link = (
          <NavLink
            key={n.label}
            href={n.href}
            also={n.also}
            className={`${n.xl ? "hidden xl:inline-flex" : ""} whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors`}
          >
            {n.label}
          </NavLink>
        );
        return n.menu ? (
          <div key={n.label} className="group relative">
            {link}
            <ShopMenuPanel columns={n.menu} />
          </div>
        ) : (
          link
        );
      })}
    </>
  );
}

function retargetItems(items: HeaderNavItem[], to: Region): HeaderNavItem[] {
  return items.map((n) => ({
    ...n,
    href: retargetHref(n.href, to),
    also: n.also?.map((h) => retargetHref(h, to)),
    menu: n.menu?.map((c) => ({ ...c, links: c.links.map((l) => ({ ...l, href: retargetHref(l.href, to) })) })),
  }));
}

/**
 * A page with no region of its own (the landing page, About, the legal pages, a 404) gets the whole header too, for the visitor's
 * region (RegionSuggest.tsx useSoftRegion): the server's HTML has the default region's links, the browser moves them. Only these
 * pages ask; a region page never runs the suggestion (it would cost a /api/geo call per view).
 */
export function SoftHeaderNavItems({ items }: { items: HeaderNavItem[] }) {
  return <HeaderNavItems items={retargetItems(items, useSoftRegion())} />;
}

/** The header's search box, for the visitor's region. Keyed by it: a new region is a new index. */
export function SoftSearchBox() {
  const region = useSoftRegion();
  return <SearchBox key={region} region={region} size="sm" />;
}

/** The header's region button on a page with no region: shows the visitor's, and a pick switches the page in place. */
export function SoftRegionSwitcher() {
  return <RegionSwitcher region={useSoftRegion()} compact soft />;
}
