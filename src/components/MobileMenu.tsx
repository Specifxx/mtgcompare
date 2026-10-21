"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { REGION_LIST, REGIONS, type Region } from "@/lib/regions";
import { sectionHref, type SectionKey } from "@/lib/site";
import { Icon, type IconName } from "./Icon";
import { LogoMark } from "./Logo";
import { isActivePath } from "./NavLink";
import { regionSwitchHref } from "./RegionSwitcher";

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

/** The phone menu's rows, in order (all under /<region>). */
export const MENU_ROWS: { key: SectionKey; label: string; glyph: IconName | GlyphName }[] = [
  { key: "deals", label: "Deals", glyph: "tag" },
  { key: "thisWeek", label: "This week", glyph: "clock" },
  { key: "sealed", label: "All sealed", glyph: "grid" },
  { key: "boosterBoxes", label: "Booster boxes", glyph: "cube" },
  { key: "etbs", label: "ETBs", glyph: "etb" },
  { key: "bundles", label: "Booster bundles", glyph: "bundle" },
  { key: "perPack", label: "Cheapest per pack", glyph: "pack" },
  { key: "sets", label: "Sets", glyph: "layers" },
  { key: "releases", label: "Releases", glyph: "calendar" },
  { key: "guides", label: "Guides", glyph: "book" },
  { key: "stores", label: "Where to buy", glyph: "store" },
];

/**
 * The menu button and its sheet: a native modal <dialog> (showModal: the page behind is inert, focus stays inside, Escape closes
 * it, and focus returns to the button), drawn as a full-width sheet from the top of the screen. It closes on any link (the
 * pathname effect catches back/forward too). The sheet's contents are rendered on the first open, not in the server's HTML:
 * every link in it is in the footer already, and leaving it out keeps about 14 KB of markup off every page.
 */
export function MobileMenu({ region, className = "" }: { region: Region | null; className?: string }) {
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
        {ready && <MenuSheet region={region} pathname={pathname} onClose={close} />}
      </dialog>
    </>
  );
}

/**
 * The sheet: on a region page, the sections, then the seven regions (the same page in each); on a page with no region, the regions
 * first, as the thing to choose. Then About and Contact.
 */
export function MenuSheet({ region, pathname, onClose: close }: { region: Region | null; pathname: string; onClose: () => void }) {
  const current = region ? REGIONS[region] : null;
  return (
    <div className="page pb-5">
      <div className="flex h-[var(--hdr)] items-center gap-3 border-b border-line">
        <LogoMark className="h-8 w-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight">
          {current ? (
            <>
              <span aria-hidden="true">{current.flag}</span> DexCompare {current.name}
            </>
          ) : (
            "DexCompare"
          )}
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

      {current && (
        <nav aria-label="Sections" className="mt-3">
          <ul className="grid gap-0.5 sm:grid-cols-2 sm:gap-x-4">
            {MENU_ROWS.map((row) => {
              const href = sectionHref(current.region, row.key);
              const active = isActivePath(pathname, href);
              return (
                <li key={row.key}>
                  <Link
                    href={href}
                    prefetch={false}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={`group flex min-h-11 items-center gap-3 rounded-xl px-2 text-[15px] font-medium transition-colors hover:bg-raised ${active ? "bg-raised" : ""}`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-brand-soft text-brand-strong" : "bg-raised text-muted group-hover:text-ink"}`}
                    >
                      <Glyph name={row.glyph} />
                    </span>
                    <span className="flex-1">{row.label}</span>
                    <Icon name="arrow-right" size={16} className="text-faint" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className={current ? "mt-5 border-t border-line pt-4" : "mt-4"}>
        <h2 className="eyebrow mb-2.5">{current ? "Region" : "Choose your region"}</h2>
        <ul className={`grid gap-2 ${current ? "grid-cols-4 sm:grid-cols-7" : "grid-cols-2 sm:grid-cols-4"}`}>
          {REGION_LIST.map((r) => {
            const on = r.region === region;
            return (
              <li key={r.region}>
                <Link
                  href={regionSwitchHref(pathname, r.region, region)}
                  prefetch={false}
                  onClick={close}
                  aria-current={on ? "true" : undefined}
                  aria-label={current ? `${r.name} (${r.currency})` : undefined}
                  className={`flex min-h-14 items-center rounded-xl border transition-colors ${
                    current ? "flex-col justify-center gap-0.5 py-1.5" : "gap-2.5 px-3 py-2"
                  } ${on ? "border-ink bg-raised" : "border-line hover:border-ink/30"}`}
                >
                  <span className="text-2xl leading-none" aria-hidden="true">
                    {r.flag}
                  </span>
                  {current ? (
                    <span className="text-xs font-semibold text-muted">{r.short}</span>
                  ) : (
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{r.name}</span>
                      <span className="block text-xs text-muted">{r.currency}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
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
