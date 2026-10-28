"use client";

import Link from "@/components/Link";
import { usePathname } from "next/navigation";
import { retargetGroups, type NavGroup } from "@/lib/nav";
import { REGIONS, type Region } from "@/lib/regions";
import { isActivePath } from "./NavLink";
import { useSoftRegion } from "./RegionSuggest";

/**
 * The desktop sidebar (xl and up; owner, 2026-10-28: the empty left side of a wide screen becomes navigation): every product type,
 * the newest sets, the deal pages and the rest (lib/nav.ts navGroups), sticky under the header and scrolling on its own. Plain links
 * in the server's HTML, the current page marked. Below xl the header and the phone menu carry the same places.
 */
export function SideNav({ region, groups }: { region: Region; groups: NavGroup[] }) {
  const pathname = usePathname() || "/";
  const r = REGIONS[region];
  return (
    <aside className="hidden w-60 shrink-0 xl:block" data-sidenav="">
      <nav aria-label="Browse" className="sticky top-[var(--hdr)] max-h-[calc(100dvh-var(--hdr))] overflow-y-auto overscroll-contain py-6 pl-6 pr-3">
        <p className="mb-4 px-2 text-xs font-semibold text-muted">
          <span aria-hidden="true">{r.flag}</span> Prices in {r.name} · {r.currency}
        </p>
        {groups.map((g) => (
          <div key={g.title} className="mb-5">
            <h2 className="eyebrow mb-1 px-2">{g.title}</h2>
            <ul>
              {g.links.map((l) => {
                const active = isActivePath(pathname, l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      prefetch={false}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-lg px-2 py-1.5 text-sm leading-5 transition-colors ${active ? "bg-raised font-semibold text-ink ring-1 ring-inset ring-line" : "text-muted hover:bg-raised hover:text-ink"}`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}

/** The sidebar on a page with no region of its own: built for the default region on the server, moved to the visitor's in the browser. */
export function SoftSideNav({ built, groups }: { built: Region; groups: NavGroup[] }) {
  const region = useSoftRegion();
  return <SideNav region={region} groups={region === built ? groups : retargetGroups(groups, region)} />;
}
