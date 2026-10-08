"use client";

import { useMemo, useState } from "react";
import { CardTile } from "./CardTile";
import { COLORS, PRINTINGS, RARITIES } from "@/lib/constants";
import type { Country } from "@/lib/country";
import type { CardLite } from "@/lib/data";
import { galleryFacets, galleryFilter, gallerySort, type GalleryFilters } from "@/lib/gallery-seo";

// Client-side filter + sort over a set's gallery: every printing is rendered server-side and passed in,
// so crawlers still see every card and link; this only shows or hides tiles in
// the browser. Facet options come from the cards actually present, so an empty
// facet never appears. `initialCount` COLLAPSES (the `hidden` class), never
// slices: the server HTML keeps every card link.
export function FilterableCardGallery({ cards, country, setCode, initialCount }: { cards: CardLite[]; country: Country; setCode: string; initialCount?: number }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<GalleryFilters>({ color: null, rarity: null, printing: null });
  const [sort, setSort] = useState<"number" | "value">("number");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const facets = useMemo(() => galleryFacets(cards), [cards]);
  const shown = useMemo(() => gallerySort(galleryFilter(cards, q, f), sort), [cards, q, f, sort]);
  const activeCount = (f.color ? 1 : 0) + (f.rarity ? 1 : 0) + (f.printing ? 1 : 0);
  const clearAll = () => {
    setF({ color: null, rarity: null, printing: null });
    setQ("");
  };
  const collapsed = !expanded && initialCount != null && activeCount === 0 && !q && shown.length > initialCount;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-0 sm:max-w-xs">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or number…"
            aria-label="Search cards"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-7 pr-2.5 text-base text-white placeholder:text-slate-500 focus:border-brand-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-500/40 sm:min-h-0 sm:text-xs"
          />
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex min-h-11 flex-1 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors sm:[@media(pointer:fine)]:min-h-0 sm:flex-none ${activeCount ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 bg-ink-850 text-slate-300 hover:border-brand-500/50"}`}
        >
          Filters
          {activeCount > 0 ? <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span> : null}
          <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "number" | "value")}
          aria-label="Sort cards"
          className="min-h-11 flex-1 shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-base font-semibold text-slate-300 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 sm:[@media(pointer:fine)]:min-h-0 sm:flex-none sm:text-xs"
        >
          <option value="number">Sort: Card number</option>
          <option value="value">Sort: Most valuable</option>
        </select>
      </div>

      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
          <FacetRow label="Colour" items={facets.colors} active={f.color} onPick={(v) => setF({ ...f, color: v })} dot={(k) => COLORS[k as keyof typeof COLORS]?.hex} />
          <FacetRow label="Rarity" items={facets.rarities} active={f.rarity} onPick={(v) => setF({ ...f, rarity: v })} text={(k) => RARITIES[k]?.label ?? k} />
          <FacetRow label="Treatment" items={facets.printings} active={f.printing} onPick={(v) => setF({ ...f, printing: v })} text={(k) => PRINTINGS[k]?.label ?? k} dot={(k) => PRINTINGS[k]?.dot} />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing <span className="num text-slate-300">{collapsed ? initialCount : shown.length}</span> of <span className="num text-slate-300">{cards.length}</span> cards
        </span>
        {activeCount > 0 || q ? (
          <button type="button" onClick={clearAll} className="text-brand-400 hover:underline">
            Clear filters
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-6 text-center text-sm text-slate-400">No cards match those filters.</p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {shown.map((c, i) => (
              <div key={c.id} className={collapsed && i >= (initialCount ?? Infinity) ? "hidden" : "contents"}>
                <CardTile card={c} setCode={setCode} country={country} />
              </div>
            ))}
          </div>
          {collapsed ? (
            <div className="mt-4 flex justify-center">
              <button type="button" onClick={() => setExpanded(true)} className="btn-ghost min-h-11 text-sm">
                Show all <span className="num">{shown.length}</span> cards
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function FacetRow({
  label,
  items,
  active,
  onPick,
  dot,
  text,
}: {
  label: string;
  items: [string, number][];
  active: string | null;
  onPick: (v: string | null) => void;
  dot?: (k: string) => string | undefined;
  text?: (k: string) => string;
}) {
  if (items.length <= 1) return null; // nothing to filter on
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {items.map(([v, n]) => {
        const on = active === v;
        const d = dot?.(v);
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(on ? null : v)}
            aria-pressed={on}
            className={`chip tap-link inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold transition-colors ${on ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:border-brand-500/50 hover:text-slate-200"}`}
          >
            {d ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d }} aria-hidden /> : null}
            {text ? text(v) : v} <span className={on ? "text-brand-200/70" : "text-slate-600"}>· {n}</span>
          </button>
        );
      })}
    </div>
  );
}
