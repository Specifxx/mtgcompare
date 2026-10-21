"use client";

import { track } from "@vercel/analytics";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { ProductCardData } from "@/lib/data";
import { money, plural } from "@/lib/format";
import { thumb } from "@/lib/images";
import { BROWSE_QUERY_EVENT, isBrowsePath, loadIndex, peekIndex, searchHref, searchOptions, type LoadedIndex, type SearchOption } from "@/lib/index-client";
import { REGIONS, type Region } from "@/lib/regions";
import { Icon } from "./Icon";
import { StockPill } from "./StockPill";

// The site's search box: the header's (size "sm") and the region home hero's ("lg"). Props are unchanged from before the typeahead:
// { region, size = "sm", autoFocus = false }, so every existing mount keeps working.
//
// Typeahead. On the first focus or keystroke the box loads the region's browse index (lib/index-client.ts: one CDN-cached JSON per
// region, once per page session) and the ranking code (lib/search-index.ts, a chunk of its own, so a page that is never searched
// never parses it); from then on every keystroke is ranked in the browser (rankSearch): the database never sees a query. Up to 8
// products (photo, name, price, stock) and, last, "See all results for “…”", the browse page filtered by the same words.
//
// An ARIA 1.2 combobox: the input keeps focus (role=combobox, aria-activedescendant); ↑ ↓ move through the options, Home and End
// jump to the first and last once one is chosen, Enter opens the chosen one (or, with none chosen, the full results), Esc closes the
// list, then clears the box. Options are real links (middle-click opens a tab) that are not tab stops.
//
// No layout shift: the list is a fixed-position layer in a portal. Below lg the header's box opens it as a sheet across the screen
// just under the header (top: var(--hdr)); anywhere else it hangs under the box, as wide as the box (the header's, at least 420px).
//
// Analytics: one search_select { kind: "product" | "all" } per choice. The words typed are never sent anywhere.

const LIMIT = 8;
/** Fewest product rows the list drops to so that it fits the screen without scrolling (a scrolling list inside a page is a trap). */
const MIN_FIT = 3;
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function trackSelect(kind: "product" | "all") {
  try {
    track("search_select", { kind });
  } catch {
    /* analytics never gets in the way of a search */
  }
}

function useDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  return desktop;
}

type Engine = typeof import("@/lib/search-index");

/** The name with the query's words in bold where they start a word. */
function Highlighted({ text, q, engine }: { text: string; q: string; engine: Engine }) {
  const ranges = engine.highlightRanges(text, q);
  if (!ranges.length) return <>{text}</>;
  const parts: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={i} className="bg-transparent font-bold text-ink">
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

// The card's own stock line (ProductCard's words), from the index row alone: open = a store has it or TCGplayer does (compact.ts
// cardOpen); a pre-order is an open product of a set released after today (release.ts isPreorderSet, by the row's release date).
function stockLabel(p: ProductCardData, today: string): { state: "open" | "soldout"; pre: boolean; text: string } {
  const pre = !!p.releaseDate && p.releaseDate > today;
  if (p.inStockStores > 0 || p.marketplaceOpen) {
    const n = p.inStockStores;
    return { state: "open", pre, text: n ? `${pre ? "Pre-order" : "In stock"} · ${n}` : "On TCGplayer" };
  }
  return { state: "soldout", pre: false, text: p.listedStores ? plural(p.listedStores, "store") : "Sold out" };
}

export function SearchBox({ region, size = "sm", autoFocus = false }: { region: Region; size?: "sm" | "lg"; autoFocus?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const big = size === "lg";
  const desktop = useDesktop();
  const sheet = !big && !desktop; // the header's box below lg
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [ix, setIx] = useState<LoadedIndex | null>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [load, setLoad] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const [fit, setFit] = useState(LIMIT);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef(0);
  const regionRef = useRef(region);
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    regionRef.current = region;
    setIx(null);
    setLoad("idle");
  }, [region]);

  // Load the index and the ranking code on the first focus or keystroke (and again after a failure).
  const warm = useCallback(() => {
    if (load === "loading" || load === "ready") return;
    setLoad("loading");
    const have = peekIndex(region);
    Promise.all([import("@/lib/search-index"), have ?? loadIndex(region)]).then(
      ([mod, x]) => {
        if (regionRef.current !== x.region) return;
        setEngine(() => mod);
        setIx(x);
        setFit(LIMIT);
        setLoad("ready");
      },
      () => setLoad("error"),
    );
  }, [load, region]);

  const term = q.trim();
  const ranked = useMemo(() => (engine && ix && term ? engine.rankSearch(ix.cards, term, LIMIT) : { products: [], total: 0 }), [engine, ix, term]);
  const options = useMemo(() => searchOptions(region, term, { products: ranked.products.slice(0, fit), total: ranked.total }), [region, term, ranked, fit]);
  const visible = mounted && open && !!term;
  const act = active < options.length ? active : -1;

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  // Where the list goes and how tall it may be. The sheet (the header's box below lg) spans the screen under the header; otherwise
  // the list hangs under the box, follows it while the page scrolls, and closes once the box scrolls away. Heights come from the
  // VISUAL viewport, so with a phone's keyboard up the list ends above the keyboard.
  const place = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const vv = window.visualViewport;
    const vh = vv ? vv.height + vv.offsetTop : window.innerHeight;
    const hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hdr")) || 60;
    let next: CSSProperties;
    if (sheet) {
      next = { maxHeight: Math.max(160, vh - hdr) };
    } else {
      const r = form.getBoundingClientRect();
      if (big && (r.top < hdr - 4 || r.top > vh)) return close();
      const vw = document.documentElement.clientWidth;
      const width = Math.min(vw - 16, big ? r.width : Math.max(r.width, 420));
      const left = Math.max(8, Math.min(big ? r.left : r.right - width, vw - width - 8));
      const top = r.bottom + 6;
      next = { top, left, width, maxHeight: Math.max(160, vh - top - 12) };
    }
    const room = next.maxHeight as number;
    if (room > roomRef.current) setFit(LIMIT); // more room: measure again (less room trims itself, below)
    roomRef.current = room;
    setPos(next);
  }, [big, sheet, close]);

  useIsoLayoutEffect(() => {
    if (!visible) return;
    place();
    let raf = 0;
    const onMove = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const vv = window.visualViewport;
    if (!sheet) window.addEventListener("scroll", onMove, { passive: true, capture: true });
    window.addEventListener("resize", onMove);
    vv?.addEventListener("resize", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onMove, { capture: true });
      window.removeEventListener("resize", onMove);
      vv?.removeEventListener("resize", onMove);
    };
  }, [visible, sheet, place]);

  // The list never scrolls inside the page: when it would overflow its room, it shows fewer products (at least MIN_FIT; "See all"
  // always stays). Measured before paint, so the visitor never sees the longer list.
  useIsoLayoutEffect(() => {
    const box = popRef.current;
    if (!visible || !box) return;
    const over = box.scrollHeight - box.clientHeight;
    if (over <= 1) return;
    const items = box.querySelectorAll<HTMLElement>("[data-option=product]");
    let n = items.length;
    let cut = 0;
    while (n > MIN_FIT && cut < over) cut += items[--n].offsetHeight;
    if (n < items.length) setFit(n);
  });

  // Keep the chosen option in view (the list scrolls only when even MIN_FIT rows don't fit).
  useEffect(() => {
    if (visible && act >= 0) document.getElementById(optionId(act))?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, act]);

  /** The full results for `t`: the browse page, filtered. Already on it, the query goes to its grid instead (no navigation). */
  const goAll = (t: string) => {
    close();
    inputRef.current?.blur();
    if (t && isBrowsePath(pathname, region)) {
      window.dispatchEvent(new CustomEvent(BROWSE_QUERY_EVENT, { detail: t }));
      return;
    }
    router.push(searchHref(region, t));
  };

  const choose = (o: SearchOption, how: "key" | "click", e?: MouseEvent) => {
    trackSelect(o.kind);
    if (o.kind === "all") {
      e?.preventDefault();
      goAll(term);
      return;
    }
    close();
    inputRef.current?.blur();
    if (how === "key") router.push(o.href); // a click follows the link itself
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (!term) return;
        e.preventDefault();
        warm();
        if (!visible) {
          setOpen(true);
          return;
        }
        const down = e.key === "ArrowDown";
        setActive((a) => (a < 0 ? (down ? 0 : n - 1) : (a + (down ? 1 : -1) + n) % n));
        return;
      }
      case "Home":
      case "End":
        if (visible && act >= 0) {
          e.preventDefault();
          setActive(e.key === "Home" ? 0 : n - 1);
        }
        return;
      case "Escape":
        if (visible) {
          e.preventDefault();
          close();
        } else if (q) {
          e.preventDefault();
          setQ("");
        }
        return;
      case "Enter":
        if (visible && act >= 0) {
          e.preventDefault();
          choose(options[act], "key");
        }
        return;
    }
  };

  const status = !visible
    ? ""
    : load === "error"
      ? "Suggestions aren’t available right now. Press Enter to search."
      : load !== "ready"
        ? "Loading suggestions…"
        : ranked.total
          ? `${plural(ranked.total, "product")} found`
          : "No products found";
  const market = REGIONS[region].market;
  const today = new Date().toISOString().slice(0, 10);

  const list = visible ? (
    <>
      {/* Phone sheet: the page under it dims; a tap there leaves the box (blur), which closes the list. */}
      {sheet && <div aria-hidden="true" className="fixed inset-x-0 bottom-0 top-[var(--hdr)] z-40 bg-black/30" />}
      <div
        onMouseDown={(e) => e.preventDefault() /* keep focus in the box */}
        ref={popRef}
        style={pos ?? (sheet ? undefined : { visibility: "hidden" })}
        className={
          sheet
            ? "fixed inset-x-0 top-[var(--hdr)] z-50 max-h-[calc(100dvh-var(--hdr))] overflow-y-auto overscroll-contain border-b border-line bg-surface shadow-lift"
            : "fixed z-50 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lift"
        }
      >
        {(load === "loading" || load === "idle") && (
          <p className="flex items-center gap-2 px-4 pt-3 text-xs text-muted">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint" aria-hidden="true" /> Loading {REGIONS[region].adjective} products…
          </p>
        )}
        {load === "error" && <p className="px-4 pt-3 text-xs text-muted">Suggestions aren&rsquo;t available right now. Press Enter to search.</p>}
        {load === "ready" && ranked.total === 0 && (
          <p className="px-4 pt-3 text-sm text-muted">
            No product names match &ldquo;{term}&rdquo; in {REGIONS[region].inName}. Try a set name, or a type like &ldquo;ETB&rdquo;.
          </p>
        )}
        <div role="listbox" id={listId} aria-label="Search suggestions" className="py-1.5">
          {options.map((o, i) => {
            const selected = i === act;
            if (o.kind === "all") {
              return (
                <Link
                  key={o.key}
                  href={o.href}
                  prefetch={false}
                  role="option"
                  id={optionId(i)}
                  aria-selected={selected}
                  tabIndex={-1}
                  data-option="all"
                  onClick={(e) => choose(o, "click", e)}
                  onMouseMove={() => setActive(i)}
                  className={`mt-1 flex min-h-12 items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-sm font-semibold text-brand-strong ${selected ? "bg-raised" : ""}`}
                >
                  <span className="min-w-0 truncate">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-muted">
                    {o.total > options.length - 1 && (
                      <span className="tabular text-xs font-medium" aria-hidden="true">
                        {o.total.toLocaleString("en")}
                      </span>
                    )}
                    <Icon name="arrow-right" size={16} />
                  </span>
                </Link>
              );
            }
            const p = o.card;
            const img = thumb(p.imageUrl, 96);
            const s = stockLabel(p, today);
            return (
              <Link
                key={o.key}
                href={o.href}
                prefetch={false}
                role="option"
                id={optionId(i)}
                aria-selected={selected}
                tabIndex={-1}
                data-option="product"
                onClick={(e) => choose(o, "click", e)}
                onMouseMove={() => setActive(i)}
                className={`flex items-center gap-3 px-3 py-2 sm:px-4 ${selected ? "bg-raised" : ""}`}
              >
                <span className="plate flex h-10 w-10 shrink-0 items-center justify-center">
                  {img ? (
                    <img src={img} alt="" width={40} height={40} loading="lazy" decoding="async" className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <Icon name="tag" size={16} className="text-faint" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm leading-snug text-ink">
                    {engine ? <Highlighted text={p.name} q={term} engine={engine} /> : p.name}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="tabular text-xs text-muted">
                      {s.state === "open" ? (
                        <>
                          from <b className="font-semibold text-ink">{money(p.lowestPriceCents, market)}</b>
                        </>
                      ) : (
                        "Sold out"
                      )}
                    </span>
                    <StockPill state={s.state} preorder={s.pre}>
                      {s.text}
                    </StockPill>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  ) : null;

  return (
    <form
      ref={formRef}
      role="search"
      aria-label={big ? "Search sealed products" : "Header search"}
      onSubmit={(e) => {
        e.preventDefault();
        if (visible && act >= 0) return choose(options[act], "key");
        if (term) trackSelect("all");
        goAll(term);
      }}
      className={`relative flex w-full items-center gap-2 rounded-full border border-line bg-surface transition-shadow focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15 ${big ? "p-1.5 pl-5 shadow-lift" : "h-11 px-3.5 lg:h-10"}`}
    >
      <Icon name="search" size={big ? 20 : 16} className="text-faint" />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setFit(LIMIT);
          setOpen(true);
          warm();
        }}
        onFocus={() => {
          warm();
          if (term) setOpen(true);
        }}
        onBlur={close}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && act >= 0 ? optionId(act) : undefined}
        placeholder={big ? "Search a set or product — “Prismatic Evolutions ETB”" : "Search sets & products"}
        aria-label="Search sealed products"
        className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint focus-visible:outline-none ${big ? "py-2 text-base" : "text-base lg:text-sm"}`}
      />
      {big && (
        <button type="submit" className="btn-primary px-5 py-2.5">
          Search
        </button>
      )}
      <span role="status" className="sr-only">
        {status}
      </span>
      {list && createPortal(list, document.body)}
    </form>
  );
}
