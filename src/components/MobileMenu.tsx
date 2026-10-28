"use client";

import Link from "@/components/Link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { retargetGroups, type NavGroup } from "@/lib/nav";
import { REGION_LIST, REGIONS, type Region } from "@/lib/regions";
import type { SectionKey } from "@/lib/site";
import { Icon, type IconName } from "./Icon";
import { LogoMark } from "./Logo";
import { isActivePath } from "./NavLink";
import { pickRegion, useSoftRegion } from "./RegionSuggest";
import { regionSwitchFollow, regionSwitchHref } from "./RegionSwitcher";

// The menu's own few shapes, drawn like Icon.tsx's (24×24, 2px round strokes, currentColor) for the rows Icon has no shape for.
// Functions, like Icon's, so no JSX runs when the module loads.
const GLYPHS = {
  grid: () => (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  cube: () => (
    <>
      <path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5z" />
      <path d="m3 7.5 9 4.5 9-4.5M12 12v9" />
    </>
  ),
  etb: () => (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M3 5h18v4H3zM10 13h4" />
    </>
  ),
  bundle: () => (
    <>
      <rect x="8" y="4" width="8" height="16" rx="1" />
      <path d="M5 6v12M19 6v12" />
    </>
  ),
  pack: () => (
    <>
      <path d="M7 3h10v18H7z" />
      <path d="M7 6.5h10M7 17.5h10" />
    </>
  ),
  layers: () => (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
    </>
  ),
  book: () => (
    <>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />
    </>
  ),
} satisfies Record<string, () => ReactNode>;
type GlyphName = keyof typeof GLYPHS;

/** A menu row's icon: Icon.tsx's shape, or one of the menu's own (GLYPHS). Shared with the 404's "Where to next" tiles. */
export function Glyph({ name }: { name: IconName | GlyphName }) {
  if (!(name in GLYPHS)) return <Icon name={name as IconName} size={20} />;
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true" focusable="false">
      {GLYPHS[name as GlyphName]()}
    </svg>
  );
}

/** The site's main sections with their glyphs, in order (all under /<region>): the 404's "Where to next" tiles. */
export const MENU_ROWS: { key: SectionKey; label: string; glyph: IconName | GlyphName }[] = [
  { key: "deals", label: "Deals", glyph: "tag" },
  { key: "blackFriday", label: "Black Friday", glyph: "tag" },
  { key: "thisWeek", label: "This week", glyph: "clock" },
  { key: "backInStock", label: "Back in stock", glyph: "check" },
  { key: "priceMoves", label: "Price moves", glyph: "tag" },
  { key: "outOfPrint", label: "Older sets in stock", glyph: "layers" },
  { key: "sealed", label: "All sealed", glyph: "grid" },
  { key: "boosterBoxes", label: "Play Booster Boxes", glyph: "cube" },
  { key: "collectorBoxes", label: "Collector boxes", glyph: "etb" },
  { key: "bundles", label: "Bundles", glyph: "bundle" },
  { key: "perPack", label: "Cheapest per pack", glyph: "pack" },
  { key: "sets", label: "Sets", glyph: "layers" },
  { key: "releases", label: "Releases", glyph: "calendar" },
  { key: "guides", label: "Guides", glyph: "book" },
  { key: "tools", label: "Tools", glyph: "check" },
  { key: "stores", label: "Where to buy", glyph: "store" },
];

/**
 * The menu button and its sheet: a native modal <dialog> (showModal: the page behind is inert, focus stays inside, Escape closes
 * it, and focus returns to the button), drawn as a full-width sheet from the top of the screen. It closes on any link (the
 * pathname effect catches back/forward too). The sheet's contents are rendered on the first open, not in the server's HTML:
 * every link in it is in the footer or the header already, and leaving it out keeps the markup off every page.
 *
 * `groups`: lib/nav.ts navGroups, built on the server for `built` (the page's region, or the default on a page with none, where
 * the sheet follows the visitor's region instead: RegionSuggest.tsx useSoftRegion, asked only once the menu opens).
 */
export function MobileMenu({ region, groups, built, className = "" }: { region: Region | null; groups: NavGroup[]; built: Region; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const close = () => ref.current?.close();

  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => {
          // The contents first (synchronously), so showModal() finds the close button to focus.
          if (!ready) flushSync(() => setReady(true));
          ref.current?.showModal();
          setOpen(true);
        }}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-ink/30 ${className}`}
      >
        <Icon name="menu" size={20} />
      </button>
      <dialog
        ref={ref}
        id="site-menu"
        data-menu=""
        aria-label="Menu"
        onClose={() => setOpen(false)}
        // A click on the backdrop lands on the <dialog> itself (everything visible is inside the inner box).
        onClick={(e) => e.target === ref.current && close()}
        className="menu-sheet fixed inset-x-0 bottom-auto top-0 m-0 h-auto max-h-[100dvh] w-full max-w-none overflow-y-auto overscroll-contain rounded-b-2xl border-0 bg-surface p-0 text-ink shadow-lift"
      >
        {ready &&
          (region ? (
            <MenuSheet region={region} groups={groups} pathname={pathname} onClose={close} />
          ) : (
            <SoftMenuSheet groups={groups} built={built} pathname={pathname} onClose={close} />
          ))}
      </dialog>
    </>
  );
}

/** The sheet on a page with no region of its own: the visitor's region's links, and a region tile switches the page in place. */
function SoftMenuSheet({ groups, built, pathname, onClose }: { groups: NavGroup[]; built: Region; pathname: string; onClose: () => void }) {
  const region = useSoftRegion();
  return <MenuSheet region={region} groups={region === built ? groups : retargetGroups(groups, region)} pathname={pathname} onClose={onClose} soft />;
}

/**
 * The sheet: everything the site has, grouped as the desktop sidebar is (lib/nav.ts: product types, sets, deals and stock, the rest),
 * then the seven regions (the same page in each; on a `soft` page, a pick that switches the page in place), then About and Contact.
 */
export function MenuSheet({
  region,
  groups,
  pathname,
  onClose: close,
  soft = false,
}: {
  region: Region;
  groups: NavGroup[];
  pathname: string;
  onClose: () => void;
  soft?: boolean;
}) {
  const current = REGIONS[region];
  // On a soft page the region tiles are judged as on a page with no region: each goes to its home.
  const from = soft ? null : region;
  return (
    <div className="page pb-5">
      <div className="flex h-[var(--hdr)] items-center gap-3 border-b border-line">
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight">
          <span aria-hidden="true">{current.flag}</span> MTG Compare {current.name}
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Close menu"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:border-ink/30"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <nav aria-label="Sections" className="mt-1">
        {groups.map((g) => (
          <section key={g.title} className="border-b border-line py-3">
            <h2 className="eyebrow mb-1.5 px-2">{g.title}</h2>
            <ul className="grid grid-cols-2 gap-x-2 sm:grid-cols-3">
              {g.links.map((l) => {
                const active = isActivePath(pathname, l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      prefetch={false}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={`flex min-h-11 items-center rounded-xl px-2 py-1.5 text-[15px] font-medium leading-5 transition-colors hover:bg-raised ${active ? "bg-raised text-brand-strong" : ""}`}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="mt-4">
        <h2 className="eyebrow mb-2.5 px-2">Region</h2>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {REGION_LIST.map((r) => {
            const on = r.region === region;
            return (
              <li key={r.region}>
                <Link
                  href={regionSwitchHref(pathname, r.region, from)}
                  prefetch={false}
                  rel={!on && !regionSwitchFollow(pathname, from) ? "nofollow" : undefined}
                  onClick={(e) => {
                    if (soft && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0)) {
                      e.preventDefault();
                      pickRegion(r.region);
                    }
                    close();
                  }}
                  aria-current={on ? "true" : undefined}
                  aria-label={`${r.name} (${r.currency})`}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl border py-1.5 transition-colors ${on ? "border-ink bg-raised" : "border-line hover:border-ink/30"}`}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {r.flag}
                  </span>
                  <span className="text-xs font-semibold text-muted">{r.short}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 px-2 text-sm">
        <Link href="/about" prefetch={false} onClick={close} className="inline-flex min-h-10 items-center text-muted hover:text-ink">
          About &amp; how it works
        </Link>
        <Link href="/contact" prefetch={false} onClick={close} className="inline-flex min-h-10 items-center text-muted hover:text-ink">
          Contact
        </Link>
      </p>
    </div>
  );
}
