"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { ProductCardData } from "@/lib/data";
import { cardOpen, expandCard, type CompactCard } from "@/lib/compact";
import { pctOf } from "@/lib/format";
import { loadIndex, peekIndex } from "@/lib/index-client";
import { packsForLabel, perPackCents } from "@/lib/packs";
import type { Region } from "@/lib/regions";
import { BROWSE_QUERY_EVENT, queryWords, relevanceCompare, searchCards } from "@/lib/search-index";
import { PRODUCT_TYPES, TYPE_BY_SLUG, typeRank } from "@/lib/sealed-title";
import { SET_BY_SLUG, SETS } from "@/lib/sets";
import { NoPreFooter } from "./Ebay";
import { Icon } from "./Icon";
import { MarketplaceSearch } from "./Marketplaces";
import { pageHref, Pagination } from "./Pagination";
import { ProductGrid } from "./ProductGrid";
import { QueryEbayBox } from "./QueryEbayBox";

type Sort = "relevance" | "price-asc" | "price-desc" | "per-pack" | "saving" | "newest" | "stores";
const SORTS: { value: Sort; label: string }[] = [
  { value: "relevance", label: "Recommended" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "per-pack", label: "Price per pack" },
  { value: "saving", label: "Biggest saving vs median" },
  { value: "newest", label: "Newest set" },
  { value: "stores", label: "Most stores in stock" },
];
const isSort = (v: string | null): v is Sort => SORTS.some((s) => s.value === v);
/** Rows per page and per "Show more": data.ts PAGE_SIZE (data.ts reads the database, so the browser can't import it). */
const PAGE = 48;

type IndexState = { status: "idle" | "loading" | "error" } | { status: "ready"; cards: ProductCardData[] };

const cmp = (x: number, y: number) => (x === y ? 0 : x < y ? -1 : 1); // Infinity-safe, unlike x - y
const price = (p: ProductCardData) => (cardOpen(p) ? p.lowestPriceCents ?? Infinity : Infinity);
// Per pack: only products whose line fixes a pack count; the rest follow.
const perPack = (p: ProductCardData) => (cardOpen(p) ? perPackCents(p.lowestPriceCents, packsForLabel(p.productType, p.setCode, p.name)) ?? Infinity : Infinity);
// Saving vs the median of in-stock stores (three or more): most below first.
const saving = (p: ProductCardData) => (cardOpen(p) && p.inStockStores >= 3 ? pctOf(p.lowestPriceCents ?? 0, p.medianOpenCents) ?? Infinity : Infinity);

function sorter(sort: Exclude<Sort, "relevance">): (a: ProductCardData, b: ProductCardData) => number {
  switch (sort) {
    case "price-asc":
      return (a, b) => cmp(price(a), price(b)) || relevanceCompare(a, b);
    case "price-desc":
      return (a, b) => cmp(cardOpen(b) ? b.lowestPriceCents ?? 0 : -1, cardOpen(a) ? a.lowestPriceCents ?? 0 : -1) || relevanceCompare(a, b);
    case "per-pack":
      return (a, b) => cmp(perPack(a), perPack(b)) || cmp(price(a), price(b)) || relevanceCompare(a, b);
    case "saving":
      return (a, b) => cmp(saving(a), saving(b)) || cmp(price(a), price(b)) || relevanceCompare(a, b);
    case "stores":
      // Independent stores only; TCGplayer-only products follow, cheapest first.
      return (a, b) => b.inStockStores - a.inStockStores || cmp(price(a), price(b)) || relevanceCompare(a, b);
    case "newest":
      return (a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "") || typeRank(a.productType) - typeRank(b.productType) || relevanceCompare(a, b);
  }
}

// Product cards from the 9th grid cell on (below the first screen at every width: four cards, the strip, three more) skip layout and
// paint until they come near the viewport (content-visibility: auto), with a placeholder height computed like the card's own (a
// square photo the column's width plus its text), so the page's first long task and its hydration do far less work: phone TBT at
// 4× CPU drops by about a quarter. Ad cells (data-ad, the strip's row, the reserved tile) are never skipped: their units measure
// themselves. Content stays in the accessibility tree and find-in-page. Inline because globals.css is the shell's.
const CARD = ".browse-cv>.grid>:nth-child(n+9):not([data-ad]):has(>a)";
const OFFSCREEN_CARDS_CSS = [
  `${CARD}{content-visibility:auto;contain-intrinsic-size:auto calc((100vw - 44px)/2 + 180px)}`,
  `@media (min-width:640px){${CARD}{contain-intrinsic-size:auto calc((100vw - 64px)/2 + 175px)}}`,
  `@media (min-width:768px){${CARD}{contain-intrinsic-size:auto calc((100vw - 80px)/3 + 170px)}}`,
  `@media (min-width:1024px){${CARD}{contain-intrinsic-size:auto calc((min(100vw,1200px) - 96px)/4 + 160px)}}`,
].join("");

/** A filter-panel icon (sliders); Icon.tsx has no such name. */
function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  );
}

// Filters live in the URL (?q=&type=&set=&stock=&sort=) so a filtered view can be shared, and type and set pages can link to one
// (/us/sealed?type=booster-boxes&stock=in). They're read AFTER hydration, not through useSearchParams: the cached HTML then always
// holds the unfiltered page for crawlers, instead of a loading fallback.
//
// Unfiltered, the grid is the page's 48 server rows (lib/browse-data.ts marketPage) with real <a> links to the other pages
// (`${base}/page/N`, each a cached render), so every product is reachable from HTML. As soon as a filter, a sort or a search is
// used, the grid loads the region's index (/api/browse/<region>, CDN-cached, once per page session) and works over every product,
// with "Show more". While it loads, the 48 rows stay (dimmed) and the count line says so; if it fails, the filters work over the
// 48 rows and say that too.
//
// No layout shift: the grid is keyed by mode and index state, so a reorder that no one asked for (the index arriving) builds new
// cards instead of moving old ones; a filtered list keeps at least a screen's height, so the footer never jumps into view; the
// count line has a fixed height; the phone's filter sheet is a modal <dialog> over the page.
export function BrowseGrid({ rows, total, region, base, page = 1, strip }: { rows: CompactCard[]; total: number; region: Region; base: string; page?: number; strip?: ReactNode }) {
  const pageCards = useMemo(() => rows.map(expandCard), [rows]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [set, setSet] = useState("");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>("relevance");
  const [limit, setLimit] = useState(PAGE);
  const [touched, setTouched] = useState(false);
  const [index, setIndex] = useState<IndexState>({ status: "idle" });
  const [sheetUsed, setSheetUsed] = useState(false); // the sheet's contents render once it is first opened: not in the HTML
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const loading = useRef(false);
  const ids = useId();

  const qOn = queryWords(q).length > 0;
  const any = !!(qOn || type || set || inStock || sort !== "relevance");
  const activeFilters = Number(!!type) + Number(!!set) + Number(inStock) + Number(sort !== "relevance");

  const ensureIndex = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    const have = peekIndex(region);
    if (have) {
      setIndex({ status: "ready", cards: have.cards });
      return;
    }
    setIndex({ status: "loading" });
    loadIndex(region).then(
      (ix) => setIndex({ status: "ready", cards: ix.cards }),
      () => {
        loading.current = false; // a later filter (or "Try again") retries
        setIndex({ status: "error" });
      },
    );
  }, [region]);

  // After a change the visitor made: if the results start above the screen (they had scrolled down the list), bring their top
  // back to just under the sticky bar.
  const reveal = useCallback(() => {
    requestAnimationFrame(() => {
      const el = statusRef.current;
      const bar = barRef.current;
      if (!el || !bar) return;
      const stuck = getComputedStyle(bar).position === "sticky";
      const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 60;
      const offset = (stuck ? bar.getBoundingClientRect().bottom : hdr) + 8;
      const top = el.getBoundingClientRect().top;
      if (top < offset) window.scrollTo({ top: window.scrollY + top - offset });
    });
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ(p.get("q") ?? "");
    const t = p.get("type");
    if (t && TYPE_BY_SLUG.has(t)) setType(t);
    const s = p.get("set");
    if (s && SET_BY_SLUG.has(s)) setSet(s);
    setInStock(p.get("stock") === "in");
    const so = p.get("sort");
    if (isSort(so)) setSort(so);
    setTouched(true);
    // A search box on this page (the header's) hands its query here instead of navigating to the page already open.
    const onQuery = (e: Event) => {
      const term = (e as CustomEvent<unknown>).detail;
      if (typeof term !== "string") return;
      setQ(term);
      reveal();
    };
    window.addEventListener(BROWSE_QUERY_EVENT, onQuery);
    return () => window.removeEventListener(BROWSE_QUERY_EVENT, onQuery);
  }, [reveal]);

  useEffect(() => {
    if (!touched) return;
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (type) p.set("type", type);
    if (set) p.set("set", set);
    if (inStock) p.set("stock", "in");
    if (sort !== "relevance") p.set("sort", sort);
    const qs = p.toString();
    // A filtered view is the whole list, so it lives on the bare URL, not /page/N; cleared, the URL is this page's own again.
    const next = qs ? `${base}?${qs}` : pageHref(base, page);
    if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, "", next);
    setLimit(PAGE);
  }, [q, type, set, inStock, sort, base, page, touched]);

  useEffect(() => {
    if (any) ensureIndex();
  }, [any, ensureIndex]);

  const ready = index.status === "ready" ? index.cards : null;
  const pool = ready ?? pageCards;
  const typeLabel = TYPE_BY_SLUG.get(type)?.label;
  const setInfo = SET_BY_SLUG.get(set);

  const filtered = useMemo(() => {
    if (!any) return pageCards;
    let list = qOn ? searchCards(pool, q) : [...pool];
    list = list.filter((p) => (!typeLabel || p.productType === typeLabel) && (!setInfo || p.setCode === setInfo.code) && (!inStock || cardOpen(p)));
    // "Recommended" with a search keeps the search's own order (lib/search-index.ts searchCards); without one, the browse order.
    if (sort !== "relevance") list.sort(sorter(sort));
    else if (!qOn) list.sort(relevanceCompare);
    return list;
  }, [any, pageCards, pool, q, qOn, typeLabel, setInfo, inStock, sort]);

  // The sets and types the region has, once the index says so; until then every set (no option list ever shrinks under a
  // visitor who has it open) and every type (a type the region lacks is shown disabled, not removed, so the chips never move).
  const setOptions = useMemo(() => {
    if (!touched) return []; // the 75 sets are added after hydration: kept out of the cached HTML (the select is a fixed width)
    if (!ready) return SETS;
    const codes = new Set(ready.map((p) => p.setCode));
    return SETS.filter((s) => codes.has(s.code) || s.slug === set);
  }, [ready, set, touched]);
  const typesPresent = useMemo(() => (ready ? new Set(ready.map((p) => p.productType)) : null), [ready]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const waiting = any && (index.status === "loading" || index.status === "idle");
  const shown = useMemo(() => (!any || waiting ? pageCards : filtered.slice(0, limit)), [any, waiting, pageCards, filtered, limit]);
  const count = filtered.length;
  // With nothing here, offer the same search on the marketplaces: the words typed, else the set and type picked.
  const elsewhere = (q.trim() || [setInfo?.name, typeLabel].filter(Boolean).join(" ")).slice(0, 100);

  const change = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    reveal();
  };
  const clearAll = () => {
    setQ("");
    setType("");
    setSet("");
    setInStock(false);
    setSort("relevance");
    reveal();
  };

  // The strip slot after the first four results: the page's listing strip unfiltered (page 1), the query's marketplace box with a
  // search that has results, nothing otherwise (a filter by set or type is the site's own browsing, not a query to send out).
  const showBox = qOn && !waiting && count > 0;
  // The grid element is memoised: a render of the grid's surroundings alone (the URL read just after hydration, the index loading)
  // reuses it, so React skips its 48 cards instead of re-rendering them for nothing.
  // While the index loads, the grid is the page's own, unchanged (strip included), only dimmed.
  const pageMode = !any || waiting;
  const gridKey = pageMode ? "page" : `all:${index.status}`;
  const grid = useMemo(
    () => <ProductGrid key={gridKey} products={shown} region={region} eager={pageMode ? 8 : 4} tiles="browse" strip={pageMode ? strip : showBox ? <QueryEbayBox region={region} q={q} /> : undefined} />,
    [gridKey, shown, region, pageMode, strip, showBox, q],
  );

  const typeChips = () => (
    <>
      <button
        type="button"
        onClick={() => change(setType)("")}
        className={`chip min-h-10 shrink-0 ${type === "" ? "chip-on" : ""}`}
        aria-pressed={type === ""}
      >
        All types
      </button>
      {PRODUCT_TYPES.map((t) => {
        const absent = !!typesPresent && !typesPresent.has(t.label) && type !== t.slug;
        return (
          <button
            key={t.slug}
            type="button"
            disabled={absent}
            onClick={() => change(setType)(type === t.slug ? "" : t.slug)}
            className={`chip min-h-10 shrink-0 disabled:cursor-default disabled:opacity-45 ${type === t.slug ? "chip-on" : ""}`}
            aria-pressed={type === t.slug}
            title={absent ? `No ${t.plural.toLowerCase()} listed in this region` : undefined}
          >
            {t.plural}
          </button>
        );
      })}
    </>
  );

  const stockToggle = (
    <button type="button" onClick={() => change(setInStock)(!inStock)} className={`chip min-h-10 shrink-0 ${inStock ? "chip-on" : ""}`} aria-pressed={inStock}>
      <span className={`h-2 w-2 rounded-full ${inStock ? "bg-open" : "bg-faint"}`} aria-hidden="true" /> In stock only
    </button>
  );

  const setSelect = (id: string, className: string, label?: string) => (
    <select id={id} value={set} onChange={(e) => change(setSet)(e.target.value)} aria-label={label} className={className}>
      <option value="">All sets</option>
      {setOptions.map((s) => (
        <option key={s.code} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  );
  const sortSelect = (id: string, className: string, label?: string) => (
    <select id={id} value={sort} onChange={(e) => change(setSort)(e.target.value as Sort)} aria-label={label} className={className}>
      {SORTS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
  const selectClass = "h-11 min-w-0 rounded-full border border-line bg-raised px-3 text-sm";

  return (
    <div>
      {/* One bar for every width: on a phone a single sticky row (search + Filters), at md the full panel in the page, and from lg the
          full panel sticky. It sticks just under the header (--hdr, globals.css), so the input is never hidden behind it. */}
      <div
        ref={barRef}
        onFocusCapture={ensureIndex}
        onPointerDownCapture={ensureIndex}
        className="card sticky top-[calc(var(--hdr)+0.5rem)] z-30 mb-3 flex flex-col gap-3 p-2 before:pointer-events-none before:absolute before:-left-4 before:-right-4 before:-top-[calc(0.5rem+1px)] before:h-2 before:bg-bg md:static md:mb-4 md:p-4 md:before:hidden lg:sticky lg:before:block"
      >
        <div className="flex items-center gap-2 md:gap-3">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-raised px-4 transition-shadow focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <Icon name="search" size={16} className="text-faint" />
            <input
              value={q}
              onChange={(e) => change(setQ)(e.target.value)}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search products"
              aria-label="Filter products"
              className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint focus-visible:outline-none md:text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              ensureIndex();
              flushSync(() => setSheetUsed(true)); // rendered before showModal(), so it focuses the sheet's first control
              sheetRef.current?.showModal();
            }}
            className="btn-ghost relative h-11 shrink-0 px-4 md:hidden"
            aria-haspopup="dialog"
          >
            <SlidersIcon /> <span className="max-[359px]:sr-only">Filters</span>
            {activeFilters > 0 && (
              <span className="tabular -mr-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-brand-ink">
                {activeFilters}
                <span className="sr-only"> active</span>
              </span>
            )}
          </button>
          <div className="hidden gap-3 md:flex">
            {setSelect(`${ids}-set-d`, `${selectClass} md:w-48`, "Set")}
            {sortSelect(`${ids}-sort-d`, `${selectClass} md:w-56`, "Sort")}
          </div>
        </div>
        <div className="scroller hidden gap-2 md:flex" role="group" aria-label="Product type and stock">
          {stockToggle}
          {typeChips()}
        </div>
      </div>

      {/* Phone: the filters as a bottom sheet. A native modal dialog: focus stays inside, Esc and the backdrop close it. Every
          change applies at once (the results update behind it); Done closes it. */}
      <dialog
        ref={sheetRef}
        aria-label="Filters"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        onClose={reveal}
        className="m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col rounded-t-2xl border border-b-0 border-line bg-surface p-0 text-ink shadow-lift backdrop:bg-black/50 open:flex md:hidden"
      >
        {sheetUsed && (
          <>
            <div className="flex items-center justify-between border-b border-line py-1 pl-5 pr-2">
              <h2 className="font-display text-lg font-bold">
                Filters
              </h2>
              <button type="button" onClick={() => sheetRef.current?.close()} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-raised" aria-label="Close filters">
                <Icon name="close" />
              </button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5">
              <div className="grid gap-4 min-[360px]:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor={`${ids}-set-m`}>
                  Set
                  {setSelect(`${ids}-set-m`, `${selectClass} w-full font-normal`)}
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor={`${ids}-sort-m`}>
                  Sort by
                  {sortSelect(`${ids}-sort-m`, `${selectClass} w-full font-normal`)}
                </label>
              </div>
              <div role="group" aria-labelledby={`${ids}-stock`}>
                <div id={`${ids}-stock`} className="mb-2 text-sm font-semibold">
                  Stock
                </div>
                {stockToggle}
              </div>
              <div role="group" aria-labelledby={`${ids}-types`}>
                <div id={`${ids}-types`} className="mb-2 text-sm font-semibold">
                  Type
                </div>
                <div className="flex flex-wrap gap-2">{typeChips()}</div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-line px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={clearAll} disabled={!any} className="btn-ghost h-11 flex-1">
                Clear
              </button>
              <button type="button" onClick={() => sheetRef.current?.close()} className="btn-primary h-11 flex-[2]">
                {any && index.status === "ready" ? `Show ${count.toLocaleString("en")} ${count === 1 ? "product" : "products"}` : "Done"}
              </button>
            </div>
          </>
        )}
      </dialog>

      <div ref={statusRef} className="mb-3 flex min-h-11 items-center justify-between gap-3 text-sm text-muted">
        <p className="line-clamp-2 min-w-0" aria-live="polite">
          {!any ? (
            <>
              <b className="text-ink">{total.toLocaleString("en")}</b> {total === 1 ? "product" : "products"}
              {pages > 1 && ` · page ${page} of ${pages}`}
            </>
          ) : waiting ? (
            <>Loading all {total.toLocaleString("en")} products…</>
          ) : (
            <>
              <b className="text-ink">{count.toLocaleString("en")}</b> {count === 1 ? "product" : "products"}
              {inStock ? " in stock" : ""}
              {qOn && <> for &ldquo;{q.trim()}&rdquo;</>}
              {index.status === "error" && (
                <>
                  {" "}
                  on this page — the full list didn&rsquo;t load.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      ensureIndex();
                    }}
                    className="font-semibold text-brand hover:underline"
                  >
                    Try again
                  </button>
                </>
              )}
            </>
          )}
        </p>
        {any && (
          <button type="button" onClick={clearAll} className="chip min-h-10 shrink-0">
            Clear filters <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <div className={any ? "min-h-[100svh]" : undefined}>
        {shown.length ? (
          <div className={`browse-cv transition-opacity duration-200 ${waiting ? "opacity-60" : ""}`} aria-busy={waiting || undefined}>
            <style dangerouslySetInnerHTML={{ __html: OFFSCREEN_CARDS_CSS }} />
            {grid}
          </div>
        ) : !any ? (
          <div className="card px-6 py-12 text-center text-muted">No products are listed here yet. Stores are read about twice a day.</div>
        ) : (
          <div className="card px-6 py-12 text-center text-muted">
            <NoPreFooter />
            <p className="font-display text-lg font-bold text-ink">Nothing matches those filters.</p>
            <p className="mt-1 text-sm">Try fewer words, another set, or every type.</p>
            <button type="button" onClick={clearAll} className="chip mt-4 min-h-10">
              Clear filters <Icon name="close" size={14} />
            </button>
            {elsewhere && <MarketplaceSearch region={region} query={elsewhere} placement="browse-empty" />}
          </div>
        )}

        {any ? (
          !waiting &&
          count > limit && (
            <div className="mt-8 flex justify-center">
              <button type="button" onClick={() => setLimit((n) => n + PAGE)} className="btn-ghost h-11 px-6">
                Show more ({(count - limit).toLocaleString("en")} left)
              </button>
            </div>
          )
        ) : (
          <Pagination base={base} page={page} pages={pages} />
        )}
      </div>
    </div>
  );
}
